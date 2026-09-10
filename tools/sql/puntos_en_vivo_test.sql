-- Casos de "los puntos segun van acabando los partidos". Se revierte solo:
-- termina lanzando una excepcion a proposito, asi que Postgres deshace los
-- marcadores y las puntuaciones falsas que pone.
-- Pasa si el error empieza por 'TEST OK'; falla si empieza por 'FALLO'.
--
-- Lo que se prueba es LA DECISION, que es donde estan los fallos posibles:
-- cuando lee, cuando no lee y cuando no le toca. Lo que devuelva futbolfantasy
-- da igual aqui; el dia de la jornada la pagina tendra datos y hoy, de la 5,
-- todavia no.
--
-- El 4 es la guardia de MANUAL, que estaba del reves y solo se nota releyendo
-- una jornada. El 5 y el 6 son los dos frenos que evitan las llamadas inutiles:
-- no preguntar por un partido que se esta jugando y no leer la prensa de uno que
-- acaba de terminar.
--
-- El caso 5 hace UNA llamada a football-data, a proposito: comprobar la
-- condicion a mano seria comprobar una copia de la condicion, no la funcion.
-- Como esa llamada devuelve el calendario a sus fechas reales, el caso 6 vuelve
-- a montar el escenario desde cero.

do $test$
declare
  v_jl uuid; v_num int; v_partido uuid; v_club uuid; v_activo uuid;
  v_res jsonb; v_estado text; v_leidas int;
  v_fallos text[] := array[]::text[];
