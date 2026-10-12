// Edge Function: enviar-correo-cita
// Invocada por un Database Webhook de Supabase sobre res_citas.
//
//   INSERT                        → confirmación al cliente (liga de cancelación)
//   UPDATE → estado 'cancelada'
//     cancelada_por = 'cliente'   → aviso al negocio (alguien canceló)
//     cancelada_por = 'negocio'   → aviso al cliente (el negocio canceló)
//
// Secretos requeridos (supabase secrets set):
//   RESEND_API_KEY, WEBHOOK_SECRET, APP_URL (base del deploy en Vercel)
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY vienen por defecto.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET')!
const APP_URL = Deno.env.get('APP_URL')!
// En pruebas: dominio de Resend (solo entrega al correo de tu cuenta).
// En producción: secreto CORREO_FROM con dominio verificado en Resend.
const CORREO_FROM =
  Deno.env.get('CORREO_FROM') ?? 'AgendaYa <onboarding@resend.dev>'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

async function enviarCorreo(para: string, asunto: string, html: string) {
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: CORREO_FROM,
      to: para,
      subject: asunto,
      html,
    }),
  })
  const cuerpo = await resp.json().catch(() => null)
  return { ok: resp.ok, status: resp.status, detalle: cuerpo }
}

function formatoFecha(isoUtc: string, zona: string) {
  return new Date(isoUtc).toLocaleString('es-MX', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: zona,
  })
}

async function contextoCita(cita: Record<string, string>) {
  const [{ data: negocio }, { data: servicio }] = await Promise.all([
    supabase
      .from('res_negocios')
      .select('nombre, slug, zona_horaria, correo_contacto, propietario_id')
      .eq('id', cita.negocio_id)
      .single(),
    supabase
      .from('res_servicios')
      .select('nombre, precio')
      .eq('id', cita.servicio_id)
      .single(),
  ])
  return { negocio, servicio }
}

async function correoDelNegocio(negocio: Record<string, string>) {
  if (negocio.correo_contacto) return negocio.correo_contacto
  const { data } = await supabase.auth.admin.getUserById(negocio.propietario_id)
  return data.user?.email ?? null
}

Deno.serve(async (req) => {
  if (req.headers.get('x-webhook-secret') !== WEBHOOK_SECRET) {
    return new Response('no autorizado', { status: 401 })
  }

  const { type, record, old_record } = await req.json()

  // --- Recordatorio ~24h antes (invocado por pg_cron) ---
  if (type === 'recordatorio') {
    const desde = new Date(Date.now() + 23 * 3600e3).toISOString()
    const hasta = new Date(Date.now() + 24 * 3600e3).toISOString()

    const { data: citas } = await supabase
      .from('res_citas')
      .select('*, res_negocios(nombre, zona_horaria), res_servicios(nombre)')
      .eq('estado', 'confirmada')
      .eq('recordatorio_enviado', false)
      .not('cliente_correo', 'is', null)
      .gt('inicia_en', desde)
      .lte('inicia_en', hasta)

    let enviados = 0
    for (const cita of citas ?? []) {
      const fecha = formatoFecha(
        cita.inicia_en,
        cita.res_negocios.zona_horaria
      )
      const ligaCancelar = `${APP_URL}/cancelar/${cita.token_cancelacion}`
      const resultado = await enviarCorreo(
        cita.cliente_correo,
        `Recordatorio: tu cita en ${cita.res_negocios.nombre} es mañana`,
        `
          <h2>Recordatorio de tu cita</h2>
          <p><strong>${cita.res_negocios.nombre}</strong> — ${cita.res_servicios?.nombre}</p>
          <p>${fecha}</p>
          <p>Si no puedes asistir, cancela aquí:
             <a href="${ligaCancelar}">${ligaCancelar}</a></p>
        `
      )
      if (resultado.ok) {
        await supabase
          .from('res_citas')
          .update({ recordatorio_enviado: true })
          .eq('id', cita.id)
        enviados++
      }
    }
    return Response.json({ ok: true, enviados })
  }

  // --- Cita nueva: confirmación al cliente ---
  if (type === 'INSERT') {
    if (!record?.cliente_correo) {
      return Response.json({ ok: true, omitido: 'sin correo de cliente' })
    }
    const { negocio, servicio } = await contextoCita(record)
    const fecha = formatoFecha(record.inicia_en, negocio.zona_horaria)
    const ligaCancelar = `${APP_URL}/cancelar/${record.token_cancelacion}`

    const resultado = await enviarCorreo(
      record.cliente_correo,
      `Cita confirmada en ${negocio.nombre}`,
      `
        <h2>Tu cita está confirmada</h2>
        <p><strong>${negocio.nombre}</strong> — ${servicio?.nombre}</p>
        <p>${fecha}</p>
        <p>Si no puedes asistir, cancela aquí:
           <a href="${ligaCancelar}">${ligaCancelar}</a></p>
      `
    )
    return Response.json(resultado)
  }

  // --- Cita cancelada: aviso a la otra parte ---
  if (
    type === 'UPDATE' &&
    record?.estado === 'cancelada' &&
    old_record?.estado !== 'cancelada'
  ) {
    const { negocio, servicio } = await contextoCita(record)
    const fecha = formatoFecha(record.inicia_en, negocio.zona_horaria)
    const detalle = `${servicio?.nombre} — ${fecha}`

    if (record.cancelada_por === 'cliente') {
      const para = await correoDelNegocio(negocio)
      if (!para) return Response.json({ ok: true, omitido: 'sin correo de negocio' })
      const resultado = await enviarCorreo(
        para,
        `Cita cancelada: ${record.cliente_nombre}`,
        `
          <h2>Un cliente canceló su cita</h2>
          <p><strong>${record.cliente_nombre}</strong> (${record.cliente_telefono})</p>
          <p>${detalle}</p>
          <p>El horario ya quedó libre para otras reservas.</p>
        `
      )
      return Response.json(resultado)
    }

    if (record.cancelada_por === 'negocio' && record.cliente_correo) {
      const resultado = await enviarCorreo(
        record.cliente_correo,
        `Tu cita en ${negocio.nombre} fue cancelada`,
        `
          <h2>Tu cita fue cancelada</h2>
          <p><strong>${negocio.nombre}</strong> — ${detalle}</p>
          <p>Si crees que es un error, contacta directamente al negocio.</p>
        `
      )
      return Response.json(resultado)
    }

    return Response.json({ ok: true, omitido: 'sin destinatario' })
  }

  return Response.json({ ok: true, omitido: 'evento ignorado' })
})
