-- =====================================================================
-- AgendaYa — migracion-002: aislamiento de apps por app_metadata
--
-- AgendaYa y NeoVenta comparten el mismo proyecto Supabase, por lo que
-- auth.users es un solo pool. La autenticación no se puede dividir, pero
-- el acceso sí: cada usuario lleva app_metadata.apps (solo editable por
-- service_role/admin) y las políticas de res_* exigen el tag 'agendaya'.
--
-- Un usuario de NeoVenta con sesión válida obtiene acceso NULO a res_*.
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

-- res_ocupacion_lectura_publica no cambia: sigue siendo lectura libre
-- para anon/authenticated (Realtime público, sin PII).

-- Etiquetar un usuario para AgendaYa (correr a mano en el SQL Editor):
--   update auth.users
--   set raw_app_meta_data = raw_app_meta_data || '{"apps": ["agendaya"]}'::jsonb
--   where email = 'dueno@ejemplo.com';