begin
  select jl.id, jl.numero into v_jl, v_num
    from falm.jornada_lfp jl
    join falm.mapeo_jornada mj on mj.jornada_lfp_id = jl.id
    join falm.jornada_falm jf on jf.id = mj.jornada_falm_id and jf.numero = 1
    join falm.competicion c on c.id = jf.competicion_id and c.tipo = 'LIGA';

  -- Punto de partida limpio: ninguna jornada abierta. Hay que forzarlo porque
  -- la 6 tiene un partido adelantado y esta abierta de verdad ahora mismo.
  update falm.jornada_lfp set procesada_en = now() where procesada_en is null;

  -- ------------------------------------------------------------------
  -- 1. Sin ninguna jornada empezada no le toca: ni pide calendario ni lee
  --    futbolfantasy. Es el estado en el que va a estar la mayor parte del anio.
  -- ------------------------------------------------------------------
  v_res := falm.puntuar_en_vivo();
  if v_res->>'motivo' is distinct from 'no hay ninguna jornada en juego' then
    v_fallos := v_fallos || format('1: sin jornadas abiertas dice %s', v_res);
  end if;

  -- ------------------------------------------------------------------
  -- 2. Primer partido acabado y sin puntuaciones: toca leer esa jornada, y sin
  --    pedirle el calendario a football-data, porque de ese ya hay marcador.
  -- ------------------------------------------------------------------
  select pl.id, pl.local_id into v_partido, v_club
    from falm.partido_lfp pl where pl.jornada_lfp_id = v_jl order by pl.fecha limit 1;

  update falm.jornada_lfp set procesada_en = null, fecha_inicio = now() - interval '3 hours'
   where id = v_jl;
  -- Tres horas: acabado hace media hora larga, que es lo que pide la tarea para
  -- molestarse en leer futbolfantasy.
  update falm.partido_lfp
     set estado = 'FINISHED', goles_local = 2, goles_visitante = 1,
         fecha = now() - interval '3 hours'
   where id = v_partido;

  v_res := falm.puntuar_en_vivo();

  if (v_res->'leidas'->0->>'partidos_por_leer')::int is distinct from 1 then
    v_fallos := v_fallos || format('2: deberia leer 1 partido de la jornada %s y dice %s', v_num, v_res);
  end if;
  if (v_res->>'por_marcador')::int is distinct from 0 then
    v_fallos := v_fallos || format('2: pide calendario de un partido que ya tiene marcador (%s)', v_res->>'por_marcador');
  end if;

  -- ------------------------------------------------------------------
  -- 3. Con ese partido ya leido, no vuelve a leer. Es lo que evita que la tarea
  --    se pase el fin de semana descargando futbolfantasy: una lectura por
  --    partido y ya.
  -- ------------------------------------------------------------------
  select a.id into v_activo
    from falm.activo a
    join falm.jugador_lfp jl on jl.id = a.jugador_lfp_id
   where a.tipo = 'JUGADOR' and jl.equipo_lfp_id = v_club
   limit 1;

  insert into falm.puntuacion (activo_id, jornada_lfp_id, puntos, desglose, tipo_insercion)
  values (v_activo, v_jl, 7, '{"minutos": 90}'::jsonb, 'AUTOMATICO');

  v_res := falm.puntuar_en_vivo();
  select jsonb_array_length(v_res->'leidas') into v_leidas;
  if v_leidas <> 0 then
    v_fallos := v_fallos || format('3: vuelve a leer un partido ya leido (%s)', v_res->'leidas');
  end if;

  -- ------------------------------------------------------------------
  -- 4. La guardia de MANUAL, que estaba del reves: lo corregido a mano no lo
  --    pisa la prensa ni pidiendo sobreescribir; lo automatico si.
  -- ------------------------------------------------------------------
  update falm.puntuacion set tipo_insercion = 'MANUAL', puntos = 99
   where activo_id = v_activo and jornada_lfp_id = v_jl;

  v_estado := falm.upsert_puntuacion(v_activo, v_jl, 3, '{"minutos": 45}'::jsonb, 'AUTOMATICO', true);
  if v_estado <> 'OMITIDO' then
    v_fallos := v_fallos || format('4: machaca una puntuacion MANUAL (%s)', v_estado);
  end if;
  if (select puntos from falm.puntuacion where activo_id = v_activo and jornada_lfp_id = v_jl) <> 99 then
    v_fallos := v_fallos || '4: la puntuacion MANUAL ha cambiado de valor';
  end if;

  update falm.puntuacion set tipo_insercion = 'AUTOMATICO'
   where activo_id = v_activo and jornada_lfp_id = v_jl;

  v_estado := falm.upsert_puntuacion(v_activo, v_jl, 3, '{"minutos": 45}'::jsonb, 'AUTOMATICO', true);
  if v_estado <> 'ACTUALIZADO' then
    v_fallos := v_fallos || format('4: no corrige una automatica cuando se le pide (%s)', v_estado);
  end if;

  v_estado := falm.upsert_puntuacion(v_activo, v_jl, 5, '{"minutos": 60}'::jsonb, 'AUTOMATICO', false);
  if v_estado <> 'OMITIDO' then
    v_fallos := v_fallos || format('4: reescribe sin que se lo pidan (%s)', v_estado);
  end if;

  -- ------------------------------------------------------------------
  -- 5. Un partido EN JUEGO no hace preguntar por el calendario. Es el freno que
  --    mas llamadas ahorra: con la regla vieja -"empezado y sin cerrar"- salian
  --    130 llamadas por jornada, y 120 no servian para nada, porque el marcador
  --    provisional no se usa hasta que la prensa publica las notas.
  -- ------------------------------------------------------------------
  select pl.id into v_partido
    from falm.partido_lfp pl
   where pl.jornada_lfp_id = v_jl and pl.id <> v_partido order by pl.fecha limit 1;

  update falm.partido_lfp
     set estado = 'IN_PLAY', goles_local = null, goles_visitante = null,
         fecha = now() - interval '1 hour'
   where id = v_partido;

  v_res := falm.puntuar_en_vivo();
  if (v_res->>'por_marcador')::int is distinct from 0 then
    v_fallos := v_fallos || format('5: pregunta el calendario de un partido que se esta jugando (%s)', v_res->>'por_marcador');
  end if;

  -- Y cuando ya deberia haber acabado y sigue sin marcador, si pregunta. Esta es
  -- la unica llamada de red del test, y hay que hacerla: comprobar la condicion
  -- a mano seria comprobar una copia de la condicion, no la funcion.
  update falm.partido_lfp set fecha = now() - interval '3 hours' where id = v_partido;

  v_res := falm.puntuar_en_vivo();
  if (v_res->>'por_marcador')::int < 1 then
    v_fallos := v_fallos || format('5: un partido que ya deberia haber acabado no dispara la peticion de marcador (%s)', v_res);
  end if;

  -- ------------------------------------------------------------------
  -- 6. Un partido recien acabado tampoco se lee todavia: la prensa tarda un rato
  --    en publicarse y sin este margen la primera lectura de cada partido se
  --    bajaba 5 MB para encontrar la tabla vacia.
  -- ------------------------------------------------------------------
  -- Ojo: la llamada anterior ha refrescado el calendario de verdad, asi que ha
  -- devuelto los partidos y la jornada a sus fechas reales. Hay que volver a
  -- montar el escenario entero, no solo el partido.
  update falm.jornada_lfp set procesada_en = null, fecha_inicio = now() - interval '3 hours'
   where id = v_jl;
  update falm.jornada_lfp set procesada_en = now()
   where procesada_en is null and id <> v_jl;
  update falm.partido_lfp
     set estado = 'FINISHED', goles_local = 0, goles_visitante = 0,
         fecha = now() - interval '2 hours 10 minutes'
   where id = v_partido;

  v_res := falm.puntuar_en_vivo();
  if v_res->>'motivo' is not null then
    v_fallos := v_fallos || format('6: el escenario no ha quedado montado (%s)', v_res);
  end if;
  select jsonb_array_length(v_res->'leidas') into v_leidas;
  if v_leidas <> 0 then
    v_fallos := v_fallos || format('6: lee la prensa de un partido que acaba de terminar (%s)', v_res->'leidas');
  end if;

  if array_length(v_fallos, 1) > 0 then
    raise exception 'FALLO: %', array_to_string(v_fallos, ' | ');
  end if;
  raise exception 'TEST OK: 6 casos sobre la jornada LFP % (nada abierto -> no toca; acabado -> lo lee; ya leido -> no repite; MANUAL se respeta; en juego -> no pregunta el marcador; recien acabado -> no lee la prensa)', v_num;
end $test$;
