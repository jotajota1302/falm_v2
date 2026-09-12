-- Comprueba que el once va por partido y no por jornada.
-- Se revierte solo: termina lanzando una excepcion a proposito, asi que
-- Postgres deshace todo lo que haya tocado. Pasa si el error empieza por
-- "TEST OK"; falla si empieza por "FALLO".
--
-- Se apoya en la jornada 2 de la temporada activa, que es doble. Si un dia deja
-- de serlo, cambia el numero por otra jornada doble (13, 22, 29).

do $test$
declare
  v_eq uuid; v_liga uuid; v_j1 uuid; v_j2 uuid; v_e1 uuid; v_e2 uuid;
  v_form text := '4-4-2'; v_jug jsonb; v_jug2 jsonb;
  v_tit int; v_n int; v_equipos int; v_b1 int; v_b2 int;
  v_ajeno uuid; v_rebota boolean := false; v_heredadas int;
  v_fallos text := '';
begin
  select c.id into v_liga from falm.competicion c
    join falm.temporada t on t.id = c.temporada_id
   where t.activa and c.tipo = 'LIGA';
  select id into v_j1 from falm.jornada_falm where competicion_id = v_liga and numero = 1;
  select id into v_j2 from falm.jornada_falm where competicion_id = v_liga and numero = 2;
  select equipo_local_id into v_eq from falm.enfrentamiento where jornada_falm_id = v_j2 limit 1;
  select e.id into v_e1 from falm.enfrentamiento e
   where e.jornada_falm_id = v_j2 and v_eq in (e.equipo_local_id, e.equipo_visitante_id)
   order by e.id limit 1;
  select e.id into v_e2 from falm.enfrentamiento e
   where e.jornada_falm_id = v_j2 and v_eq in (e.equipo_local_id, e.equipo_visitante_id)
   order by e.id desc limit 1;
  if v_e1 = v_e2 then
    raise exception 'FALLO: la jornada 2 no es doble, el test no vale';
  end if;

  -- 1. la herencia deja un once por equipo Y partido, no uno por jornada
  v_heredadas := falm.heredar_alineaciones(v_j2);
  select count(*), count(distinct equipo_falm_id) into v_n, v_equipos
    from falm.alineacion where jornada_falm_id = v_j2;
  if v_n <> v_equipos * 2 then
    v_fallos := v_fallos || format(' herencia: %s onces para %s equipos (esperaba el doble);', v_n, v_equipos);
  end if;
  if exists (select 1 from falm.alineacion a
              join falm.alineacion_activo aa on aa.alineacion_id = a.id and aa.rol = 'TITULAR'
             where a.jornada_falm_id = v_j2
             group by a.id having count(*) <> 11) then
    v_fallos := v_fallos || ' herencia: algun once no tiene 11 titulares;';
  end if;

  -- 2. un once de oficio se hace para UN partido, sin tocar el otro
  delete from falm.alineacion where jornada_falm_id = v_j2;
  v_tit := falm.generar_alineacion_defecto(v_eq, v_e1);
  if v_tit <> 11 then
    v_fallos := v_fallos || format(' de oficio: %s titulares;', v_tit);
  end if;
  select count(*) into v_n from falm.alineacion where equipo_falm_id = v_eq and jornada_falm_id = v_j2;
  if v_n <> 1 then
    v_fallos := v_fallos || format(' de oficio: ha escrito %s onces y solo pedian uno;', v_n);
  end if;

  select jsonb_agg(jsonb_build_object('activo', aa.activo_id, 'rol', aa.rol,
           'lineas', case when aa.rol = 'SUPLENTE' then to_jsonb(coalesce(aa.lineas, array['MEDIO'])) else null end,
           'orden', aa.orden))
    into v_jug
    from falm.alineacion a join falm.alineacion_activo aa on aa.alineacion_id = a.id
   where a.equipo_falm_id = v_eq and a.enfrentamiento_id = v_e1;
  delete from falm.alineacion where equipo_falm_id = v_eq and jornada_falm_id = v_j2;

  -- 3. guardar sin decir partido lo manda a los dos (lo de siempre)
  perform falm.guardar_alineacion(v_eq, v_j2, v_form, v_jug, null);
  select count(*) into v_n from falm.alineacion where equipo_falm_id = v_eq and jornada_falm_id = v_j2;
  if v_n <> 2 then
    v_fallos := v_fallos || format(' guardar sin partido: %s onces en vez de 2;', v_n);
  end if;

  -- 4. guardar contra uno solo deja el otro como estaba: es todo el objetivo
  select jsonb_agg(j) into v_jug2 from jsonb_array_elements(v_jug) j
   where not (j->>'rol' = 'SUPLENTE' and (j->>'orden')::int = (
     select max((x->>'orden')::int) from jsonb_array_elements(v_jug) x where x->>'rol' = 'SUPLENTE'));
  perform falm.guardar_alineacion(v_eq, v_j2, v_form, v_jug2, v_e1);
  select count(*) into v_b1 from falm.alineacion a join falm.alineacion_activo aa on aa.alineacion_id = a.id
   where a.equipo_falm_id = v_eq and a.enfrentamiento_id = v_e1 and aa.rol = 'SUPLENTE';
  select count(*) into v_b2 from falm.alineacion a join falm.alineacion_activo aa on aa.alineacion_id = a.id
   where a.equipo_falm_id = v_eq and a.enfrentamiento_id = v_e2 and aa.rol = 'SUPLENTE';
  if v_b1 >= v_b2 then
    v_fallos := v_fallos || format(' los dos onces no han divergido (%s y %s suplentes);', v_b1, v_b2);
  end if;

  -- 5. un partido de otra jornada no se cuela
  select e.id into v_ajeno from falm.enfrentamiento e where e.jornada_falm_id = v_j1 limit 1;
  begin
    perform falm.guardar_alineacion(v_eq, v_j2, v_form, v_jug, v_ajeno);
  exception when others then v_rebota := true;
  end;
  if not v_rebota then
    v_fallos := v_fallos || ' ha aceptado un partido de otra jornada;';
  end if;

  -- 6. la jornada la manda el partido, no quien escribe
  update falm.alineacion set jornada_falm_id = v_j1
   where equipo_falm_id = v_eq and enfrentamiento_id = v_e1;
  if (select jornada_falm_id from falm.alineacion
       where equipo_falm_id = v_eq and enfrentamiento_id = v_e1) <> v_j2 then
    v_fallos := v_fallos || ' se ha podido apuntar una jornada que no es la del partido;';
  end if;

  if v_fallos <> '' then
    raise exception 'FALLO:%', v_fallos;
  end if;
  raise exception 'TEST OK: el once va por partido (herencia %, de oficio %, divergen % y % suplentes)',
    v_heredadas, v_tit, v_b1, v_b2;
end $test$;
