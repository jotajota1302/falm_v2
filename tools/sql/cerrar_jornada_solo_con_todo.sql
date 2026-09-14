-- No cerrar una jornada hasta tener los puntos de todos sus partidos.
--
-- Cerrar es definitivo: procesar_jornada_auto marca `jornada_lfp.procesada_en`
-- y a partir de ahi esa jornada no se vuelve a leer nunca. Hasta ahora la unica
-- condicion para cerrar era tener los MARCADORES de los diez partidos, y eso no
-- basta desde que se espera al 1x1 (puntuaciones_esperar_al_1x1.sql): el
-- Villarreal - Betis se juega el lunes a las 21:00, la jornada se cierra a las
-- 00:00 y la prensa no publica sus notas hasta la madrugada. Se habria cerrado
-- con 30 jugadores sin puntuacion y sin vuelta atras.
--
-- Ademas el marcador tampoco decia si un partido habia acabado: football-data
-- escribe el 0-0 en cuanto empieza. Ahora manda `estado = 'FINISHED'`.
--
-- La comprobacion es la directa y cubre los dos casos: **cada partido acabado
-- tiene que tener puntuaciones de sus dos clubes**. Mirar solo quien aparece en
-- la web sin 1x1 no vale, porque un partido que futbolfantasy todavia no ha
-- subido no aparece de ninguna manera.
--
-- Si falta alguno, no se cierra y se reintenta en la siguiente pasada (cada 2 h).
-- A los 3 dias de acabar la jornada se cierra con lo que haya, que es la salida
-- de emergencia de siempre.

create or replace function falm.procesar_jornada_completa(
  p_anio integer, p_jornada integer,
  p_temporada uuid default null::uuid, p_sobreescribir boolean default false)
returns jsonb
language plpgsql
as $function$
declare v_temp uuid; v_ing jsonb;
begin
  set local statement_timeout to '120s';
  v_temp := coalesce(p_temporada, (select id from falm.temporada where activa order by created_at desc limit 1));
  -- 1. scrape futbolfantasy + marcador + match + scoring + upsert + porterías
  v_ing := falm.ingestar_jornada_ff(p_anio, p_jornada, v_temp, p_sobreescribir);
  -- 2. resultados de la jornada + clasificación + PREMIO de cada jornada + beneficio
  perform falm.recalcular_clasificacion(v_temp);
  return jsonb_build_object(
    'temporada', v_temp, 'jornada', p_jornada,
    'casados', v_ing->'casados', 'ingestados', v_ing->'ingestados',
    -- Se sube quien sigue sin 1x1: quien cierra la jornada necesita saberlo.
    'sin_1x1', v_ing->'clubes_sin_1x1',
    'no_casados', jsonb_array_length(coalesce(v_ing->'no_casados','[]'::jsonb)),
    'ok', true
  );
end $function$;

create or replace function falm.procesar_jornada_auto()
returns jsonb
language plpgsql
as $function$
declare
  v_temp uuid; v_anio int; v_jornada int; v_fin timestamptz; v_jl uuid;
  v_total int; v_acabados int; v_sin_puntos int; v_refresco jsonb; v_res jsonb;
begin
  select id, coalesce(anio_scrape, anio_inicio + 1) into v_temp, v_anio
    from falm.temporada where activa order by created_at desc limit 1;
  if v_temp is null or v_anio is null then
    return jsonb_build_object('procesada', null, 'motivo', 'sin temporada/anio');
  end if;

  select jl.id, jl.numero, jl.fecha_fin into v_jl, v_jornada, v_fin
  from falm.jornada_lfp jl
  join falm.mapeo_jornada mj on mj.jornada_lfp_id = jl.id
  join falm.jornada_falm jf on jf.id = mj.jornada_falm_id
  join falm.competicion c on c.id = jf.competicion_id and c.tipo = 'LIGA'
  where jl.temporada_id = v_temp
    and jl.fecha_fin is not null
    and jl.fecha_fin + interval '3 hours' <= now()
    and jl.procesada_en is null
  order by jl.numero asc
  limit 1;

  if v_jornada is null then
    return jsonb_build_object('procesada', null, 'motivo', 'nada pendiente');
  end if;

  begin
    v_refresco := falm.refrescar_calendario_fd();
  exception when others then
    v_refresco := jsonb_build_object('error', left(SQLERRM, 120));
  end;

  -- Acabados de verdad: el marcador no vale, que football-data escribe el 0-0
  -- en cuanto empieza el partido.
  select count(*), count(*) filter (where estado = 'FINISHED')
    into v_total, v_acabados
  from falm.partido_lfp where jornada_lfp_id = v_jl;

  if v_acabados < v_total and v_fin + interval '3 days' > now() then
    return jsonb_build_object('procesada', null, 'motivo', 'faltan resultados',
      'jornada', v_jornada, 'acabados', v_acabados, 'partidos', v_total,
      'refresco', v_refresco);
  end if;

  v_res := falm.procesar_jornada_completa(v_anio, v_jornada, v_temp, true);

  -- Cerrar es definitivo: se marca procesada_en y esta jornada no se vuelve a
  -- leer nunca mas, asi que antes hay que tener los puntos de TODOS los partidos
  -- acabados. No vale mirar solo quien aparece sin 1x1 en la web: un partido que
  -- futbolfantasy todavia no ha subido no aparece de ninguna manera, y sus
  -- jugadores se quedarian sin puntuacion para siempre. A los 3 dias se cierra
  -- con lo que haya, que es la salida de emergencia de siempre.
  select count(*) into v_sin_puntos
    from falm.partido_lfp pl
   where pl.jornada_lfp_id = v_jl
     and pl.estado = 'FINISHED'
     and not (
       exists (select 1 from falm.puntuacion pu
               join falm.activo a on a.id = pu.activo_id and a.tipo = 'JUGADOR'
               join falm.jugador_lfp j2 on j2.id = a.jugador_lfp_id
               where pu.jornada_lfp_id = v_jl and j2.equipo_lfp_id = pl.local_id)
       and
       exists (select 1 from falm.puntuacion pu
               join falm.activo a on a.id = pu.activo_id and a.tipo = 'JUGADOR'
               join falm.jugador_lfp j2 on j2.id = a.jugador_lfp_id
               where pu.jornada_lfp_id = v_jl and j2.equipo_lfp_id = pl.visitante_id));

  if v_sin_puntos > 0 and v_fin + interval '3 days' > now() then
    return v_res || jsonb_build_object('procesada', null,
      'motivo', 'faltan puntuaciones de la prensa',
      'partidos_sin_puntos', v_sin_puntos, 'jornada', v_jornada, 'refresco', v_refresco);
  end if;

  update falm.jornada_lfp set procesada_en = now() where id = v_jl;

  return v_res || jsonb_build_object('procesada', v_jornada, 'refresco', v_refresco);
end $function$;
