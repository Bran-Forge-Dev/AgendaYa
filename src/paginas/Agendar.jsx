import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function Agendar() {
  const { slug } = useParams()
  const [negocio, setNegocio] = useState(null)
  const [estado, setEstado] = useState('cargando')

  useEffect(() => {
    let activo = true
    supabase
      .rpc('res_negocio_publico', { p_slug: slug })
      .then(({ data, error }) => {
        if (!activo) return
        if (error || !data) {
          setEstado('no_encontrado')
        } else {
          setNegocio(data)
          setEstado('listo')
        }
      })
    return () => {
      activo = false
    }
  }, [slug])

  if (estado === 'cargando') {
    return <main className="pagina">Cargando…</main>
  }
  if (estado === 'no_encontrado') {
    return <main className="pagina">Este negocio no existe o no está disponible.</main>
  }

  return (
    <main className="pagina">
      <h1>{negocio.nombre}</h1>
      <h2>Elige un servicio</h2>
      <ul className="lista-servicios">
        {negocio.servicios.map((s) => (
          <li key={s.id}>
            <strong>{s.nombre}</strong> — {s.duracion_minutos} min — $
            {Number(s.precio).toFixed(2)}
          </li>
        ))}
      </ul>
    </main>
  )
}

export default Agendar
