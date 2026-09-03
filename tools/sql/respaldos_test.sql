-- Verificación de los respaldos. Un backup que no se sabe restaurar no es un
-- backup, así que esto no comprueba que la copia se cree: comprueba que los
-- datos vuelven.
--
-- Borra tablas enteras a propósito y termina lanzando una excepción, así que
-- todo se revierte. Necesita que exista al menos un respaldo (bk_falm_*) y
-- restaura desde el más reciente.
--
--   PASA  -> termina con el error 'TEST OK: los 8 casos pasaron'
--   FALLA -> termina con un error que empieza por 'FALLO C<n>'

do $$
declare
  v_bk text;
  v_eq int; v_do int; v_dp int; v_act int; v_enf int; v_jug int;
  v_r jsonb; v_n int;
begin
  select nspname into v_bk from pg_namespace
   where nspname like 'bk\_falm\_%' order by nspname desc limit 1;
  if v_bk is null then raise exception 'FALLO C0: no hay ningun respaldo del que tirar'; end if;

  select count(*) into v_eq  from falm.equipo_falm;
  select count(*) into v_do  from falm.draft_orden;
  select count(*) into v_dp  from falm.draft_pick;
  select count(*) into v_act from falm.activo;
  select count(*) into v_enf from falm.enfrentamiento;
  select count(*) into v_jug from falm.jugador_lfp;

  -- C1: el respaldo tiene lo mismo que la tabla viva
  execute format('select count(*) from %I.equipo_falm', v_bk) into v_n;
  if v_n <> v_eq then
    raise exception 'FALLO C1: el respaldo tiene % equipos y falm tiene %', v_n, v_eq;
  end if;

  -- C2: borrar una tabla entera y recuperarla del respaldo
  delete from falm.enfrentamiento;
  if (select count(*) from falm.enfrentamiento) <> 0 then
    raise exception 'FALLO C2: no llego a vaciarse';
  end if;
  v_r := falm.respaldo_restaurar(v_bk, 'enfrentamiento', true);
  select count(*) into v_n from falm.enfrentamiento;
  if v_n <> v_enf then
    raise exception 'FALLO C2: quedaron % enfrentamientos de %', v_n, v_enf;
  end if;

  -- C3: restaurar una tabla de la que cuelgan otras las repone tambien.
  -- El truncate cascade las vacia igual, asi que si no se repusieran, restaurar
  -- equipo_falm dejaria el draft entero a cero sin avisar.
  v_r := falm.respaldo_restaurar(v_bk, 'equipo_falm', true);
  select count(*) into v_n from falm.draft_orden;
  if v_n <> v_do then
    raise exception 'FALLO C3: draft_orden quedo en % de %', v_n, v_do;
  end if;
  select count(*) into v_n from falm.draft_pick;
  if v_n <> v_dp then
    raise exception 'FALLO C3: draft_pick quedo en % de %', v_n, v_dp;
  end if;

  -- C4: el desastre gordo. Vaciar medio schema y restaurarlo entero.
  truncate falm.draft_pick, falm.draft_orden, falm.equipo_falm, falm.activo,
           falm.jugador_lfp, falm.enfrentamiento cascade;
  v_r := falm.respaldo_restaurar(v_bk, null, true);
  select count(*) into v_n from falm.activo;
  if v_n <> v_act then raise exception 'FALLO C4: activo quedo en % de %', v_n, v_act; end if;
  select count(*) into v_n from falm.jugador_lfp;
  if v_n <> v_jug then raise exception 'FALLO C4: jugador_lfp quedo en % de %', v_n, v_jug; end if;
  select count(*) into v_n from falm.draft_orden;
  if v_n <> v_do then raise exception 'FALLO C4: draft_orden quedo en % de %', v_n, v_do; end if;
  select count(*) into v_n from falm.draft_pick;
  if v_n <> v_dp then raise exception 'FALLO C4: draft_pick quedo en % de %', v_n, v_dp; end if;
  select count(*) into v_n from falm.equipo_falm;
  if v_n <> v_eq then raise exception 'FALLO C4: equipo_falm quedo en % de %', v_n, v_eq; end if;

  -- C5: restaurar deja copia de lo de justo antes, por si el respaldo elegido
  -- no era el que se creia
  if v_r->>'respaldo_previo' is null then
    raise exception 'FALLO C5: no dejo respaldo previo';
  end if;
  if not exists (select 1 from pg_namespace where nspname = v_r->>'respaldo_previo') then
    raise exception 'FALLO C5: el respaldo previo no existe';
  end if;

  -- C6: sin confirmar no se restaura
  begin
    perform falm.respaldo_restaurar(v_bk, null, false);
    raise exception 'FALLO C6: restauro sin confirmacion';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
    if position('p_confirmar' in sqlerrm) = 0 then
      raise exception 'FALLO C6: error inesperado: %', sqlerrm;
    end if;
  end;

  -- C7: las funciones solo aceptan schemas bk_falm_*
  begin
    perform falm.respaldo_borrar('falm');
    raise exception 'FALLO C7: acepto borrar el schema falm';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
    if position('no es un respaldo' in sqlerrm) = 0 then
      raise exception 'FALLO C7: error inesperado: %', sqlerrm;
    end if;
  end;

  -- C8: purgar siempre deja al menos uno
  begin
    perform falm.respaldo_purgar(0);
    raise exception 'FALLO C8: acepto purgar hasta cero';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
    if position('al menos un respaldo' in sqlerrm) = 0 then
      raise exception 'FALLO C8: error inesperado: %', sqlerrm;
    end if;
  end;

  raise exception 'TEST OK: los 8 casos pasaron';
end $$;
