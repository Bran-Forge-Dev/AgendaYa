function ModalConfirmar({
  titulo,
  mensaje,
  textoConfirmar = 'Confirmar',
  peligro = false,
  ocupado = false,
  onConfirmar,
  onCerrar,
}) {
  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{titulo}</h3>
        <p className="subtitulo">{mensaje}</p>
        <div className="modal-acciones">
          <button className="boton-secundario" onClick={onCerrar}>
            Volver
          </button>
          <button
            className={peligro ? 'boton-peligro' : 'boton'}
            onClick={onConfirmar}
            disabled={ocupado}
          >
            {ocupado ? 'Un momento…' : textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ModalConfirmar
