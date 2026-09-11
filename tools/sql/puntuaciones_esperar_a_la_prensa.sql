-- Sin notas de prensa no se puntua: se espera. Aplicado el 2026-09-11.
--
-- La noche del Sevilla-Valencia (jornada 5, la primera de la liga FALM) las puntuaciones
-- entraron planas: los 29 jugadores con estrellas 0, goles 0 y 90 minutos clavados. El gol
-- de Juan Iglesias no se lo apunto nadie y Kike Salas se quedaba en 3 puntos en vez de 4.
--
-- No era el parseo: futbolfantasy publica la lista de jugadores en cuanto acaba el partido
-- y vuelca las notas mas tarde, cuando sale la prensa. parsear_jornada_ff casaba a los 27
-- jugadores pero todos venian con minutos NULL, y aqui se les daba 90 por defecto
-- (coalesce(m.minutos, 90)). Esos 90 inventados son lo que convertia "todavia no se sabe"
-- en un dato con pinta de bueno.
--
-- Y una vez guardado, ahi se quedaba: puntuar_en_vivo solo lee los partidos de los que no
-- hay NI UNA puntuacion, y ademas llama sin sobreescribir. La correccion no habria llegado
-- hasta el cierre de la jornada -- el martes de madrugada, porque el ultimo partido es el
-- lunes por la noche --, o sea tres dias enseñando puntos falsos.
--
-- Arreglo: los minutos en NULL son la señal de que la prensa no esta publicada, asi que esas
-- filas no se ingestan. Si de un partido no hay notas todavia, no se guarda nada de el, y
-- como sigue sin puntuaciones la siguiente pasada del cron vuelve a intentarlo -- cada 15
-- minutos -- hasta que esten. Un partido ya publicado entra entero aunque el de al lado
-- todavia no lo este: el filtro es por jugador, no por jornada.
--
-- Se devuelve ademas 'sin_notas' con cuantas filas se han dejado fuera, para verlo desde el
-- panel de operaciones.

