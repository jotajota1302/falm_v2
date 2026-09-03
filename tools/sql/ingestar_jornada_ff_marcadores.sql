-- falm.ingestar_jornada_ff: los marcadores dejan de venir de llt-services.
-- Aplicado el 2026-09-03.
--
-- Antes: los goles de cada equipo (necesarios para resultado, porteria a cero y goles en
-- contra) se pedian a api-fantasy.llt-services.com/stats/v1/stats/week/N, y esa API lleva
-- caida desde el verano de 2026 (solo responde una respuesta cacheada de la 2025/26).
-- Ahora: salen de falm.partido_lfp, que carga falm.refrescar_calendario_fd desde
-- football-data. De paso el equipo se resuelve por id y no por nombre.
--
-- Lo que sigue viniendo de futbolfantasy (falm.parsear_jornada_ff): estrellas de prensa,
-- goles, penaltis, tarjetas, minutos y asistencias por jugador.
--
-- Si la jornada no tiene marcadores cargados, la funcion aborta con un mensaje claro en
-- vez de puntuar con los goles a null.

create or replace function falm.ingestar_jornada_ff(
  p_anio integer, p_jornada integer,
  p_temporada_id uuid default null::uuid, p_sobreescribir boolean default false)
returns jsonb
language plpgsql
as $function$
declare
  v_temp uuid; v_lfp uuid; v_payload jsonb; v_nocasados jsonb;
  v_ingestados int; v_casados int; v_marcadores int;
begin
  set local statement_timeout to '90s';
  v_temp := coalesce(p_temporada_id, (select id from falm.temporada where activa order by created_at desc limit 1));
  select id into v_lfp from falm.jornada_lfp where numero = p_jornada and temporada_id = v_temp;
  if v_lfp is null then
    raise exception 'No existe jornada_lfp numero % en temporada %', p_jornada, v_temp;
  end if;

  select count(*) into v_marcadores
    from falm.partido_lfp where jornada_lfp_id = v_lfp and goles_local is not null;
  if v_marcadores = 0 then
    raise exception 'No hay marcadores en falm.partido_lfp para la jornada %. Lanza primero falm.refrescar_calendario_fd(<token>).', p_jornada;
  end if;

  with
  p as (select * from falm.parsear_jornada_ff(p_anio, p_jornada) where jugo),
  score as (
    select local_id as eq, goles_local as gf, goles_visitante as ga
      from falm.partido_lfp where jornada_lfp_id = v_lfp and goles_local is not null
    union all
    select visitante_id, goles_visitante, goles_local
      from falm.partido_lfp where jornada_lfp_id = v_lfp and goles_local is not null
  ),
  pf as (select p.*, falm._equipo_lfp_por_nombre(p.equipo) eq from p),
  matched as (
    select distinct on (pf.equipo, pf.jugador) pf.*, a.id activo_id
    from pf
    join falm.jugador_lfp jl on jl.equipo_lfp_id = pf.eq
    join falm.activo a on a.jugador_lfp_id = jl.id and a.tipo = 'JUGADOR'
    where falm._casa_nombre(jl.nombre, jl.nombre_busqueda, pf.jugador)
    order by pf.equipo, pf.jugador, length(coalesce(jl.nombre_busqueda, jl.nombre))
  ),
  items as (
    select jsonb_build_object('activo_id', m.activo_id,
      'eventos', (select coalesce(jsonb_agg(x),'[]'::jsonb) from (
          select 'GOL' x from generate_series(1, m.goles)
          union all select 'GOL_DE_PENALTI' from generate_series(1, m.goles_penalti)
          union all select 'GOL_EN_PROPIA' from generate_series(1, m.gol_propia)
          union all select 'ROJA' from generate_series(1, m.roja)
          union all select 'PENALTI_FALLADO' from generate_series(1, m.pen_fallado)
          union all select 'PENALTI_PARADO' from generate_series(1, m.pen_parado)) t),
      'minutos', coalesce(m.minutos, 90), 'estrellas', m.estrellas::text,
      'goles_equipo', s.gf, 'goles_rival', s.ga) item
    from matched m left join score s on s.eq = m.eq
  )
  select coalesce(jsonb_agg(item),'[]'::jsonb), count(*) into v_payload, v_casados from items;

  with
  p as (select * from falm.parsear_jornada_ff(p_anio, p_jornada) where jugo),
  pf as (select p.*, falm._equipo_lfp_por_nombre(p.equipo) eq from p),
  matched as (
    select distinct pf.equipo, pf.jugador from pf
    join falm.jugador_lfp jl on jl.equipo_lfp_id = pf.eq
    join falm.activo a on a.jugador_lfp_id = jl.id and a.tipo = 'JUGADOR'
    where falm._casa_nombre(jl.nombre, jl.nombre_busqueda, pf.jugador)
  )
  select coalesce(jsonb_agg(jsonb_build_object('equipo', pf.equipo, 'jugador', pf.jugador)),'[]'::jsonb)
    into v_nocasados
  from pf left join matched mt on mt.equipo = pf.equipo and mt.jugador = pf.jugador
  where mt.jugador is null;

  v_ingestados := falm.ingestar_jornada_cruda(v_lfp, v_payload, p_sobreescribir);
  return jsonb_build_object('jornada_lfp', v_lfp, 'jornada_numero', p_jornada,
    'marcadores', v_marcadores, 'casados', v_casados, 'ingestados', v_ingestados,
    'no_casados', v_nocasados);
end $function$;
