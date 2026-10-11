import { Link } from 'react-router-dom'

function Inicio() {
  return (
    <main className="pagina centrado">
      <h1>AgendaYa</h1>
      <p className="subtitulo">
        Reservas en línea para tu negocio. Tus clientes agendan sin crear
        cuenta y ven los horarios libres en vivo.
      </p>
      <nav className="acciones">
        <Link to="/ingresar">Ingresar al panel</Link>
      </nav>
    </main>
  )
}

export default Inicio
