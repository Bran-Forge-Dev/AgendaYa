// Un mismo auth.users sirve a varias apps del proyecto (NeoVenta,
// AgendaYa…). La pertenencia a cada app vive en user.app_metadata.apps,
// que solo se puede escribir con service_role — el cliente no se lo
// puede auto-asignar.

export function tieneAccesoAgendaya(user) {
  const apps = user?.app_metadata?.apps
  return Array.isArray(apps) && apps.includes('agendaya')
}
