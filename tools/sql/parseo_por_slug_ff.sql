-- Emparejar los jugadores de futbolfantasy por SLUG y no por parecido de nombre.
--
-- El problema: falm._casa_nombre compara el nombre que sale en la tabla de la web
-- con el del catalogo, y la web usa apodos. De 320 jugadores por jornada se
-- quedaban fuera entre 10 y 12, y no eran del filial: 'Fer Niño' (Fernando Niño),
-- 'Bardeli' (Enzo Bardelli), 'Rubén G.' (Rubén García), 'R. de Galarreta' (Íñigo
-- Ruiz de Galarreta), 'Facu González' (Facundo González), 'Brugui' (Roger Brugué),
-- 'Altimira 72'' (Adrià Altimira, con el minuto pegado al nombre). Sus goles no
-- entraban, y se veia al cuadrar los goles de cada equipo contra el marcador:
-- Betis J1, Racing J1, Elche J3 y Levante J3 salian cortos.
--
-- La solucion: cada fila de la web trae el enlace a la ficha del jugador,
--     https://www.futbolfantasy.com/jugadores/enzo-bardelli
-- y falm.jugador_lfp.slug_ff guarda ese mismo slug para los 840 del catalogo,
-- porque el catalogo se cargo de esa web (falm.refrescar_catalogo_ff). O sea que
-- hay un identificador comun y exacto: no hace falta adivinar por el nombre.
--
-- Se mantiene el emparejamiento por nombre como respaldo, por si algun dia la web
-- cambia el formato del enlace. El de slug tiene prioridad.

-- ---------------------------------------------------------------------------
-- parsear_jornada_ff: devuelve ademas el slug de cada jugador.
-- Cambia el tipo de retorno, asi que hay que dropearla antes.
-- ---------------------------------------------------------------------------
drop function if exists falm.parsear_jornada_ff(integer, integer);

create function falm.parsear_jornada_ff(p_anio integer, p_jornada integer)
returns table(match_idx integer, equipo text, jugador text, slug text,
              estrellas integer, goles integer, goles_penalti integer,
              gol_propia integer, roja integer, pen_fallado integer,
              pen_parado integer, asistencias integer, minutos integer,
              goles_encajados integer, jugo boolean)
language plpgsql
as $function$
#variable_conflict use_column
declare v_html text;
begin
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS','25000');
  v_html := (extensions.http(('GET',
      format('https://www.futbolfantasy.com/laliga/puntos/%s/%s/futmondo-prensa', p_anio, p_jornada),
      array[extensions.http_header('User-Agent','Mozilla/5.0 Chrome/126.0 Safari/537.36')], null, null)::extensions.http_request)).content;
  return query
  with eqs as (select m[1] eq, ord from regexp_matches(v_html,'del\s+([^<]+?)\s*</h2>','g') with ordinality as x(m,ord)),
  tabs as (select tabla, ord-1 o from unnest(regexp_split_to_array(v_html,'<table class="tablestats">')) with ordinality as y(tabla,ord) where ord>=2),
  filas as (
    select ((e.ord+1)/2)::int mi, e.eq, f.fila from tabs t join eqs e on e.ord=t.o,
      lateral unnest(regexp_split_to_array(t.tabla,'<tr class="plegado plegable"')) with ordinality as f(fila,ford) where f.ford>=2
  ),
  base as (select mi, eq, fila,
      substring(substring(fila from position('>' in fila)+1) for position('</td>' in substring(fila from position('>' in fila)+1))-1) name_cell from filas),
  parsed as (
    select mi, eq,
      trim(regexp_replace(regexp_replace(regexp_replace(name_cell,'<[^>]*>','','g'),'\s+',' ','g'),'\s+\d+\W*$','')) nom,
      -- El enlace a la ficha del jugador: identidad exacta contra jugador_lfp.slug_ff.
      (regexp_match(fila,'futbolfantasy\.com/jugadores/([a-z0-9\-]+)'))[1] slg,
      nullif(trim((regexp_match(fila,'<td class="marca">\s*([^<]*?)\s*</td>'))[1]),'') marca_raw,
      (select count(*)::int from regexp_matches(fila,'data-tooltip="Gol"','g')) g,
      (select count(*)::int from regexp_matches(fila,'data-tooltip="Gol de penalti"','g')) gp,
      (select count(*)::int from regexp_matches(fila,'data-tooltip="Gol en propia meta"','g')) gpr,
      (select count(*)::int from regexp_matches(fila,'data-tooltip="(Roja directa|Doble amarilla)"','g')) rj,
      (select count(*)::int from regexp_matches(fila,'data-tooltip="Penalti fallado"','g')) pf,
      (select count(*)::int from regexp_matches(fila,'data-tooltip="Penalti parado"','g')) pp,
      (select count(*)::int from regexp_matches(fila,'data-tooltip="Asistencia"','g')) ass,
      (regexp_match(fila,'([0-9]+)\s*Minutos jugados'))[1]::int min,
      coalesce((regexp_match(fila,'([0-9]+)\s*Goles encajados'))[1]::int, 0) genc
    from base)
  select mi, eq, nom, slg,
    case marca_raw when '★★★' then 3 when '★★' then 2 when '★' then 1 when '-' then -1 when 'SC' then 0 when 'S.C.' then 0 else null end,
    g, gp, gpr, rj, pf, pp, ass, min, genc, (marca_raw is not null)
  from parsed where nom <> '';
