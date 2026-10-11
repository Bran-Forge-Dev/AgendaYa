-- =====================================================================
-- AgendaYa — migracion-005: webhook de correos vía trigger + pg_net
--
-- Los proyectos nuevos de Supabase ya no traen supabase_functions.hooks.
-- En su lugar el trigger llama a la Edge Function con net.http_post
-- (asíncrono: no bloquea la transacción ni revierte la cita si el correo
-- falla). El secreto del webhook vive en Vault, no en el repo.
--
-- ANTES de probarlo, una sola vez en el SQL Editor:
--   select vault.create_secret('TU-SECRET', 'agendaya_webhook_secret');
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/enviar-correo-cita',
--                              'agendaya_webhook_url');
-- =====================================================================

create extension if not exists pg_net;
create extension if not exists supabase_vault;

create or replace function res_notificar_cita()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url
  from vault.decrypted_secrets
  where name = 'agendaya_webhook_url';

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'agendaya_webhook_secret';

  -- Sin configurar, no hace nada (no rompe reservas/cancelaciones).
  if v_url is null then
    return null;
  end if;

  perform net.http_post(
    url := v_url,
    body := jsonb_build_object(
      'type',       TG_OP,
      'schema',     TG_TABLE_SCHEMA,
      'table',      TG_TABLE_NAME,
      'record',     to_jsonb(NEW),
      'old_record', to_jsonb(OLD)
    ),
    headers := jsonb_build_object(
      'Content-Type',     'application/json',
      'x-webhook-secret', coalesce(v_secret, '')
    )
  );

  return null;
end;
$$;

-- Cita nueva → confirmación al cliente.
create trigger res_citas_webhook_insert
after insert on res_citas
for each row execute function res_notificar_cita();

-- Transición a cancelada → aviso a la otra parte.
create trigger res_citas_webhook_cancel
after update on res_citas
for each row
when (NEW.estado = 'cancelada' and OLD.estado is distinct from NEW.estado)
execute function res_notificar_cita();
