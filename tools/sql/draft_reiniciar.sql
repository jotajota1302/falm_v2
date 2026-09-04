-- Empezar el draft de cero.
--
-- Hacia falta para las pruebas: en cuanto hay un solo pick, draft_reordenar se
-- niega a tocar el orden ("Ya hay N picks: no se puede cambiar el orden") y el
-- panel esconde el sorteo, asi que no habia forma de volver a repartir el orden
-- sin deshacer los picks uno a uno.
--
-- Que hace: borra TODOS los picks Y el orden del sorteo, y deja el draft en
-- CREADO. Queda literalmente en blanco: draft_estado devuelve turno nulo y
-- picks_totales 0, y hay que sortear (draft_reordenar) para poder empezar.
--
-- Al principio conservaba el orden, y la pantalla seguia diciendo que el turno 1
-- era de tal equipo cuando ya no se habia sorteado nada: parecia un resto de la
-- partida anterior. Empezar de cero tiene que dejarlo de cero.
--
-- Precauciones, porque esto no se deshace:
--   * Solo administrador.
--   * Un draft CONSOLIDADO no se reinicia: sus jugadores ya estan en las
--     plantillas y borrar los picks dejaria las plantillas huerfanas.
--   * Hay que llamarlo con p_confirmar := true a proposito.
--   * Antes de borrar nada se hace una copia de seguridad automatica, asi que
--     un reinicio por error se puede revertir desde el editor SQL.

create or replace function falm.draft_reiniciar(p_draft uuid, p_confirmar boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'falm'
as $function$
declare
  v_estado falm.draft_estado;
  v_nombre text;
  v_picks int;
  v_turnos int;
  v_copia jsonb;
begin
  if not falm.puede_gestionar() then
    raise exception 'Solo un administrador puede reiniciar el draft';
  end if;

  select estado, nombre into v_estado, v_nombre from falm.draft where id = p_draft;
  if v_estado is null then raise exception 'Draft no encontrado'; end if;
  if v_estado = 'CONSOLIDADO' then
    raise exception 'El draft ya esta consolidado: sus jugadores estan en las plantillas y no se puede reiniciar';
  end if;

  select count(*) into v_picks from falm.draft_pick where draft_id = p_draft;
  select count(*) into v_turnos from falm.draft_orden where draft_id = p_draft;

  if not p_confirmar then
    raise exception 'Reiniciar borra los % picks y el orden del draft "%": hay que llamarlo con p_confirmar := true',
      v_picks, v_nombre;
  end if;

  -- Red debajo de la red: esto no se deshace solo.
  v_copia := falm.respaldo_crear('antes_de_reiniciar_draft');

  delete from falm.draft_pick where draft_id = p_draft;
  delete from falm.draft_orden where draft_id = p_draft;
  update falm.draft set estado = 'CREADO' where id = p_draft;

  return jsonb_build_object(
    'reiniciado', true,
    'draft', v_nombre,
    'picks_borrados', v_picks,
    'turnos_borrados', v_turnos,
    'respaldo', v_copia->>'schema',
    'estado', falm.draft_estado(p_draft)
  );
end $function$;

grant execute on function falm.draft_reiniciar(uuid, boolean) to authenticated;
revoke execute on function falm.draft_reiniciar(uuid, boolean) from public, anon;