create or replace function falm.ingestar_jornada_ff(p_anio integer default null::integer, p_jornada integer default null::integer, p_temporada_id uuid default null::uuid, p_sobreescribir boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'falm'
as $function$
declare
  v_temp uuid; v_lfp uuid; v_anio int; v_payload jsonb; v_nocasados jsonb;
  v_ingestados int; v_casados int; v_marcadores int; v_por_slug int; v_sin_notas int;
begin
  if not falm.puede_gestionar() then
    raise exception 'Solo un administrador puede leer las puntuaciones de una jornada';
  end if;
  if p_jornada is null then
    raise exception 'Hay que decir que jornada leer';
  end if;

  set local statement_timeout to '90s';
  select id, coalesce(anio_scrape, anio_inicio + 1) into v_temp, v_anio
    from falm.temporada
   where id = coalesce(p_temporada_id, (select id from falm.temporada where activa order by created_at desc limit 1));
  v_anio := coalesce(p_anio, v_anio);
  if v_temp is null or v_anio is null then
    raise exception 'No hay temporada activa o le falta el año de scrape';
  end if;

  select id into v_lfp from falm.jornada_lfp where numero = p_jornada and temporada_id = v_temp;
  if v_lfp is null then
    raise exception 'No existe la jornada % en esta temporada', p_jornada;
  end if;

  select count(*) into v_marcadores
    from falm.partido_lfp where jornada_lfp_id = v_lfp and goles_local is not null;
  if v_marcadores = 0 then
    raise exception 'La jornada % todavia no tiene marcadores. Se cargan solos cuando terminan los partidos.', p_jornada;
  end if;

  drop table if exists _ff;
  create temp table _ff on commit drop as
    select * from falm.parsear_jornada_ff(v_anio, p_jornada) where jugo;

  -- Sin minutos no hay prensa publicada: fuera, y ya se leera cuando la haya.
  select count(*) into v_sin_notas from _ff where minutos is null;
  delete from _ff where minutos is null;

  with
  score as (
    select local_id as eq, goles_local as gf, goles_visitante as ga
      from falm.partido_lfp where jornada_lfp_id = v_lfp and goles_local is not null
    union all
    select visitante_id, goles_visitante, goles_local
      from falm.partido_lfp where jornada_lfp_id = v_lfp and goles_local is not null
  ),
  pf as (select f.*, falm._equipo_lfp_por_nombre(f.equipo) eq from _ff f),
  cand as (
    select pf.*, a.id activo_id,
           case when pf.slug is not null and jl.slug_ff = pf.slug then 0 else 1 end prio,
           length(coalesce(jl.nombre_busqueda, jl.nombre)) len
    from pf
    join falm.jugador_lfp jl
      on (pf.slug is not null and jl.slug_ff = pf.slug)
      or (jl.equipo_lfp_id = pf.eq and falm._casa_nombre(jl.nombre, jl.nombre_busqueda, pf.jugador))
    join falm.activo a on a.jugador_lfp_id = jl.id and a.tipo = 'JUGADOR'
  ),
  matched as (
    select distinct on (equipo, jugador) * from cand
    order by equipo, jugador, prio, len
  ),
  items as (
    select m.prio, jsonb_build_object('activo_id', m.activo_id,
      'eventos', (select coalesce(jsonb_agg(x),'[]'::jsonb) from (
          select 'GOL' x from generate_series(1, m.goles)
          union all select 'GOL_DE_PENALTI' from generate_series(1, m.goles_penalti)
          union all select 'GOL_EN_PROPIA' from generate_series(1, m.gol_propia)
          union all select 'ROJA' from generate_series(1, m.roja)
          union all select 'PENALTI_FALLADO' from generate_series(1, m.pen_fallado)
          union all select 'PENALTI_PARADO' from generate_series(1, m.pen_parado)
          -- informativas: no puntúan, pero se guardan para verlas en la ficha
          union all select 'ASISTENCIA' from generate_series(1, coalesce(m.asistencias, 0))) t),
      'minutos', m.minutos, 'estrellas', m.estrellas::text,
      'goles_equipo', s.gf, 'goles_rival', s.ga) item
    from matched m left join score s on s.eq = m.eq
  )
  select coalesce(jsonb_agg(item),'[]'::jsonb), count(*), count(*) filter (where prio = 0)
    into v_payload, v_casados, v_por_slug
  from items;

  with
  pf as (select f.*, falm._equipo_lfp_por_nombre(f.equipo) eq from _ff f),
  matched as (
    select distinct pf.equipo, pf.jugador from pf
    join falm.jugador_lfp jl
      on (pf.slug is not null and jl.slug_ff = pf.slug)
      or (jl.equipo_lfp_id = pf.eq and falm._casa_nombre(jl.nombre, jl.nombre_busqueda, pf.jugador))
    join falm.activo a on a.jugador_lfp_id = jl.id and a.tipo = 'JUGADOR'
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'equipo', pf.equipo, 'jugador', pf.jugador, 'slug', pf.slug)),'[]'::jsonb)
    into v_nocasados
  from pf left join matched mt on mt.equipo = pf.equipo and mt.jugador = pf.jugador
  where mt.jugador is null;

  v_ingestados := falm.ingestar_jornada_cruda(v_lfp, v_payload, p_sobreescribir);
  return jsonb_build_object('jornada_lfp', v_lfp, 'jornada_numero', p_jornada, 'anio', v_anio,
    'marcadores', v_marcadores, 'casados', v_casados, 'por_slug', v_por_slug,
    'ingestados', v_ingestados, 'sin_notas', v_sin_notas, 'no_casados', v_nocasados);
end $function$;

-- Y se borra lo que entro plano del Sevilla-Valencia, para que el cron lo vuelva a leer
-- cuando futbolfantasy publique (las 29 eran AUTOMATICO y SINCRONIZADO_PORTERIA, ninguna
-- corregida a mano):
--   delete from falm.puntuacion pn
--    using falm.jornada_lfp jl
--    where jl.id = pn.jornada_lfp_id and jl.numero = 5
--      and jl.temporada_id = (select id from falm.temporada where activa)
--      and pn.tipo_insercion <> 'MANUAL';
