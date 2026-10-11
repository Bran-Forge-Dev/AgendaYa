-- =====================================================================
-- AgendaYa — schema.sql
--
-- ESPEJO de supabase/migracion-NNN-*.sql. Cada migración nueva debe
-- reflejarse aquí para que este archivo siempre represente el estado
-- completo de la base de datos.
--
-- Contenido actual:
--   migracion-001-esquema-inicial.sql
--   migracion-002-aislamiento-apps.sql
--   migracion-003-vista-cita-publica.sql
--   migracion-004-cancelada-por.sql
--   migracion-005-webhook-correo.sql
--   migracion-006-auth-header-webhook.sql
-- =====================================================================

-- =====================================================================
-- migracion-001: esquema inicial
--
-- Multi-tenant por negocio_id. Las reservas públicas NO tocan las tablas
-- directamente: todo pasa por RPCs security definer que validan en el
-- servidor (disponibilidad, horario laboral, anti-spam).
-- res_ocupacion es el espejo público (sin PII) para Supabase Realtime.
-- =====================================================================

create extension if not exists btree_gist;

-- ---------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------

create table res_negocios (
  id               uuid primary key default gen_random_uuid(),
  propietario_id   uuid not null references auth.users(id) on delete cascade,
  nombre           text not null check (char_length(btrim(nombre)) between 2 and 120),
  slug             text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  zona_horaria     text not null default 'America/Mexico_City',
  correo_contacto  text,
  intervalo_minutos integer not null default 15 check (intervalo_minutos between 5 and 120),
  creado_en        timestamptz not null default now()
);

create table res_servicios (
  id               uuid primary key default gen_random_uuid(),
  negocio_id       uuid not null references res_negocios(id) on delete cascade,
  nombre           text not null check (char_length(btrim(nombre)) between 2 and 120),
  descripcion      text,
  duracion_minutos integer not null check (duracion_minutos between 5 and 480),
  precio           numeric(10,2) not null check (precio >= 0),
  activo           boolean not null default true,
  creado_en        timestamptz not null default now()
);

create index res_servicios_negocio_idx on res_servicios (negocio_id);

-- Bloques laborales semanales recurrentes. dia_semana: 0 = domingo (extract dow).
create table res_horarios (
  id           uuid primary key default gen_random_uuid(),
  negocio_id   uuid not null references res_negocios(id) on delete cascade,
  dia_semana   smallint not null check (dia_semana between 0 and 6),
  hora_inicio  time not null,
  hora_fin     time not null,
  activo       boolean not null default true,
  check (hora_fin > hora_inicio)
);

create index res_horarios_negocio_idx on res_horarios (negocio_id);

create type res_estado_cita as enum ('confirmada', 'cancelada', 'completada', 'no_asistio');

create table res_citas (
  id                uuid primary key default gen_random_uuid(),
  negocio_id        uuid not null references res_negocios(id) on delete cascade,
  servicio_id       uuid not null references res_servicios(id) on delete restrict,
  fecha_local       date not null,
  inicia_en         timestamptz not null,
  termina_en        timestamptz not null,
  cliente_nombre    text not null,
  cliente_telefono  text not null,
  cliente_correo    text,
  estado            res_estado_cita not null default 'confirmada',
  token_cancelacion uuid not null unique default gen_random_uuid(),
  creado_en         timestamptz not null default now(),
  check (termina_en > inicia_en),
  -- Autoridad anti-doble-reserva: dos citas confirmadas del mismo negocio
  -- nunca se pueden traslapar, aunque lleguen en carrera.
  exclude using gist (
    negocio_id with =,
    tstzrange(inicia_en, termina_en, '[)') with &&
  ) where (estado = 'confirmada')
);

create index res_citas_negocio_inicio_idx on res_citas (negocio_id, inicia_en);
create index res_citas_telefono_idx on res_citas (negocio_id, cliente_telefono);

-- Espejo público de horarios ocupados (sin PII). Lo escribe el trigger;
-- el rol anon solo puede leerlo. Es la fuente de Supabase Realtime para
-- la disponibilidad en vivo.
create table res_ocupacion (
  cita_id     uuid primary key references res_citas(id) on delete cascade,
  negocio_id  uuid not null references res_negocios(id) on delete cascade,
  inicia_en   timestamptz not null,
  termina_en  timestamptz not null
);

create index res_ocupacion_negocio_idx on res_ocupacion (negocio_id, inicia_en);

alter publication supabase_realtime add table res_ocupacion;

create or replace function res_sincronizar_ocupacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from res_ocupacion where cita_id = coalesce(NEW.id, OLD.id);
  if TG_OP <> 'DELETE' and NEW.estado = 'confirmada' then
    insert into res_ocupacion (cita_id, negocio_id, inicia_en, termina_en)
    values (NEW.id, NEW.negocio_id, NEW.inicia_en, NEW.termina_en);
  end if;
  return coalesce(NEW, OLD);
