-- Verificación de falm.draft_reiniciar.
--
-- Vacía de verdad el draft en curso y termina lanzando una excepción, así que
-- todo se revierte: los picks siguen donde estaban. Necesita un draft con al
-- menos un pick.
--
--   PASA  -> termina con el error 'TEST OK: los 5 casos pasaron'
--   FALLA -> termina con un error que empieza por 'FALLO C<n>'

do $$
declare
  v_draft uuid; v_picks_antes int; v_r jsonb; v_n int; v_estado text;
begin
  select id into v_draft from falm.draft where estado in ('CREADO','EN_CURSO','COMPLETADO')
   order by created_at desc limit 1;
  select count(*) into v_picks_antes from falm.draft_pick where draft_id = v_draft;
  if v_picks_antes = 0 then raise exception 'FALLO C0: el draft no tiene picks para la prueba'; end if;

  -- C1: sin confirmar no borra nada
  begin
    perform falm.draft_reiniciar(v_draft);
    raise exception 'FALLO C1: reinicio sin confirmacion';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
    if position('p_confirmar' in sqlerrm) = 0 then
      raise exception 'FALLO C1: error inesperado: %', sqlerrm;
    end if;
  end;
  select count(*) into v_n from falm.draft_pick where draft_id = v_draft;
  if v_n <> v_picks_antes then raise exception 'FALLO C1: borro picks sin confirmar'; end if;

  -- C2: confirmando, vacia el draft y lo deja en CREADO
  v_r := falm.draft_reiniciar(v_draft, true);
  if (v_r->>'picks_borrados')::int <> v_picks_antes then
    raise exception 'FALLO C2: dice haber borrado % de %', v_r->>'picks_borrados', v_picks_antes;
  end if;
  select count(*) into v_n from falm.draft_pick where draft_id = v_draft;
  if v_n <> 0 then raise exception 'FALLO C2: quedan % picks', v_n; end if;
  select estado::text into v_estado from falm.draft where id = v_draft;
  if v_estado <> 'CREADO' then raise exception 'FALLO C2: el draft quedo en %', v_estado; end if;

  -- C3: todos los turnos vuelven a estar abiertos
  select count(*) into v_n from falm.draft_orden where draft_id = v_draft and completado;
  if v_n <> 0 then raise exception 'FALLO C3: quedan % turnos marcados', v_n; end if;

  -- C4: dejo una copia de seguridad antes de borrar
  if v_r->>'respaldo' is null then raise exception 'FALLO C4: no hizo copia'; end if;
  if not exists (select 1 from pg_namespace where nspname = v_r->>'respaldo') then
    raise exception 'FALLO C4: la copia % no existe', v_r->>'respaldo';
  end if;

  -- C5: y ahora el orden ya se puede rehacer, que era el motivo de todo esto
  perform falm.draft_reordenar(v_draft,
    (select array_agg(equipo_falm_id order by random())
       from (select distinct equipo_falm_id from falm.draft_orden where draft_id = v_draft) q));

  raise exception 'TEST OK: los 5 casos pasaron (borro % picks)', v_picks_antes;
end $$;
