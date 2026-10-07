import { Link } from 'react-router-dom'

function Inicio() {
  return (
    <main className="pagina">
      <h1>AgendaYa</h1>
      <p>Sistema de reservas multi-tenant: tus clientes agendan sin cuenta.</p>
      <nav className="acciones">
        <Link to="/ingresar">Ingresar al panel</Link>
      </nav>
    </main>
  )
}

export default Inicio