end;
$$;

create trigger res_citas_sincronizar_ocupacion
after insert or update or delete on res_citas
for each row execute function res_sincronizar_ocupacion();

-- ---------------------------------------------------------------------
-- RPCs públicos (security definer): única puerta del rol anon
-- ---------------------------------------------------------------------

-- Datos públicos del negocio para la página /agendar/:slug.
create or replace function res_negocio_publico(p_slug text)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'id',           n.id,
    'nombre',       n.nombre,
    'slug',         n.slug,
    'zona_horaria', n.zona_horaria,
    'servicios', coalesce((
      select json_agg(json_build_object(
        'id',               s.id,
        'nombre',           s.nombre,
        'descripcion',      s.descripcion,
        'duracion_minutos', s.duracion_minutos,
        'precio',           s.precio
      ) order by s.nombre)
      from res_servicios s
      where s.negocio_id = n.id and s.activo
    ), '[]'::json),
    'horarios', coalesce((
      select json_agg(json_build_object(
        'dia_semana',  h.dia_semana,
        'hora_inicio', h.hora_inicio,
        'hora_fin',    h.hora_fin
      ) order by h.dia_semana, h.hora_inicio)
      from res_horarios h
      where h.negocio_id = n.id and h.activo
    ), '[]'::json)
  )
  from res_negocios n
  where n.slug = p_slug;
$$;

