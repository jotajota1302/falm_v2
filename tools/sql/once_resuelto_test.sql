-- Casos de falm.once_resuelto. Se revierte solo: termina lanzando una excepcion
-- a proposito, asi que Postgres deshace las puntuaciones de mentira que inserta.
-- Pasa si el error empieza por 'TEST OK'; falla si empieza por 'FALLO'.
--
-- Usa la jornada FALM 1 y las alineaciones que haya guardadas de verdad.

do $$
declare
  v_ali uuid; v_lfp uuid;
  v_caido uuid; v_por uuid; v_hueco text; v_tapa uuid;
  v_total numeric; v_suma numeric; v_n int;
  v_fallos text[] := array[]::text[];
begin
  select jl.id into v_lfp from falm.jornada_lfp jl
    join falm.mapeo_jornada mj on mj.jornada_lfp_id = jl.id
    join falm.jornada_falm jf on jf.id = mj.jornada_falm_id
   where jf.numero = 1 limit 1;
  select id into v_ali from falm.alineacion limit 1;
  if v_lfp is null or v_ali is null then
    raise exception 'FALLO: hace falta la jornada FALM 1 y al menos una alineacion';
  end if;

  -- 1. Todos juegan: no hay huecos, no entra ningun suplente y el total son
  --    solo los once titulares.
  delete from falm.puntuacion where jornada_lfp_id = v_lfp;
  insert into falm.puntuacion (activo_id, jornada_lfp_id, puntos)
  select aa.activo_id, v_lfp, 3 from falm.alineacion_activo aa where aa.alineacion_id = v_ali;

  select count(*) filter (where rol='SUPLENTE' and cuenta) into v_n from falm.once_resuelto(v_ali);
  if v_n <> 0 then v_fallos := v_fallos || format('1: entran %s suplentes sin huecos', v_n); end if;
  if falm.puntos_once(v_ali) <> 33 then
    v_fallos := v_fallos || format('1: total %s, esperado 33', falm.puntos_once(v_ali));
  end if;

  -- 2. Se cae un titular de campo: lo tapa el primer suplente por prioridad que
  --    lleve esa linea marcada, y queda dicho por quien entra.
  select o.activo_id, o.pos into v_caido, v_hueco
    from falm.once_resuelto(v_ali) o
   where o.rol='TITULAR' and o.pos <> 'PORTERO'
     and exists (select 1 from falm.once_resuelto(v_ali) s
                  where s.rol='SUPLENTE' and o.pos = any(s.lineas))
   limit 1;
  if v_caido is not null then
    delete from falm.puntuacion where jornada_lfp_id = v_lfp and activo_id = v_caido;
    select count(*) filter (where rol='SUPLENTE' and cuenta) into v_n from falm.once_resuelto(v_ali);
    if v_n <> 1 then v_fallos := v_fallos || format('2: entran %s suplentes por un hueco', v_n); end if;

    select o.activo_id, o.entra_por into v_tapa, v_por
      from falm.once_resuelto(v_ali) o where o.rol='SUPLENTE' and o.cuenta limit 1;
    if v_por is distinct from v_caido then
      v_fallos := v_fallos || '2: el suplente no dice que entra por el titular caido';
    end if;
    -- El total no cambia: entra uno con los mismos 3 puntos que el que se cayo.
    if falm.puntos_once(v_ali) <> 33 then
      v_fallos := v_fallos || format('2: total %s, esperado 33', falm.puntos_once(v_ali));
    end if;
    insert into falm.puntuacion (activo_id, jornada_lfp_id, puntos) values (v_caido, v_lfp, 3);
  end if;

  -- 3. La porteria no deja hueco: si no juega, no entra nadie y se pierden.
  select o.activo_id into v_caido from falm.once_resuelto(v_ali) o
   where o.rol='TITULAR' and o.pos = 'PORTERO' limit 1;
  if v_caido is not null then
    delete from falm.puntuacion where jornada_lfp_id = v_lfp and activo_id = v_caido;
    select count(*) filter (where rol='SUPLENTE' and cuenta) into v_n from falm.once_resuelto(v_ali);
    if v_n <> 0 then v_fallos := v_fallos || format('3: entran %s por la porteria', v_n); end if;
    if falm.puntos_once(v_ali) <> 30 then
      v_fallos := v_fallos || format('3: total %s, esperado 30', falm.puntos_once(v_ali));
    end if;
    insert into falm.puntuacion (activo_id, jornada_lfp_id, puntos) values (v_caido, v_lfp, 3);
  end if;

  -- 4. Un suplente que juega y puntua pero no tiene hueco no suma: cuenta=false
  --    aunque jugo=true. Es el caso que la pantalla tiene que apagar.
  select count(*) into v_n from falm.once_resuelto(v_ali)
   where rol='SUPLENTE' and jugo and not cuenta;
  if v_n = 0 then v_fallos := v_fallos || '4: ningun suplente jugado se queda fuera'; end if;

  -- 5. El total es exactamente la suma de los que cuentan, ni uno mas.
  v_total := falm.puntos_once(v_ali);
  select coalesce(sum(puntos) filter (where cuenta), 0) into v_suma from falm.once_resuelto(v_ali);
  if v_total is distinct from v_suma then
    v_fallos := v_fallos || format('5: puntos_once %s <> suma de los que cuentan %s', v_total, v_suma);
  end if;

  -- 6. Pendiente: sin marcadores en la jornada lo estan todos -es lo que evita
  --    pintar el once entero como caido antes de empezar- y en cuanto el
  --    partido tiene resultado deja de estarlo.
  select count(*) filter (where not pendiente) into v_n from falm.once_resuelto(v_ali);
  if v_n <> 0 then
    v_fallos := v_fallos || format('6: %s no pendientes sin marcadores', v_n);
  end if;
  update falm.partido_lfp set goles_local = 0, goles_visitante = 0 where jornada_lfp_id = v_lfp;
  select count(*) filter (where pendiente) into v_n from falm.once_resuelto(v_ali);
  if v_n <> 0 then
    v_fallos := v_fallos || format('6: %s siguen pendientes con la jornada acabada', v_n);
  end if;

  if array_length(v_fallos, 1) > 0 then
    raise exception 'FALLO: %', array_to_string(v_fallos, ' | ');
  end if;
  raise exception 'TEST OK: 6 casos (sin bajas, titular caido, porteria sin relevo, suplente sin hueco, total, pendiente)';
end $$;
