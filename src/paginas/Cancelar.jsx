import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fechaLegible, horaLegible } from '../lib/tiempo'
import ModalConfirmar from '../componentes/ModalConfirmar'

function Cancelar() {
  const { token } = useParams()
  const [cita, setCita] = useState(null)
  const [estado, setEstado] = useState('cargando')
  const [confirmando, setConfirmando] = useState(false)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    let activo = true
    supabase
      .rpc('res_cita_publica', { p_token: token })
      .then(({ data }) => {
        if (!activo) return
        if (data?.ok) {
          setCita(data)
          setEstado('lista')
        } else {
          setEstado('no_encontrada')
        }
      })
    return () => {
      activo = false
    }
  }, [token])

  async function cancelar() {
    setEnviando(true)
    const { data } = await supabase.rpc('res_cancelar_cita_publica', {
      p_token: token,
    })
    setEnviando(false)
    setConfirmando(false)
    setEstado(data?.ok ? 'cancelada' : 'no_cancelable')
  }

  if (estado === 'cargando') {
    return <main className="pagina centrado">Cargando…</main>
  }

  if (estado === 'no_encontrada') {
    return (
      <main className="pagina centrado">
        <h1>Liga no válida</h1>
        <p className="subtitulo">
          Esta liga de cancelación no existe o ya no está disponible.
        </p>
      </main>
    )
  }

  if (estado === 'cancelada') {
    return (
      <main className="pagina">
        <div className="tarjeta confirmacion">
          <div className="palomita">✓</div>
          <h1>Cita cancelada</h1>
          <p className="subtitulo">
            Tu cita en {cita.negocio} fue cancelada y el horario quedó libre.
          </p>
        </div>
      </main>
    )
  }

  if (estado === 'no_cancelable' || (estado === 'lista' && !cita.cancelable)) {
    return (
      <main className="pagina centrado">
        <h1>Esta cita ya no se puede cancelar</h1>
        <p className="subtitulo">
          Ya fue cancelada, ya pasó o cambió de estado. Si necesitas ayuda,
          contacta directamente a {cita.negocio}.
        </p>
      </main>
    )
  }

  return (
    <main className="pagina">
      <div className="tarjeta">
        <h1>Cancelar cita</h1>
        <p className="subtitulo">
          Vas a cancelar tu cita en <strong>{cita.negocio}</strong>:
        </p>
        <p className="resumen-chip">
          {cita.servicio} · {fechaLegible(cita.inicia_en, cita.zona_horaria)} ·{' '}
          {horaLegible(cita.inicia_en, cita.zona_horaria)}
        </p>
        <button
          className="boton-peligro boton-bloque"
          onClick={() => setConfirmando(true)}
        >
          Cancelar mi cita
        </button>
      </div>

      {confirmando && (
        <ModalConfirmar
          titulo="¿Seguro?"
          mensaje="Al cancelar, el horario queda libre de inmediato y otra persona podrá apartarlo."
          textoConfirmar="Sí, cancelar"
          peligro
          ocupado={enviando}
          onConfirmar={cancelar}
          onCerrar={() => setConfirmando(false)}
        />
      )}
    </main>
  )
}

export default Cancelar
