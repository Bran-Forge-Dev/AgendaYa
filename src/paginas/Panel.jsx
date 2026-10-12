import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { tieneAccesoAgendaya } from '../lib/sesion'
import { fechaHoraEnZona, horaLegible } from '../lib/tiempo'
import ModalConfirmar from '../componentes/ModalConfirmar'
import EnlacePublico from '../componentes/EnlacePublico'

const DIAS = [
  'Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado',
]
const DIAS_CORTOS = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa']
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

function Panel() {
  const navegar = useNavigate()
  const [usuario, setUsuario] = useState(null)
  const [negocio, setNegocio] = useState(null)
  const [estado, setEstado] = useState('cargando')

  const [mes, setMes] = useState('') // 'YYYY-MM' del negocio
  const [hoy, setHoy] = useState('')
  const [diaSel, setDiaSel] = useState('') // 'YYYY-MM-DD'
  const [citasMes, setCitasMes] = useState([])
  const [cancelando, setCancelando] = useState(null)
  const [ocupadoModal, setOcupadoModal] = useState(false)

  const cargarCitas = useCallback(async (negocioId, mesStr) => {
    const [anio, m] = mesStr.split('-').map(Number)
    const inicio = `${mesStr}-01`
    const fin =
      m === 12
        ? `${anio + 1}-01-01`
        : `${anio}-${String(m + 1).padStart(2, '0')}-01`

    const { data } = await supabase
      .from('res_citas')
      .select('id, fecha_local, inicia_en, termina_en, cliente_nombre, cliente_telefono, estado, res_servicios(nombre)')
      .eq('negocio_id', negocioId)
      .gte('fecha_local', inicio)
      .lt('fecha_local', fin)
      .order('inicia_en')

    setCitasMes(data ?? [])
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

      const { data: negocios, error } = await supabase
        .from('res_negocios')
        .select('*, res_servicios(*), res_horarios(*)')

      if (error) {
        setEstado('error')
        return
      }
      if (!negocios?.length) {
        navegar('/panel/configuracion')
        return
      }

      const neg = negocios[0]
      setNegocio(neg)

      const fHoy = fechaHoraEnZona(
        new Date().toISOString(),
        neg.zona_horaria
      ).fecha
      setHoy(fHoy)
      setDiaSel(fHoy)
      const mesIni = fHoy.slice(0, 7)
      setMes(mesIni)
      await cargarCitas(neg.id, mesIni)
      setEstado('listo')
    }
    cargar()
  }, [navegar, cargarCitas])

  function cambiarMes(delta) {
    const [anio, m] = mes.split('-').map(Number)
    const nuevo = new Date(anio, m - 1 + delta, 1)
    const mesStr = `${nuevo.getFullYear()}-${String(nuevo.getMonth() + 1).padStart(2, '0')}`
    setMes(mesStr)
    cargarCitas(negocio.id, mesStr)
  }

  async function confirmarCancelacion() {
    setOcupadoModal(true)
    await supabase
      .from('res_citas')
      .update({ estado: 'cancelada', cancelada_por: 'negocio' })
      .eq('id', cancelando.id)
    setCancelando(null)
    setOcupadoModal(false)
    cargarCitas(negocio.id, mes)
  }

  async function salir() {
    await supabase.auth.signOut()
    navegar('/')
  }

  if (estado === 'cargando') {
    return <main className="pagina centrado">Cargando…</main>
  }
  if (estado === 'error') {
    return <main className="pagina centrado">No se pudo cargar tu negocio.</main>
  }
  if (estado === 'sin_negocio') {
    return <main className="pagina centrado">Redirigiendo…</main>
  }

  // ----- Calendario del mes visible -----
  const [anioMes, numMes] = mes.split('-').map(Number)
  const primerDow = new Date(anioMes, numMes - 1, 1).getDay()
  const diasEnMes = new Date(anioMes, numMes, 0).getDate()
  const celdas = [
    ...Array(primerDow).fill(null),
    ...Array.from({ length: diasEnMes }, (_, i) => i + 1),
  ]

  const conteoPorDia = citasMes.reduce((acc, c) => {
    if (c.estado === 'confirmada') {
      acc[c.fecha_local] = (acc[c.fecha_local] ?? 0) + 1
    }
    return acc
  }, {})

  const citasDelDia = citasMes.filter((c) => c.fecha_local === diaSel)
  const [yD, mD, dD] = diaSel.split('-').map(Number)
  const tituloDia = `${DIAS[new Date(yD, mD - 1, dD).getDay()]} ${dD} de ${MESES[mD - 1]}`

  return (
    <main className="pagina pagina-panel">
      <header className="panel-cabecera">
        <div>
          <h1>{negocio.nombre}</h1>
          <p className="subtitulo">Sesión: {usuario.email}</p>
          <div className="panel-acciones">
            <Link className="boton-secundario" to={`/agendar/${negocio.slug}`}>
              Ver página pública
            </Link>
            <Link className="boton-secundario" to="/panel/configuracion">
              Configuración
            </Link>
          </div>
        </div>
        <button onClick={salir}>Cerrar sesión</button>
      </header>

      <EnlacePublico slug={negocio.slug} />

      <div className="panel-grid">
        <section className="tarjeta calendario">
          <div className="tarjeta-cabecera">
            <h2>
              {MESES[numMes - 1]} {anioMes}
            </h2>
            <div className="nav-mes">
              <button className="enlace" onClick={() => cambiarMes(-1)}>
                ←
              </button>
              <button className="enlace" onClick={() => cambiarMes(1)}>
                →
              </button>
            </div>
          </div>
          <div className="cal-grid">
            {DIAS_CORTOS.map((d) => (
              <span key={d} className="cal-dow">
                {d}
              </span>
            ))}
            {celdas.map((dia, i) =>
              dia === null ? (
                <span key={`v${i}`} />
              ) : (
                <button
                  key={dia}
                  className={[
                    'cal-dia',
                    conteoPorDia[
                      `${mes}-${String(dia).padStart(2, '0')}`
                    ]
                      ? 'con-citas'
                      : '',
                    `${mes}-${String(dia).padStart(2, '0')}` === hoy
                      ? 'hoy'
                      : '',
                    `${mes}-${String(dia).padStart(2, '0')}` === diaSel
                      ? 'sel'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() =>
                    setDiaSel(`${mes}-${String(dia).padStart(2, '0')}`)
                  }
                >
                  {dia}
                  {conteoPorDia[`${mes}-${String(dia).padStart(2, '0')}`] && (
                    <span className="punto" />
                  )}
                </button>
              )
            )}
          </div>
        </section>

        <section className="tarjeta">
          <h2>{tituloDia}</h2>
          {citasDelDia.length === 0 ? (
            <p className="subtitulo">Sin citas este día.</p>
          ) : (
            <ul className="lista-servicios">
              {citasDelDia.map((c) => (
                <li key={c.id} className="cita">
                  <div>
                    <strong>{c.cliente_nombre}</strong>
                    <span className="subtitulo">
                      {' '}
                      · {c.res_servicios?.nombre}
                    </span>
                    <br />
                    <span className="subtitulo">
                      {horaLegible(c.inicia_en, negocio.zona_horaria)}–
                      {horaLegible(c.termina_en, negocio.zona_horaria)} ·{' '}
                      {c.cliente_telefono}
                    </span>
                  </div>
                  <div className="cita-acciones">
                    <span className={`estado estado-${c.estado}`}>
                      {c.estado.replace('_', ' ')}
                    </span>
                    {c.estado === 'confirmada' && (
                      <button
                        className="enlace peligro"
                        onClick={() => setCancelando(c)}
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {cancelando && (
        <ModalConfirmar
          titulo="Cancelar cita"
          mensaje={`Se cancelará la cita de ${cancelando.cliente_nombre} (${cancelando.res_servicios?.nombre}) y el horario quedará libre de inmediato.`}
          textoConfirmar="Sí, cancelar cita"
          peligro
          ocupado={ocupadoModal}
          onConfirmar={confirmarCancelacion}
          onCerrar={() => setCancelando(null)}
        />
      )}
    </main>
  )
}

export default Panel
