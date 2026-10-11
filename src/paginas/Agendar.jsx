import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fechaHoraEnZona, fechaLegible, horaLegible } from '../lib/tiempo'

const MENSAJES_ERROR = {
  nombre_invalido: 'Escribe tu nombre completo.',
  telefono_invalido: 'Revisa tu número de teléfono.',
  correo_invalido: 'Revisa tu correo electrónico.',
  servicio_no_disponible: 'Ese servicio ya no está disponible.',
  horario_pasado: 'Ese horario ya pasó, elige otro.',
  fuera_de_horario: 'Ese horario está fuera del horario laboral.',
  horario_ocupado: 'Ese horario se acaba de ocupar, elige otro.',
  demasiado_rapido: 'Espera un momento antes de reservar de nuevo.',
  limite_citas: 'Ya tienes demasiadas citas activas con este negocio.',
}

function Agendar() {
  const { slug } = useParams()
  const [negocio, setNegocio] = useState(null)
  const [estado, setEstado] = useState('cargando')

  const [paso, setPaso] = useState(0)
  const [servicio, setServicio] = useState(null)
  const [fecha, setFecha] = useState('')
  const [hoy, setHoy] = useState('')
  const [slots, setSlots] = useState([])
  const [cargandoSlots, setCargandoSlots] = useState(false)
  const [slotSel, setSlotSel] = useState(null)
  const [form, setForm] = useState({ nombre: '', telefono: '', correo: '' })
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    let activo = true
    supabase
      .rpc('res_negocio_publico', { p_slug: slug })
      .then(({ data, error: err }) => {
        if (!activo) return
        if (err || !data) {
          setEstado('no_encontrado')
        } else {
          setNegocio(data)
          const f = fechaHoraEnZona(new Date().toISOString(), data.zona_horaria).fecha
          setFecha(f)
          setHoy(f)
          setEstado('listo')
        }
      })
    return () => {
      activo = false
    }
  }, [slug])

  const cargarSlots = useCallback(
    async (servicioId, fechaSel) => {
      if (!servicioId || !fechaSel) return
      setCargandoSlots(true)
      const { data } = await supabase.rpc('res_disponibilidad', {
        p_slug: slug,
        p_fecha: fechaSel,
        p_servicio_id: servicioId,
      })
      setSlots(data ?? [])
      setCargandoSlots(false)
    },
    [slug]
  )



  // Disponibilidad en vivo: cualquier cambio en res_ocupacion del
  // negocio refresca los slots visibles.
  useEffect(() => {
    if (!negocio?.id) return
    const canal = supabase
      .channel(`ocupacion-${negocio.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'res_ocupacion',
          filter: `negocio_id=eq.${negocio.id}`,
        },
        () => {
          if (servicio && fecha) cargarSlots(servicio.id, fecha)
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(canal)
    }
  }, [negocio?.id, servicio, fecha, cargarSlots])

  async function reservar(e) {
    e.preventDefault()
    setEnviando(true)
    setError('')

    const { fecha: f, hora } = fechaHoraEnZona(
      slotSel.inicia_en,
      negocio.zona_horaria
    )
    const { data } = await supabase.rpc('res_crear_cita_publica', {
      p_slug: slug,
      p_servicio_id: servicio.id,
      p_fecha: f,
      p_hora: hora,
      p_nombre: form.nombre,
      p_telefono: form.telefono,
      p_correo: form.correo || null,
    })

    setEnviando(false)

    if (data?.ok) {
      setPaso(3)
      return
    }
    const codigo = data?.error ?? 'horario_ocupado'
    setError(MENSAJES_ERROR[codigo] ?? 'No se pudo reservar, intenta de nuevo.')
    if (codigo === 'horario_ocupado') {
      setSlotSel(null)
      setPaso(1)
      cargarSlots(servicio.id, fecha)
    }
  }

  if (estado === 'cargando') {
    return <main className="pagina centrado">Cargando…</main>
  }
  if (estado === 'no_encontrado') {
    return (
      <main className="pagina centrado">
        <h1>Enlace no disponible</h1>
        <p className="subtitulo">
          Este negocio no existe o no está disponible por ahora.
        </p>
      </main>
    )
  }

  return (
    <main className="pagina">
      <header className="negocio-cabecera">
        <h1>{negocio.nombre}</h1>
        <p className="subtitulo">Agenda tu cita en línea, sin crear cuenta.</p>
      </header>

      {paso < 3 && (
        <ol className="pasos">
          <li className={paso === 0 ? 'activo' : ''}>1 · Servicio</li>
          <li className={paso === 1 ? 'activo' : ''}>2 · Fecha y hora</li>
          <li className={paso === 2 ? 'activo' : ''}>3 · Tus datos</li>
        </ol>
      )}

      {paso === 0 && (
        <div className="tarjeta">
          <h2>Elige un servicio</h2>
          <div className="grid-servicios">
            {negocio.servicios.map((s) => (
              <button
                key={s.id}
                className="opcion-servicio"
                onClick={() => {
                  setServicio(s)
                  setSlotSel(null)
                  setPaso(1)
                  cargarSlots(s.id, fecha)
                }}
              >
                <span className="nombre">{s.nombre}</span>
                {s.descripcion && (
                  <span className="descripcion">{s.descripcion}</span>
                )}
                <span className="detalle">
                  {s.duracion_minutos} min · ${Number(s.precio).toFixed(2)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {paso === 1 && (
        <div className="tarjeta">
          <div className="tarjeta-cabecera">
            <h2>Fecha y hora</h2>
            <button className="enlace" onClick={() => setPaso(0)}>
              ← Cambiar servicio
            </button>
          </div>
          <p className="resumen-chip">
            {servicio.nombre} · {servicio.duracion_minutos} min
          </p>

          <label className="campo">
            Fecha
            <input
              type="date"
              value={fecha}
              min={hoy}
              onChange={(e) => {
                setFecha(e.target.value)
                setSlotSel(null)
                cargarSlots(servicio.id, e.target.value)
              }}
            />
          </label>

          {cargandoSlots ? (
            <p className="subtitulo">Buscando horarios…</p>
          ) : slots.length === 0 ? (
            <p className="subtitulo">
              No hay horarios libres ese día. Prueba otra fecha.
            </p>
          ) : (
            <div className="slots">
              {slots.map((slot) => (
                <button
                  key={slot.inicia_en}
                  className="chip-slot"
                  onClick={() => {
                    setSlotSel(slot)
                    setPaso(2)
                  }}
                >
                  {horaLegible(slot.inicia_en, negocio.zona_horaria)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {paso === 2 && (
        <div className="tarjeta">
          <div className="tarjeta-cabecera">
            <h2>Tus datos</h2>
            <button className="enlace" onClick={() => setPaso(1)}>
              ← Elegir otra hora
            </button>
          </div>
          <p className="resumen-chip">
            {servicio.nombre} · {fechaLegible(slotSel.inicia_en, negocio.zona_horaria)}{' '}
            · {horaLegible(slotSel.inicia_en, negocio.zona_horaria)}
          </p>

          <form onSubmit={reservar} className="formulario">
            <label className="campo">
              Nombre
              <input
                required
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                placeholder="Tu nombre completo"
              />
            </label>
            <label className="campo">
              Teléfono
              <input
                required
                type="tel"
                value={form.telefono}
                onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                placeholder="81 1234 5678"
              />
            </label>
            <label className="campo">
              Correo <span className="opcional">(opcional, para la confirmación)</span>
              <input
                type="email"
                value={form.correo}
                onChange={(e) => setForm({ ...form, correo: e.target.value })}
                placeholder="tu@correo.com"
              />
            </label>
            {error && <p className="error">{error}</p>}
            <button type="submit" disabled={enviando}>
              {enviando ? 'Reservando…' : 'Confirmar cita'}
            </button>
          </form>
        </div>
      )}

      {paso === 3 && (
        <div className="tarjeta confirmacion">
          <div className="palomita">✓</div>
          <h2>Cita confirmada</h2>
          <p className="resumen-chip">
            {servicio.nombre} · {fechaLegible(slotSel.inicia_en, negocio.zona_horaria)}{' '}
            · {horaLegible(slotSel.inicia_en, negocio.zona_horaria)}
          </p>
          <p className="subtitulo">
            {form.correo
              ? 'Te enviamos la confirmación y la liga para cancelar a tu correo.'
              : 'Aparta la fecha. Si necesitas cancelar, contacta al negocio.'}
          </p>
          <button
            className="enlace"
            onClick={() => {
              setPaso(0)
              setServicio(null)
              setSlotSel(null)
              setForm({ nombre: '', telefono: '', correo: '' })
            }}
          >
            Agendar otra cita
          </button>
        </div>
      )}
    </main>
  )
}

export default Agendar