-- Huecos libres de un servicio en una fecha, en la rejilla de
-- intervalo_minutos del negocio, descontando citas confirmadas.
create or replace function res_disponibilidad(
  p_slug        text,
  p_fecha       date,
  p_servicio_id uuid
)
returns table (inicia_en timestamptz, termina_en timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_negocio res_negocios;
  v_dur     integer;
begin
  select * into v_negocio from res_negocios where slug = p_slug;
  if not found then return; end if;

  select s.duracion_minutos into v_dur
  from res_servicios s
  where s.id = p_servicio_id and s.negocio_id = v_negocio.id and s.activo;
  if not found then return; end if;

  return query
  with bloques as (
    select h.hora_inicio, h.hora_fin
    from res_horarios h
    where h.negocio_id = v_negocio.id
      and h.activo
      and h.dia_semana = extract(dow from p_fecha)::smallint
  ),
  candidatos as (
    select
      ((p_fecha + b.hora_inicio)::timestamp
        + g.paso * v_negocio.intervalo_minutos * interval '1 minute')
        at time zone v_negocio.zona_horaria as ini
    from bloques b
    cross join lateral generate_series(
      0,
      floor(
        (extract(epoch from (b.hora_fin - b.hora_inicio)) / 60 - v_dur)
        / v_negocio.intervalo_minutos
      )::int
    ) as g(paso)
  )
  select c.ini, c.ini + make_interval(mins => v_dur)
  from candidatos c
  where c.ini > now()
    and not exists (
      select 1
      from res_citas ci
      where ci.negocio_id = v_negocio.id
        and ci.estado = 'confirmada'
        and tstzrange(ci.inicia_en, ci.termina_en, '[)')
            && tstzrange(c.ini, c.ini + make_interval(mins => v_dur), '[)')
    )
  order by c.ini;
end;
$$;

-- Reserva pública. Toda la validación vive aquí; el cliente nunca decide
-- disponibilidad ni precio. Devuelve { ok, ... } con errores tipados.
create or replace function res_crear_cita_publica(
  p_slug        text,
  p_servicio_id uuid,
  p_fecha       date,
  p_hora        time,
  p_nombre      text,
  p_telefono    text,
  p_correo      text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_negocio res_negocios;
  v_dur     integer;
  v_ini     timestamptz;
  v_cita    res_citas;
begin
  p_nombre := btrim(coalesce(p_nombre, ''));
  p_telefono := btrim(coalesce(p_telefono, ''));
  p_correo := nullif(btrim(coalesce(p_correo, '')), '');

  if char_length(p_nombre) < 2 or char_length(p_nombre) > 120 then
    return json_build_object('ok', false, 'error', 'nombre_invalido');
  end if;
  if p_telefono !~ '^\+?[0-9 ()-]{7,20}$' then
    return json_build_object('ok', false, 'error', 'telefono_invalido');
  end if;
  if p_correo is not null and p_correo !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return json_build_object('ok', false, 'error', 'correo_invalido');
  end if;

  select * into v_negocio from res_negocios where slug = p_slug;
  if not found then
    return json_build_object('ok', false, 'error', 'negocio_no_encontrado');
  end if;

  select s.duracion_minutos into v_dur
  from res_servicios s
  where s.id = p_servicio_id and s.negocio_id = v_negocio.id and s.activo;
  if not found then
    return json_build_object('ok', false, 'error', 'servicio_no_disponible');
  end if;

  v_ini := (p_fecha + p_hora)::timestamp at time zone v_negocio.zona_horaria;

  if v_ini <= now() then
    return json_build_object('ok', false, 'error', 'horario_pasado');
  end if;

  -- El hueco completo debe caber en un bloque laboral activo de ese día.
  if not exists (
    select 1
    from res_horarios h
    where h.negocio_id = v_negocio.id
      and h.activo
      and h.dia_semana = extract(dow from p_fecha)::smallint
      and p_hora >= h.hora_inicio
      and (p_fecha + p_hora)::timestamp + make_interval(mins => v_dur)
          <= (p_fecha + h.hora_fin)::timestamp
  ) then
    return json_build_object('ok', false, 'error', 'fuera_de_horario');
  end if;

  -- Anti-spam: enfriamiento de 1 min entre reservas del mismo teléfono
  -- y máximo de 5 citas futuras activas por teléfono en el negocio.
  if exists (
    select 1 from res_citas
    where negocio_id = v_negocio.id
      and cliente_telefono = p_telefono
      and creado_en > now() - interval '1 minute'
  ) then
    return json_build_object('ok', false, 'error', 'demasiado_rapido');
  end if;

  if (
    select count(*) from res_citas
    where negocio_id = v_negocio.id
      and cliente_telefono = p_telefono
      and estado = 'confirmada'
      and inicia_en > now()
  ) >= 5 then
    return json_build_object('ok', false, 'error', 'limite_citas');
  end if;

  insert into res_citas (
    negocio_id, servicio_id, fecha_local, inicia_en, termina_en,
    cliente_nombre, cliente_telefono, cliente_correo
  ) values (
    v_negocio.id, p_servicio_id, p_fecha, v_ini,
    v_ini + make_interval(mins => v_dur),
    p_nombre, p_telefono, p_correo
  )
  returning * into v_cita;

  return json_build_object(
    'ok', true,
    'cita_id',           v_cita.id,
    'token_cancelacion', v_cita.token_cancelacion,
    'inicia_en',         v_cita.inicia_en,
    'termina_en',        v_cita.termina_en
  );

exception
  -- La restricción de exclusión es la autoridad final ante carreras.
  when exclusion_violation or unique_violation then
    return json_build_object('ok', false, 'error', 'horario_ocupado');
end;
$$;

-- Cancelación con la liga del correo (token = capacidad, no identidad).
create or replace function res_cancelar_cita_publica(p_token uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cita res_citas;
begin
  update res_citas
  set estado = 'cancelada'
  where token_cancelacion = p_token
    and estado = 'confirmada'
    and inicia_en > now()
  returning * into v_cita;

  if not found then
    return json_build_object('ok', false, 'error', 'cita_no_cancelable');
  end if;

  return json_build_object(
    'ok', true,
    'cita_id',   v_cita.id,
    'inicia_en', v_cita.inicia_en
  );
end;
$$;

-- ---------------------------------------------------------------------
-- RLS: aislamiento por negocio_id
-- ---------------------------------------------------------------------

alter table res_negocios  enable row level security;
alter table res_servicios enable row level security;
alter table res_horarios  enable row level security;
alter table res_citas     enable row level security;
alter table res_ocupacion enable row level security;

create policy res_negocios_propietario on res_negocios
  for all to authenticated
  using (propietario_id = auth.uid())
  with check (propietario_id = auth.uid());

create policy res_servicios_propietario on res_servicios
  for all to authenticated
  using (exists (
    select 1 from res_negocios n
    where n.id = negocio_id and n.propietario_id = auth.uid()
  ))
  with check (exists (
    select 1 from res_negocios n
    where n.id = negocio_id and n.propietario_id = auth.uid()
  ));

create policy res_horarios_propietario on res_horarios
  for all to authenticated
  using (exists (
    select 1 from res_negocios n
    where n.id = negocio_id and n.propietario_id = auth.uid()
  ))
  with check (exists (
    select 1 from res_negocios n
    where n.id = negocio_id and n.propietario_id = auth.uid()
  ));

-- El dueño gestiona sus citas; el público jamás lee esta tabla (PII).
create policy res_citas_propietario on res_citas
  for all to authenticated
  using (exists (
    select 1 from res_negocios n
    where n.id = negocio_id and n.propietario_id = auth.uid()
  ))
  with check (exists (
    select 1 from res_negocios n
    where n.id = negocio_id and n.propietario_id = auth.uid()
  ));

-- Única lectura pública: huecos ocupados sin datos de clientes.
create policy res_ocupacion_lectura_publica on res_ocupacion
  for select to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------

grant select on res_ocupacion to anon, authenticated;
grant select, insert, update, delete
  on res_negocios, res_servicios, res_horarios, res_citas
  to authenticated;

grant execute on function res_negocio_publico(text) to anon, authenticated;
grant execute on function res_disponibilidad(text, date, uuid) to anon, authenticated;
grant execute on function res_crear_cita_publica(text, uuid, date, time, text, text, text) to anon, authenticated;
grant execute on function res_cancelar_cita_publica(uuid) to anon, authenticated;

-- =====================================================================
-- migracion-002: aislamiento de apps por app_metadata
-- =====================================================================

create or replace function res_es_usuario_agendaya()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' -> 'apps') ? 'agendaya',
    false
  );
$$;

drop policy res_negocios_propietario on res_negocios;
create policy res_negocios_propietario on res_negocios
  for all to authenticated
  using (propietario_id = auth.uid() and res_es_usuario_agendaya())
  with check (propietario_id = auth.uid() and res_es_usuario_agendaya());

drop policy res_servicios_propietario on res_servicios;
create policy res_servicios_propietario on res_servicios
  for all to authenticated
  using (
    res_es_usuario_agendaya()
    and exists (
      select 1 from res_negocios n
      where n.id = negocio_id and n.propietario_id = auth.uid()
    )
  )
  with check (
    res_es_usuario_agendaya()
    and exists (
      select 1 from res_negocios n
      where n.id = negocio_id and n.propietario_id = auth.uid()
    )
  );

drop policy res_horarios_propietario on res_horarios;
create policy res_horarios_propietario on res_horarios
  for all to authenticated
  using (
    res_es_usuario_agendaya()
    and exists (
      select 1 from res_negocios n
      where n.id = negocio_id and n.propietario_id = auth.uid()
    )
  )
  with check (
    res_es_usuario_agendaya()
    and exists (
      select 1 from res_negocios n
      where n.id = negocio_id and n.propietario_id = auth.uid()
    )
  );

drop policy res_citas_propietario on res_citas;
create policy res_citas_propietario on res_citas
  for all to authenticated
  using (
    res_es_usuario_agendaya()
    and exists (
      select 1 from res_negocios n
      where n.id = negocio_id and n.propietario_id = auth.uid()
    )
  )
  with check (
    res_es_usuario_agendaya()
    and exists (
      select 1 from res_negocios n
      where n.id = negocio_id and n.propietario_id = auth.uid()
    )
  );

-- =====================================================================
-- migracion-003: res_cita_publica
-- =====================================================================

create or replace function res_cita_publica(p_token uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_negocio  text;
  v_zona     text;
  v_servicio text;
  v_ini      timestamptz;
  v_estado   res_estado_cita;
begin
  select n.nombre, n.zona_horaria, s.nombre, c.inicia_en, c.estado
    into v_negocio, v_zona, v_servicio, v_ini, v_estado
  from res_citas c
  join res_negocios n on n.id = c.negocio_id
  join res_servicios s on s.id = c.servicio_id
  where c.token_cancelacion = p_token;

  if not found then
    return json_build_object('ok', false, 'error', 'no_encontrada');
  end if;

  return json_build_object(
    'ok', true,
    'negocio',       v_negocio,
    'zona_horaria',  v_zona,
    'servicio',      v_servicio,
    'inicia_en',     v_ini,
    'estado',        v_estado,
    'cancelable',    (v_estado = 'confirmada' and v_ini > now())
  );
end;
$$;

grant execute on function res_cita_publica(uuid) to anon, authenticated;

-- =====================================================================
-- migracion-004: cancelada_por
-- =====================================================================

alter table res_citas
  add column cancelada_por text
  check (cancelada_por is null or cancelada_por in ('cliente', 'negocio'));

create or replace function res_cancelar_cita_publica(p_token uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cita res_citas;
begin
  update res_citas
  set estado = 'cancelada',
      cancelada_por = 'cliente'
  where token_cancelacion = p_token
    and estado = 'confirmada'
    and inicia_en > now()
  returning * into v_cita;

  if not found then
    return json_build_object('ok', false, 'error', 'cita_no_cancelable');
  end if;

  return json_build_object(
    'ok', true,
    'cita_id',   v_cita.id,
    'inicia_en', v_cita.inicia_en
  );
end;
$$;

grant execute on function res_cancelar_cita_publica(uuid) to anon, authenticated;

-- =====================================================================
-- migracion-005: webhook de correos vía trigger + pg_net
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

create trigger res_citas_webhook_insert
after insert on res_citas
for each row execute function res_notificar_cita();

create trigger res_citas_webhook_cancel
after update on res_citas
for each row
when (NEW.estado = 'cancelada' and OLD.estado is distinct from NEW.estado)
execute function res_notificar_cita();

-- =====================================================================
-- migracion-006: Authorization en el webhook
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
