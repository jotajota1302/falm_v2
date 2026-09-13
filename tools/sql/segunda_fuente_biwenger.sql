-- Una segunda opinion para los marcadores: biwenger.
--
-- El Real Madrid - Rayo se quedo guardado 3-1 y fue 4-1. El marcador lo trae
-- football-data y esa noche dio uno provisional; como puntuar_en_vivo solo
-- refrescaba el calendario si habia algun partido SIN resultado, ese 3-1 no se
-- volvia a mirar nunca. Y el marcador no es decorativo: decide victoria o
-- derrota y los goles que le cuentan al portero.
--
-- Dos cambios:
--
-- 1) Se refresca el calendario tambien mientras haya un partido acabado hace
--    menos de 24 h y todavia SIN puntuaciones. Es justo la ventana en la que un
--    marcador provisional acabaria dentro de la puntuacion. En cuanto el
--    partido tiene puntos se deja de preguntar, asi que no son mas llamadas de
--    las que ya se hacian.
--
-- 2) falm.contrastar_marcadores() lee la jornada en curso de biwenger y la
--    compara con la nuestra. Se llama sola desde puntuar_en_vivo cuando hay
--    algo pendiente de puntuar, y el resultado sale en 'contraste' (se ve en
--    Admin, en las tareas automaticas). No bloquea la carga: avisa.
--
-- Lo que NO es biwenger: no trae el 1x1 de Marca. Es el fantasy del diario AS
-- y ofrece cinco sistemas -picas del AS, SofaScore, uno por estadisticas, la
-- media de AS y SofaScore, y la nota de los usuarios-, ninguno de ellos el que
-- usamos para las estrellas. Para eso seguimos dependiendo de futbolfantasy.
-- Sirve, y muy bien, para contrastar marcadores y para ver si un partido ya
-- esta calificado en algun sitio.
--
-- Endpoint (publico, sin clave): https://cf.biwenger.com/api/v2/rounds/la-liga
-- Devuelve la jornada EN CURSO con sus 10 partidos, el marcador y un informe
-- por jugador. Sus nombres de equipo casan todos con falm._equipo_lfp_por_nombre,
-- incluido "Rayo Vallecano" -> "Rayo".
--
-- Ojo: http vive en el schema `extensions`, no en `public`. Hay que ponerlo en
-- el search_path o cualificar la llamada, o salta "function http_get does not exist".

create or replace function falm.contrastar_marcadores()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'falm', 'extensions'
as $function$
declare
  v_j jsonb; v_num int; v_lfp uuid; v_temp uuid; v_res jsonb;
begin
  if not falm.puede_gestionar() then
    raise exception 'Solo un administrador puede contrastar marcadores';
  end if;

  select id into v_temp from falm.temporada where activa order by created_at desc limit 1;
  if v_temp is null then return jsonb_build_object('motivo', 'no hay temporada activa'); end if;

  begin
    select content::jsonb into v_j
      from extensions.http_get('https://cf.biwenger.com/api/v2/rounds/la-liga?score=1');
  exception when others then
    return jsonb_build_object('error', left(SQLERRM, 160));
  end;

  v_num := nullif(regexp_replace(coalesce(v_j->'data'->>'short', v_j->'data'->>'name', ''), '\D', '', 'g'), '')::int;
  if v_num is null then
    return jsonb_build_object('error', 'no se ha podido leer que jornada trae biwenger');
  end if;

  select id into v_lfp from falm.jornada_lfp where numero = v_num and temporada_id = v_temp;
  if v_lfp is null then
    return jsonb_build_object('jornada', v_num, 'motivo', 'esa jornada no existe en esta temporada');
  end if;

  with otro as (
    select falm._equipo_lfp_por_nombre(g->'home'->>'name') as local_id,
           falm._equipo_lfp_por_nombre(g->'away'->>'name') as visitante_id,
           (g->'home'->>'score')::int as gl,
           (g->'away'->>'score')::int as gv,
           g->>'status' as estado
    from jsonb_array_elements(v_j->'data'->'games') g
  ),
  comp as (
    select el.nombre || ' - ' || ev.nombre as partido,
           pl.goles_local as gl_nuestro, pl.goles_visitante as gv_nuestro,
           o.gl as gl_otro, o.gv as gv_otro, o.estado
    from falm.partido_lfp pl
    join otro o on o.local_id = pl.local_id and o.visitante_id = pl.visitante_id
    join falm.equipo_lfp el on el.id = pl.local_id
    join falm.equipo_lfp ev on ev.id = pl.visitante_id
    where pl.jornada_lfp_id = v_lfp
  )
  select jsonb_build_object(
    'jornada', v_num,
    'partidos_contrastados', count(*) filter (where estado = 'finished'),
    'cuadran', count(*) filter (where estado = 'finished'
                                 and gl_nuestro is not distinct from gl_otro
                                 and gv_nuestro is not distinct from gv_otro),
    'discrepancias', coalesce(jsonb_agg(jsonb_build_object(
        'partido', partido,
        'nuestro', coalesce(gl_nuestro::text,'-') || '-' || coalesce(gv_nuestro::text,'-'),
        'biwenger', coalesce(gl_otro::text,'-') || '-' || coalesce(gv_otro::text,'-'))
      ) filter (where estado = 'finished'
                and (gl_nuestro is distinct from gl_otro or gv_nuestro is distinct from gv_otro)),
      '[]'::jsonb))
    into v_res
  from comp;

  return v_res;
end $function$;

revoke all on function falm.contrastar_marcadores() from public;
grant execute on function falm.contrastar_marcadores() to authenticated;

