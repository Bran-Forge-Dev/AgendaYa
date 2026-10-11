// Utilidades para hablar de fechas en la zona horaria del negocio,
// que es la que manda (los slots vienen en UTC desde el servidor).

export function fechaHoraEnZona(isoUtc, zonaHoraria) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: zonaHoraria,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(isoUtc))

  const valor = (tipo) => partes.find((p) => p.type === tipo).value
  const hora = valor('hour') === '24' ? '00' : valor('hour')

  return {
    fecha: `${valor('year')}-${valor('month')}-${valor('day')}`,
    hora: `${hora}:${valor('minute')}`,
  }
}

export function horaLegible(isoUtc, zonaHoraria) {
  return new Date(isoUtc).toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: zonaHoraria,
  })
}

export function fechaLegible(isoUtc, zonaHoraria) {
  return new Date(isoUtc).toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: zonaHoraria,
  })
}
