-- =====================================================================
-- AgendaYa — migracion-006: Authorization en el webhook
--
-- La Edge Function tiene verify_jwt activado (default), así que el
-- gateway exige Authorization antes de llegar al código. El trigger
-- manda la anon key (pública por diseño) guardada en Vault como
-- 'agendaya_anon_key'. La verificación propia sigue siendo
-- x-webhook-secret dentro de la función.
--
-- Una sola vez en el SQL Editor:
--   select vault.create_secret('<VITE_SUPABASE_ANON_KEY>',
--                              'agendaya_anon_key');
-- =====================================================================

create or replace function res_notificar_cita()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text;
  v_secret text;
  v_key    text;
begin
  select decrypted_secret into v_url
  from vault.decrypted_secrets
  where name = 'agendaya_webhook_url';

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'agendaya_webhook_secret';

  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'agendaya_anon_key';

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
      'x-webhook-secret', coalesce(v_secret, ''),
      'Authorization',    'Bearer ' || coalesce(v_key, '')
    )
  );

  return null;
end;
$$;