-- Sustituye a la version de puntuaciones_esperar_al_1x1.sql: lo unico nuevo es
-- el refresco mientras el partido siga sin puntos y la llamada al contraste.
create or replace function falm.puntuar_en_vivo()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'falm', 'extensions'
as $function$
declare
  v_temp uuid; v_anio int; v_ref jsonb; v_ing jsonb; v_contraste jsonb;
  v_en_juego int; v_sin_puntos int; v_por_leer int;
  v_hechas jsonb := '[]'::jsonb; r record;
begin
  if not falm.puede_gestionar() then
    raise exception 'Solo un administrador puede puntuar en vivo';
  end if;

  select id, coalesce(anio_scrape, anio_inicio + 1) into v_temp, v_anio
    from falm.temporada where activa order by created_at desc limit 1;
  if v_temp is null then
    return jsonb_build_object('motivo', 'no hay temporada activa');
  end if;

  drop table if exists _vivo;
  create temp table _vivo on commit drop as
    select jl.id, jl.numero
      from falm.jornada_lfp jl
      join falm.mapeo_jornada mj on mj.jornada_lfp_id = jl.id
      join falm.jornada_falm jf on jf.id = mj.jornada_falm_id
      join falm.competicion c on c.id = jf.competicion_id and c.tipo = 'LIGA'
     where jl.temporada_id = v_temp
       and jl.procesada_en is null
       and jl.fecha_inicio is not null
       and jl.fecha_inicio <= now()
     order by jl.numero;

  if not exists (select 1 from _vivo) then
    return jsonb_build_object('motivo', 'no hay ninguna jornada en juego');
  end if;

  select count(*) into v_en_juego
    from falm.partido_lfp pl
    join _vivo v on v.id = pl.jornada_lfp_id
   where pl.goles_local is null
     and pl.fecha <= now() - interval '2 hours'
     and pl.fecha > now() - interval '12 hours';

  -- Un partido acabado hace poco y todavia sin puntos: su marcador puede ser
  -- provisional. El Real Madrid - Rayo se quedo guardado 3-1 cuando fue 4-1, y
  -- ese numero entra en la puntuacion -victoria o derrota, y los goles que le
  -- cuentan al portero-. Mientras no se hayan metido los puntos se vuelve a
  -- preguntar; en cuanto estan, se deja de preguntar.
  select count(*) into v_sin_puntos
    from falm.partido_lfp pl
    join _vivo v on v.id = pl.jornada_lfp_id
   where pl.goles_local is not null
     and pl.fecha > now() - interval '24 hours'
     and not exists (select 1 from falm.puntuacion pu
                     join falm.activo a on a.id = pu.activo_id and a.tipo = 'JUGADOR'
                     join falm.jugador_lfp j2 on j2.id = a.jugador_lfp_id
                     where pu.jornada_lfp_id = pl.jornada_lfp_id
                       and j2.equipo_lfp_id in (pl.local_id, pl.visitante_id));

  if v_en_juego > 0 or v_sin_puntos > 0 then
    begin
      v_ref := falm.refrescar_calendario_fd();
    exception when others then
      v_ref := jsonb_build_object('error', left(SQLERRM, 120));
    end;
    -- Y con el marcador ya fresco, la segunda opinion: si no cuadra con
    -- biwenger, el numero que va a entrar en la puntuacion es dudoso y hay que
    -- mirarlo. Solo se pregunta cuando hay algo pendiente de puntuar.
    begin
      v_contraste := falm.contrastar_marcadores();
    exception when others then
      v_contraste := jsonb_build_object('error', left(SQLERRM, 120));
    end;
  end if;

  for r in select id, numero from _vivo order by numero loop
    -- Un partido esta leido cuando hay puntuaciones de LOS DOS clubes. Antes
    -- bastaba con uno, y una sola fila mal catalogada -un jugador del Rayo
    -- fichado como del Atletico- daba por leido un partido que no se habia
    -- leido: se habria quedado sin puntos hasta el cierre de la jornada.
    select count(*) into v_por_leer
      from falm.partido_lfp pl
     where pl.jornada_lfp_id = r.id
       and pl.goles_local is not null
       and pl.fecha <= now() - interval '2 hours 30 minutes'
       and not (
         exists (select 1 from falm.puntuacion pu
                 join falm.activo a on a.id = pu.activo_id and a.tipo = 'JUGADOR'
                 join falm.jugador_lfp j2 on j2.id = a.jugador_lfp_id
                 where pu.jornada_lfp_id = r.id and j2.equipo_lfp_id = pl.local_id)
         and
         exists (select 1 from falm.puntuacion pu
                 join falm.activo a on a.id = pu.activo_id and a.tipo = 'JUGADOR'
                 join falm.jugador_lfp j2 on j2.id = a.jugador_lfp_id
                 where pu.jornada_lfp_id = r.id and j2.equipo_lfp_id = pl.visitante_id));

    if v_por_leer = 0 then
      continue;
    end if;

    begin
      v_ing := falm.ingestar_jornada_ff(v_anio, r.numero, v_temp, false);
      v_hechas := v_hechas || jsonb_build_object('jornada', r.numero,
        'partidos_por_leer', v_por_leer, 'casados', v_ing->'casados',
        'ingestados', v_ing->'ingestados',
        'sin_1x1', v_ing->'clubes_sin_1x1');
    exception when others then
      v_hechas := v_hechas || jsonb_build_object('jornada', r.numero,
        'partidos_por_leer', v_por_leer, 'error', left(SQLERRM, 160));
    end;
  end loop;

  return jsonb_build_object(
    'abiertas', (select jsonb_agg(numero order by numero) from _vivo),
    'por_marcador', v_en_juego, 'marcador_por_confirmar', v_sin_puntos,
    'leidas', v_hechas, 'refresco', v_ref, 'contraste', v_contraste);
end $function$;
