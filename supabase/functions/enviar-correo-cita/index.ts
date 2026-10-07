// Edge Function: enviar-correo-cita
// Invocada por un Database Webhook de Supabase sobre res_citas (INSERT).
// Envía la confirmación con la liga de cancelación vía Resend.
//
// Secretos requeridos (supabase secrets set):
//   RESEND_API_KEY, WEBHOOK_SECRET, APP_URL (base del deploy en Vercel)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET')!
const APP_URL = Deno.env.get('APP_URL')!

Deno.serve(async (req) => {
  if (req.headers.get('x-webhook-secret') !== WEBHOOK_SECRET) {
    return new Response('no autorizado', { status: 401 })
  }

  const { type, record } = await req.json()
  if (type !== 'INSERT' || !record?.cliente_correo) {
    return Response.json({ ok: true, omitido: true })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const [{ data: negocio }, { data: servicio }] = await Promise.all([
    supabase.from('res_negocios').select('nombre, slug, zona_horaria')
      .eq('id', record.negocio_id).single(),
    supabase.from('res_servicios').select('nombre, precio')
      .eq('id', record.servicio_id).single(),
  ])

  const fecha = new Date(record.inicia_en).toLocaleString('es-MX', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: negocio?.zona_horaria ?? 'America/Mexico_City',
  })
  const ligaCancelar = `${APP_URL}/cancelar/${record.token_cancelacion}`

  const respuesta = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'AgendaYa <citas@agendaya.app>',
      to: record.cliente_correo,
      subject: `Cita confirmada en ${negocio?.nombre}`,
      html: `
        <h2>Tu cita está confirmada</h2>
        <p><strong>${negocio?.nombre}</strong> — ${servicio?.nombre}</p>
        <p>${fecha}</p>
        <p>Si no puedes asistir, cancela aquí:
           <a href="${ligaCancelar}">${ligaCancelar}</a></p>
      `,
    }),
  })

  return Response.json({ ok: respuesta.ok })
})
