import { Link } from 'react-router-dom'

// Canal de ventas: WhatsApp. Soporte: correo (footer).
const WHATSAPP = '528137385521'
const SOPORTE = 'hola@branforgedev.com'

const FEATURES = [
  'Página pública de reservas con tu link y QR',
  'Horarios disponibles en vivo, sin dobles citas',
  'Clientes agendan sin crear cuenta',
  'Confirmación, recordatorio y cancelación por correo',
  'Panel con calendario y citas del día',
  'Servicios y horarios configurables',
]

function enlaceWhatsApp(mensaje) {
  return `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(mensaje)}`
}

function Planes() {
  return (
    <main className="landing">
      <section className="hero">
        <h1 className="logo-marca">
          Agenda<span>Ya</span>
        </h1>
        <p className="hero-tagline">
          La agenda inteligente para tu negocio
        </p>
      </section>

      <section className="plan-card">
        <div className="plan-info">
          <h2>Plan AgendaYa</h2>
          <ul className="lista-features">
            {FEATURES.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
        <div className="plan-precio">
          <span className="precio-etiqueta">Inversión mensual</span>
          <span className="precio">
            $199<small>/MXN</small>
          </span>
          <span className="precio-nota">Sin plazos forzosos</span>
          <a
            className="cta-secundario"
            href={enlaceWhatsApp(
              'Hola! Me interesa AgendaYa para mi negocio. ¿Me podrías dar más información?'
            )}
            target="_blank"
            rel="noreferrer"
          >
            Quiero más información
          </a>
          <a
            className="cta-primario"
            href={enlaceWhatsApp(
              'Hola! Quiero activar mi licencia de AgendaYa. - Nombre del negocio: [ESCRIBE AQUÍ] - Correo para mi cuenta: [ESCRIBE AQUÍ] ¿Me compartes la CLABE para hacer la transferencia?'
            )}
            target="_blank"
            rel="noreferrer"
          >
            Activar mi licencia
          </a>
        </div>
      </section>

      <p className="landing-footer">
        ¿Ya tienes cuenta? <Link to="/ingresar">Inicia sesión aquí</Link>
        <br />
        Soporte: <a href={`mailto:${SOPORTE}`}>{SOPORTE}</a>
      </p>
    </main>
  )
}

export default Planes