end $function$;

-- ---------------------------------------------------------------------------
-- ingestar_jornada_ff: casa primero por slug, y si no, por nombre.
--
-- El emparejamiento por slug NO exige que el club coincida, y esto importa: el
-- slug identifica al futbolista, no al club. En el mercado de agosto de 2026,
-- Pablo Garcia jugo las tres jornadas con el Betis y el 1 de septiembre se fue al
-- Racing, y Sergio Martinez jugo la primera con el Racing y a finales de agosto
-- pago su clausula el Real Madrid. En los dos casos el catalogo tiene el club
-- nuevo y la jornada el viejo, y son la misma persona: exigir el club los dejaba
-- fuera. El club de la web se usa solo para el resultado del partido (goles a
-- favor y en contra), que es el del equipo con el que jugo ese dia.
--
-- Por nombre si se exige el club, porque ahi la unica defensa contra un homonimo
-- es que jueguen en el mismo sitio.
-- ---------------------------------------------------------------------------
create or replace function falm.ingestar_jornada_ff(
  p_anio integer, p_jornada integer,
  p_temporada_id uuid default null::uuid, p_sobreescribir boolean default false)
returns jsonb
language plpgsql
as $function$
declare
  v_temp uuid; v_lfp uuid; v_payload jsonb; v_nocasados jsonb;
  v_ingestados int; v_casados int; v_marcadores int; v_por_slug int;
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

  -- Dos llamadas en la misma transaccion chocarian con la temporal de la anterior.
  drop table if exists _ff;
  create temp table _ff on commit drop as
    select * from falm.parsear_jornada_ff(p_anio, p_jornada) where jugo;

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
          union all select 'PENALTI_PARADO' from generate_series(1, m.pen_parado)) t),
      'minutos', coalesce(m.minutos, 90), 'estrellas', m.estrellas::text,
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
  return jsonb_build_object('jornada_lfp', v_lfp, 'jornada_numero', p_jornada,
    'marcadores', v_marcadores, 'casados', v_casados, 'por_slug', v_por_slug,
    'ingestados', v_ingestados, 'no_casados', v_nocasados);
end $function$;

revoke execute on function falm.parsear_jornada_ff(integer, integer) from public, anon, authenticated;
revoke execute on function falm.ingestar_jornada_ff(integer, integer, uuid, boolean) from public, anon;
grant execute on function falm.ingestar_jornada_ff(integer, integer, uuid, boolean) to authenticated;
