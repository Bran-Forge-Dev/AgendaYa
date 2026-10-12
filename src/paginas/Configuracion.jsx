import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { tieneAccesoAgendaya } from '../lib/sesion'
import ModalConfirmar from '../componentes/ModalConfirmar'

const DIAS = [
  'Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado',
]

const NEGOCIO_VACIO = {
  nombre: '',
  slug: '',
  correo_contacto: '',
  zona_horaria: 'America/Mexico_City',
  intervalo_minutos: 15,
}
const SERVICIO_VACIO = { nombre: '', duracion_minutos: '', precio: '' }
const HORARIO_VACIO = { dia_semana: 1, hora_inicio: '09:00', hora_fin: '18:00' }

function Configuracion() {
  const navegar = useNavigate()
  const [usuario, setUsuario] = useState(null)
  const [negocio, setNegocio] = useState(null)
  const [estado, setEstado] = useState('cargando')
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')

  const [formNeg, setFormNeg] = useState(NEGOCIO_VACIO)
  const [formServ, setFormServ] = useState(SERVICIO_VACIO)
  const [formHor, setFormHor] = useState(HORARIO_VACIO)
  const [guardando, setGuardando] = useState(false)
  const [borrar, setBorrar] = useState(null) // {tipo, id, etiqueta}

  const cargarNegocio = useCallback(async () => {
    const { data } = await supabase
      .from('res_negocios')
      .select('*, res_servicios(*), res_horarios(*)')
    const neg = data?.[0] ?? null
    setNegocio(neg)
    if (neg) {
      setFormNeg({
        nombre: neg.nombre,
        slug: neg.slug,
        correo_contacto: neg.correo_contacto ?? '',
        zona_horaria: neg.zona_horaria,
        intervalo_minutos: neg.intervalo_minutos,
      })
    }
    return neg
  }, [])

  useEffect(() => {
    async function cargar() {
      const { data: sesion } = await supabase.auth.getSession()
      const user = sesion.session?.user
      if (!user || !tieneAccesoAgendaya(user)) {
        navegar('/ingresar')
        return
      }
      setUsuario(user)
      await cargarNegocio()
      setEstado('listo')
    }
    cargar()
  }, [navegar, cargarNegocio])

  function notificar(texto) {
    setAviso(texto)
    setError('')
    setTimeout(() => setAviso(''), 3000)
  }

  async function guardarNegocio(e) {
    e.preventDefault()
    setGuardando(true)
    setError('')

    const payload = {
      nombre: formNeg.nombre.trim(),
      slug: formNeg.slug,
      correo_contacto: formNeg.correo_contacto.trim() || null,
      zona_horaria: formNeg.zona_horaria.trim(),
      intervalo_minutos: Number(formNeg.intervalo_minutos),
    }

    const { error: err } = negocio
      ? await supabase.from('res_negocios').update(payload).eq('id', negocio.id)
      : await supabase
          .from('res_negocios')
          .insert({ ...payload, propietario_id: usuario.id })

    setGuardando(false)
    if (err) {
      setError(
        err.code === '23505'
          ? 'Ese slug ya está en uso, elige otro.'
          : `No se pudo guardar: ${err.message}`
      )
      return
    }
    await cargarNegocio()
    notificar(negocio ? 'Negocio actualizado' : 'Negocio creado')
  }

  async function agregarServicio(e) {
    e.preventDefault()
    setError('')
    const { error: err } = await supabase.from('res_servicios').insert({
      negocio_id: negocio.id,
      nombre: formServ.nombre.trim(),
      duracion_minutos: Number(formServ.duracion_minutos),
      precio: Number(formServ.precio),
    })
    if (err) {
      setError(`No se pudo agregar el servicio: ${err.message}`)
      return
    }
    setFormServ(SERVICIO_VACIO)
    await cargarNegocio()
    notificar('Servicio agregado')
  }

  async function alternarServicio(servicio) {
    await supabase
      .from('res_servicios')
      .update({ activo: !servicio.activo })
      .eq('id', servicio.id)
    await cargarNegocio()
  }

  async function agregarHorario(e) {
    e.preventDefault()
    setError('')
    if (formHor.hora_fin <= formHor.hora_inicio) {
      setError('La hora de fin debe ser después de la de inicio.')
      return
    }
    const { error: err } = await supabase.from('res_horarios').insert({
      negocio_id: negocio.id,
      dia_semana: Number(formHor.dia_semana),
      hora_inicio: formHor.hora_inicio,
      hora_fin: formHor.hora_fin,
    })
    if (err) {
      setError(`No se pudo agregar el horario: ${err.message}`)
      return
    }
    await cargarNegocio()
    notificar('Horario agregado')
  }

  async function confirmarBorrado() {
    const { error: err } = await supabase
      .from(borrar.tipo === 'servicio' ? 'res_servicios' : 'res_horarios')
      .delete()
      .eq('id', borrar.id)
    setBorrar(null)
    if (err) {
      setError(
        'No se pudo eliminar (quizá tiene citas ligadas). Mejor desactívalo.'
      )
      return
    }
    await cargarNegocio()
    notificar('Eliminado')
  }

  if (estado === 'cargando') {
    return <main className="pagina centrado">Cargando…</main>
  }

  return (
    <main className="pagina pagina-panel">
      <header className="panel-cabecera">
        <div>
          <h1>Configuración</h1>
          <p className="subtitulo">
            <Link to="/panel">← Volver al panel</Link>
          </p>
        </div>
      </header>

      {aviso && <p className="aviso-ok">{aviso}</p>}
      {error && <p className="error">{error}</p>}

      {/* ---------- Negocio ---------- */}
      <section className="tarjeta">
        <h2>{negocio ? 'Tu negocio' : 'Crea tu negocio'}</h2>
        <form onSubmit={guardarNegocio} className="formulario">
          <div className="fila-2">
            <label className="campo">
              Nombre
              <input
                required
                value={formNeg.nombre}
                onChange={(e) =>
                  setFormNeg({ ...formNeg, nombre: e.target.value })
                }
                placeholder="Barbería El Norte"
              />
            </label>
            <label className="campo">
              Slug (tu link público)
              <input
                required
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                title="Minúsculas, números y guiones"
                value={formNeg.slug}
                onChange={(e) =>
                  setFormNeg({
                    ...formNeg,
                    slug: e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9-]/g, ''),
                  })
                }
                placeholder="barberia-el-norte"
              />
            </label>
          </div>
          <div className="fila-3">
            <label className="campo">
              Correo de contacto
              <input
                type="email"
                value={formNeg.correo_contacto}
                onChange={(e) =>
                  setFormNeg({ ...formNeg, correo_contacto: e.target.value })
                }
                placeholder="citas@tunegocio.com"
              />
            </label>
            <label className="campo">
              Zona horaria
              <input
                required
                value={formNeg.zona_horaria}
                onChange={(e) =>
                  setFormNeg({ ...formNeg, zona_horaria: e.target.value })
                }
              />
            </label>
            <label className="campo">
              Intervalo (min)
              <input
                required
                type="number"
                min="5"
                max="120"
                value={formNeg.intervalo_minutos}
                onChange={(e) =>
                  setFormNeg({
                    ...formNeg,
                    intervalo_minutos: e.target.value,
                  })
                }
              />
            </label>
          </div>
          <button type="submit" disabled={guardando}>
            {guardando ? 'Guardando…' : negocio ? 'Guardar cambios' : 'Crear negocio'}
          </button>
        </form>
      </section>

      {negocio && (
        <>
          {/* ---------- Servicios ---------- */}
          <section className="tarjeta">
            <h2>Servicios</h2>
            <ul className="lista-servicios">
              {negocio.res_servicios.map((s) => (
                <li key={s.id} className="cita">
                  <div>
                    <strong>{s.nombre}</strong>
                    <span className="subtitulo">
                      {' '}
                      · {s.duracion_minutos} min · $
                      {Number(s.precio).toFixed(2)}
                    </span>
                  </div>
                  <div className="cita-acciones">
                    <button
                      className="enlace"
                      onClick={() => alternarServicio(s)}
                    >
                      {s.activo ? 'Desactivar' : 'Activar'}
                    </button>
                    <button
                      className="enlace peligro"
                      onClick={() =>
                        setBorrar({
                          tipo: 'servicio',
                          id: s.id,
                          etiqueta: s.nombre,
                        })
                      }
                    >
                      Eliminar
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <form onSubmit={agregarServicio} className="formulario form-inline">
              <input
                required
                placeholder="Nuevo servicio"
                value={formServ.nombre}
                onChange={(e) =>
                  setFormServ({ ...formServ, nombre: e.target.value })
                }
              />
              <input
                required
                type="number"
                min="5"
                title="Duración en minutos"
                placeholder="Minutos"
                value={formServ.duracion_minutos}
                onChange={(e) =>
                  setFormServ({
                    ...formServ,
                    duracion_minutos: e.target.value,
                  })
                }
              />
              <input
                required
                type="number"
                min="0"
                step="0.01"
                title="Precio"
                placeholder="Precio"
                value={formServ.precio}
                onChange={(e) =>
                  setFormServ({ ...formServ, precio: e.target.value })
                }
              />
              <button type="submit" className="boton-secundario">
                + Agregar
              </button>
            </form>
          </section>

          {/* ---------- Horarios ---------- */}
          <section className="tarjeta">
            <h2>Horarios semanales</h2>
            {DIAS.map((dia, d) => {
              const bloques = negocio.res_horarios.filter(
                (h) => h.dia_semana === d && h.activo
              )
              return (
                <div key={d} className="grupo-horario">
                  <strong>{dia}</strong>
                  {bloques.length === 0 ? (
                    <span className="subtitulo">Cerrado</span>
                  ) : (
                    bloques.map((h) => (
                      <span key={h.id} className="chip-horario">
                        {h.hora_inicio.slice(0, 5)}–{h.hora_fin.slice(0, 5)}
                        <button
                          className="chip-x"
                          title="Eliminar bloque"
                          onClick={() =>
                            setBorrar({
                              tipo: 'horario',
                              id: h.id,
                              etiqueta: `${dia} ${h.hora_inicio.slice(0, 5)}–${h.hora_fin.slice(0, 5)}`,
                            })
                          }
                        >
                          ×
                        </button>
                      </span>
                    ))
                  )}
                </div>
              )
            })}

            <form onSubmit={agregarHorario} className="formulario form-inline">
              <select
                value={formHor.dia_semana}
                onChange={(e) =>
                  setFormHor({ ...formHor, dia_semana: e.target.value })
                }
              >
                {DIAS.map((dia, d) => (
                  <option key={d} value={d}>
                    {dia}
                  </option>
                ))}
              </select>
              <input
                required
                type="time"
                value={formHor.hora_inicio}
                onChange={(e) =>
                  setFormHor({ ...formHor, hora_inicio: e.target.value })
                }
              />
              <input
                required
                type="time"
                value={formHor.hora_fin}
                onChange={(e) =>
                  setFormHor({ ...formHor, hora_fin: e.target.value })
                }
              />
              <button type="submit" className="boton-secundario">
                + Agregar
              </button>
            </form>
          </section>
        </>
      )}

      {borrar && (
        <ModalConfirmar
          titulo={`Eliminar ${borrar.tipo}`}
          mensaje={`Se eliminará "${borrar.etiqueta}". Las citas pasadas conservan su referencia.`}
          textoConfirmar="Sí, eliminar"
          peligro
          onConfirmar={confirmarBorrado}
          onCerrar={() => setBorrar(null)}
        />
      )}
    </main>
  )
}

export default Configuracion
