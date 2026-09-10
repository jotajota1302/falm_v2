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
-- El caso 4 no toca la red: es la guardia de MANUAL, que estaba del reves y
-- solo se nota releyendo una jornada, que es justo lo que hace la tarea en vivo
-- cada diez minutos.

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
  --    pedirle el calendario a football-data, porque no hay nada en juego.
  -- ------------------------------------------------------------------
  select pl.id, pl.local_id into v_partido, v_club
    from falm.partido_lfp pl where pl.jornada_lfp_id = v_jl order by pl.fecha limit 1;

  update falm.jornada_lfp set procesada_en = null, fecha_inicio = now() - interval '3 hours'
   where id = v_jl;
  update falm.partido_lfp
     set estado = 'FINISHED', goles_local = 2, goles_visitante = 1,
         fecha = now() - interval '3 hours'
   where id = v_partido;

  v_res := falm.puntuar_en_vivo();

  if (v_res->'leidas'->0->>'partidos_por_leer')::int is distinct from 1 then
    v_fallos := v_fallos || format('2: deberia leer 1 partido de la jornada %s y dice %s', v_num, v_res);
  end if;
  if (v_res->>'en_juego')::int is distinct from 0 then
    v_fallos := v_fallos || format('2: pide calendario con todo cerrado (en_juego %s)', v_res->>'en_juego');
  end if;

  -- ------------------------------------------------------------------
  -- 3. Con ese partido ya leido, no vuelve a leer. Es lo que evita que la tarea
  --    se pase el fin de semana descargando futbolfantasy cada diez minutos:
  --    una lectura por partido y ya.
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

  if array_length(v_fallos, 1) > 0 then
    raise exception 'FALLO: %', array_to_string(v_fallos, ' | ');
  end if;
  raise exception 'TEST OK: 4 casos sobre la jornada LFP % (nada abierto -> no toca; un partido acabado -> lo lee; ya leido -> no repite; MANUAL se respeta)', v_num;
end $test$;
