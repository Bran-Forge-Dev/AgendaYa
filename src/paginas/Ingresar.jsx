import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { tieneAccesoAgendaya } from '../lib/sesion'

function Ingresar() {
  const navegar = useNavigate()
  const [correo, setCorreo] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  async function entrar(e) {
    e.preventDefault()
    setCargando(true)
    setError('')

    const { data, error: errorAuth } = await supabase.auth.signInWithPassword({
      email: correo,
      password: contrasena,
    })

    if (errorAuth) {
      setError('Correo o contraseña incorrectos')
      setCargando(false)
      return
    }

    if (!tieneAccesoAgendaya(data.user)) {
      await supabase.auth.signOut()
      setError('Esta cuenta no pertenece a AgendaYa')
      setCargando(false)
      return
    }

    navegar('/panel')
  }

  return (
    <main className="pagina">
      <h1>Ingresar</h1>
      <p className="subtitulo">Panel de tu negocio</p>
      <form onSubmit={entrar} className="formulario tarjeta">
        <label>
          Correo
          <input
            type="email"
            required
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
          />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            required
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={cargando}>
          {cargando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  )
}

export default Ingresar
