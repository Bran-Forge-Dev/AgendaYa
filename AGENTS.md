# AgendaYa

Sistema de reservas/citas **multi-tenant** para portafolio. Diferencial:
reservas **públicas** — el cliente del negocio agenda sin cuenta, validado
server-side con anti-spam.

## Stack

- **Frontend**: React + Vite (`react-router-dom`), deploy en Vercel
- **Backend**: Supabase — Postgres + Auth + RLS multi-tenant
- **Tiempo real**: Supabase Realtime sobre `res_ocupacion` (espejo público
  sin PII de `res_citas`)
- **Correos**: Resend vía Edge Function `enviar-correo-cita`
  (`supabase/functions/`), disparada por Database Webhook en `res_citas`

## Convenciones (heredadas de NeoVenta)

- Commits: **Conventional Commits en español, sin trailers**
  (`feat:`, `fix:`, `chore:`…).
- Migraciones versionadas: `supabase/migracion-NNN-descripcion.sql`
  (NNN correlativo). **Nunca editar una migración ya aplicada**: crear
  la siguiente.
- `supabase/schema.sql` es **espejo** de todas las migraciones:
  actualizarlo en el mismo cambio que la migración.
- Tablas con prefijo `res_*`. RLS siempre activado; aislamiento por
  `negocio_id` contra `auth.uid()` del propietario.
- Toasts/modales propios — **nunca** `alert`/`confirm`/`prompt` nativos.
- **El servidor es autoridad**: precios, duración y disponibilidad se
  validan en RPC/security definer; el cliente solo propone.

## Arquitectura de acceso

| Actor | Acceso |
|---|---|
| `anon` (público) | Solo RPCs `res_negocio_publico`, `res_disponibilidad`, `res_crear_cita_publica`, `res_cancelar_cita_publica` + SELECT en `res_ocupacion` (Realtime). **Nunca** toca `res_citas` (PII). |
| `authenticated` (dueño) | CRUD completo de sus `res_*` vía RLS (`propietario_id = auth.uid()`). |

Anti-doble-reserva: constraint `EXCLUDE USING gist` sobre
`(negocio_id, tstzrange)` con `WHERE estado = 'confirmada'` — la carrera
entre dos clientes la resuelve Postgres, no la UI.

Anti-spam público en `res_crear_cita_publica`: enfriamiento 1 min por
teléfono + máx. 5 citas futuras activas por teléfono/negocio.

## Comandos

```bash
npm run dev     # Vite dev server
npm run build   # build producción
npm run lint    # oxlint
```

Variables: copiar `.env.example` → `.env`
(`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).

Secretos Edge Function (nunca en el repo):
`supabase secrets set RESEND_API_KEY WEBHOOK_SECRET APP_URL`

## Estructura

```
src/
  lib/supabase.js        cliente Supabase (env VITE_*)
  paginas/               Inicio, Agendar (pública), Ingresar, Panel
supabase/
  schema.sql             espejo de migraciones
  migracion-NNN-*.sql    migraciones versionadas
  functions/             Edge Functions (Deno)
```

## MVP pendiente

1. Onboarding del negocio: servicios + horarios semanales
2. `/agendar/:slug` completo: servicio → horarios en vivo (Realtime sobre
   `res_ocupacion`) → formulario → `res_crear_cita_publica`
3. Webhook `res_citas` INSERT → `enviar-correo-cita` (Resend)
4. Panel: calendario, citas del día, cancelar
5. `/cancelar/:token` → `res_cancelar_cita_publica` libera el horario
