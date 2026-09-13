-- Esperar al 1x1, no solo a los minutos.
--
-- puntuaciones_esperar_a_la_prensa.sql resolvio el caso del Sevilla - Valencia:
-- futbolfantasy publicaba la lista de jugadores en cuanto acababa el partido y
-- los minutos venian en NULL, asi que se descartaban esas filas y se esperaba.
--
-- El Real Madrid - Rayo de la jornada 5 entro por otro sitio: los minutos SI
-- venian -15 jugadores, con sus minutos y hasta con los goles del 3-1- pero
-- ninguno tenia estrellas, porque el 1x1 todavia no estaba publicado. Con eso,
-- Vinicius se quedaba en 2 puntos (89 minutos, una asistencia -que no puntua- y
-- la victoria) y Diomande en 2, y ahi se quedaban: puntuar_en_vivo solo lee un
-- partido del que no hay ninguna puntuacion, asi que la correccion no habria
-- llegado hasta el cierre de la jornada.
--
-- Dos cambios:
--
-- 1) falm.ingestar_jornada_ff descarta tambien el club del que no hay NI UNA
--    estrella distinta de cero. A un club puntuado siempre le quedan estrellas;
--    si no hay ninguna en los quince, es que no le han puesto notas. Devuelve
--    'sin_estrellas' y 'clubes_sin_1x1' para que se vea a quien se espera.
--
-- 2) falm.puntuar_en_vivo da un partido por leido solo cuando hay puntuaciones
--    de LOS DOS clubes. Antes bastaba con uno: Rayane Belaid figuraba en el
--    catalogo como del Atletico jugando en el Rayo, y su unica fila habria dado
--    por leido el Atletico - Real Sociedad de esa misma noche, que se habria
--    quedado sin puntos sin que saltara nada.
--
-- (Su club se corrigio a mano; era agente libre, asi que no tocaba ninguna
-- plantilla. Ver la-posicion-del-draft-manda: el scraper no cambia la posicion
-- de un fichado, pero el club de un libre si.)

create or replace function falm.ingestar_jornada_ff(
  p_anio integer default null::integer,
  p_jornada integer default null::integer,
  p_temporada_id uuid default null::uuid,
  p_sobreescribir boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'falm'
as $function$
declare
  v_temp uuid; v_lfp uuid; v_anio int; v_payload jsonb; v_nocasados jsonb;
  v_ingestados int; v_casados int; v_marcadores int; v_por_slug int;
  v_sin_notas int; v_sin_estrellas int; v_clubes_crudos text;
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

  -- Un partido ACABADO, no uno con marcador: football-data escribe el 0-0 en
  -- cuanto pita el arbitro, asi que goles_local no dice si ha terminado.
  select count(*) into v_marcadores
    from falm.partido_lfp where jornada_lfp_id = v_lfp and estado = 'FINISHED';
  if v_marcadores = 0 then
    raise exception 'La jornada % todavia no tiene ningun partido acabado. Se cargan solos cuando terminan.', p_jornada;
  end if;

  drop table if exists _ff;
  create temp table _ff on commit drop as
    select * from falm.parsear_jornada_ff(v_anio, p_jornada) where jugo;

  -- Sin minutos no hay prensa publicada: fuera, y ya se leera cuando la haya.
  select count(*) into v_sin_notas from _ff where minutos is null;
  delete from _ff where minutos is null;

  -- Y a veces los minutos llegan antes que el 1x1: el Real Madrid - Rayo entro
  -- con sus 15 jugadores, sus minutos y sus goles, pero CERO estrellas, y eso
  -- son puntos falsos igual que lo anterior. De un club al que le han puesto
  -- notas siempre hay alguna estrella distinta de cero; si no hay ninguna, es
  -- que todavia no se las han puesto.
  with crudos as (
    select equipo from _ff
     group by equipo
    having count(*) filter (where coalesce(estrellas, 0) <> 0) = 0
  )
  select count(*), string_agg(distinct equipo, ', ')
    into v_sin_estrellas, v_clubes_crudos
    from _ff where equipo in (select equipo from crudos);
  delete from _ff where equipo in (
    select equipo from _ff group by equipo
    having count(*) filter (where coalesce(estrellas, 0) <> 0) = 0);

  with
  -- Solo de partidos acabados: con uno en juego, el 0-0 provisional entraria en
  -- el baremo como resultado y como goles encajados del portero.
  score as (
    select local_id as eq, goles_local as gf, goles_visitante as ga
      from falm.partido_lfp where jornada_lfp_id = v_lfp and estado = 'FINISHED'
    union all
    select visitante_id, goles_visitante, goles_local
      from falm.partido_lfp where jornada_lfp_id = v_lfp and estado = 'FINISHED'
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
    'ingestados', v_ingestados, 'sin_notas', v_sin_notas,
    'sin_estrellas', coalesce(v_sin_estrellas, 0), 'clubes_sin_1x1', v_clubes_crudos,
    'no_casados', v_nocasados);
end $function$;

-- OJO: esta version de puntuar_en_vivo la sustituye segunda_fuente_biwenger.sql,
-- que anade el refresco del marcador mientras el partido siga sin puntos y el
-- contraste con biwenger. Lo de aqui se deja porque es lo que documenta este
-- fichero: los dos clubes, no uno.
create or replace function falm.puntuar_en_vivo()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'falm'
as $function$
declare
  v_temp uuid; v_anio int; v_ref jsonb; v_ing jsonb;
  v_en_juego int; v_por_leer int; v_hechas jsonb := '[]'::jsonb; r record;
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

  if v_en_juego > 0 then
    begin
      v_ref := falm.refrescar_calendario_fd();
    exception when others then
      v_ref := jsonb_build_object('error', left(SQLERRM, 120));
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
    'por_marcador', v_en_juego, 'leidas', v_hechas, 'refresco', v_ref);
end $function$;
