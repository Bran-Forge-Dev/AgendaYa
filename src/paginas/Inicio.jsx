import { Link } from 'react-router-dom'

const VENTAJAS = [
  {
    titulo: 'Sin cuentas ni apps',
    texto: 'Tus clientes agendan desde tu link o QR, sin registrarse.',
  },
  {
    titulo: 'Horarios en vivo',
    texto: 'La disponibilidad se actualiza al instante para todos.',
  },
  {
    titulo: 'Correos automáticos',
    texto: 'Confirmación, recordatorio y aviso de cancelación solos.',
  },
]

function Inicio() {
  return (
    <main className="landing">
      <section className="hero">
        <h1 className="logo-marca">
          Agenda<span>Ya</span>
        </h1>
        <p className="hero-tagline">
          Tus clientes agendan solos. Tú solo llegas.
        </p>
        <p className="hero-texto">
          Página de reservas para tu negocio con horarios en vivo,
          confirmaciones por correo y panel con tu calendario.
        </p>
        <div className="hero-acciones">
          <Link className="cta-primario" to="/planes">
            Ver Información del Plan
          </Link>
          <Link className="cta-secundario" to="/ingresar">
            Ingresar al panel
          </Link>
        </div>
      </section>

      <section className="ventajas">
        {VENTAJAS.map((v) => (
          <article key={v.titulo} className="ventaja">
            <h3>{v.titulo}</h3>
            <p>{v.texto}</p>
          </article>
        ))}
      </section>
    </main>
  )
}

export default Inicio
