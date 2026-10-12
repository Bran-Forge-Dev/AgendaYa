-- =====================================================================
-- AgendaYa — migracion-007: recordatorios automáticos
--
-- pg_cron cada 30 min llama res_enviar_recordatorios(), que pega a la
-- Edge Function con type 'recordatorio'. La función manda el correo a
-- citas confirmadas que empiezan en 23–24h y marca recordatorio_enviado.
--
-- Requiere los mismos secretos Vault del webhook (url, secret, anon key).
-- =====================================================================

create extension if not exists pg_cron;

alter table res_citas
  add column recordatorio_enviado boolean not null default false;

create or replace function res_enviar_recordatorios()
returns void
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

  if v_url is null then
    return;
  end if;

  perform net.http_post(
    url := v_url,
    body := '{"type": "recordatorio"}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type',     'application/json',
      'x-webhook-secret', coalesce(v_secret, ''),
      'Authorization',    'Bearer ' || coalesce(v_key, '')
    )
  );
end;
$$;

-- Idempotente: si el job ya existe se reemplaza, no se duplica.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'agendaya-recordatorios') then
    perform cron.unschedule('agendaya-recordatorios');
  end if;
end;
$$;

select cron.schedule(
  'agendaya-recordatorios',
  '*/30 * * * *',
  $$select res_enviar_recordatorios()$$
);
