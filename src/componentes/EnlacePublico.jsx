import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

function EnlacePublico({ slug }) {
  const url = `${window.location.origin}/agendar/${slug}`
  const [qr, setQr] = useState('')
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    QRCode.toDataURL(url, { width: 200, margin: 1 }).then(setQr)
  }, [url])

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      setCopiado(false)
    }
  }

  return (
    <section className="tarjeta enlace-publico">
      <h2>Tu link de reservas</h2>
      <p className="subtitulo">
        Compártelo por WhatsApp, redes o imprime el QR para tu local.
      </p>
      <div className="enlace-fila">
        <code className="enlace-url">{url}</code>
        <button className="boton-secundario" onClick={copiar}>
          {copiado ? '¡Copiado!' : 'Copiar'}
        </button>
      </div>
      {qr && (
        <div className="qr-bloque">
          <img src={qr} alt={`Código QR de ${url}`} />
          <a className="enlace" href={qr} download={`qr-${slug}.png`}>
            Descargar QR
          </a>
        </div>
      )}
    </section>
  )
}

export default EnlacePublico
