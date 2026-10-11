-- =====================================================================
-- AgendaYa — migracion-004: cancelada_por
--
-- Distingue quién canceló la cita para que el webhook de correo sepa a
-- quién notificar:
--   'cliente' → canceló por la liga pública → avisar al negocio
--   'negocio' → canceló el dueño en el panel → avisar al cliente
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
