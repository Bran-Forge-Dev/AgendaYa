-- =====================================================================
-- AgendaYa — migracion-003: res_cita_publica
--
-- La liga de cancelación abre /cancelar/:token. Como anon no puede
-- leer res_citas (PII), este RPC devuelve solo lo necesario para
-- mostrar la cita antes de confirmar la cancelación.
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
