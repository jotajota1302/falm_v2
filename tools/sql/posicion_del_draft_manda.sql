-- La posicion con la que un jugador entro en el draft no la cambia un scraper.
-- Aplicado el 2026-09-09.
--
-- falm.refrescar_catalogo_ff() reescribe el catalogo desde futbolfantasy y, tal
-- como estaba, hacia "posicion = excluded.posicion" para todo el mundo. Si esa
-- web recoloca a un jugador -de MEDIO a DELANTERO, por ejemplo-, el cambio
-- entraba solo y en silencio, y la posicion no es un dato decorativo aqui:
--   - decide en que linea puede alinearse y si la formacion sigue siendo legal,
--   - decide que huecos puede tapar un suplente (falm.once_resuelto),
--   - y el reparto del draft se hizo con la posicion que tenia entonces.
--
-- La regla de la liga es que manda la del draft, y si mas adelante hay que
-- moverla se hace a mano y con el resto de equipos enterados. Asi que el
-- refresco deja en paz la posicion de cualquier jugador que este en una
-- plantilla viva; para los libres si la actualiza, que ahi no rompe nada y es
-- la buena cuando alguien los fiche.
--
-- El resto del refresco no cambia: foto, dorsal, nombre, club y primer_equipo
-- se siguen actualizando. El club si se mueve a proposito: un traspaso es real
-- y el cupo por club tiene que reflejarlo.
--
-- Ademas devuelve 'posicion_respetada' -cuantos fichados traian un puesto
-- distinto y se han dejado como estaban- y 'posicion_a_revisar' con sus
-- nombres. Es la lista de decisiones pendientes; si sale 0, nada que hablar.
--
-- Comprobado antes de tocar nada, contra el respaldo bk_falm_20260909_061500:
-- el refresco lanzado hoy no habia movido ninguna posicion (0 en total y 0 en
-- plantillas), solo 341 fotos y 1 club. Asi que esto no arregla un destrozo:
-- cierra la puerta antes de que pase.

create or replace function falm.refrescar_catalogo_ff(p_slug text default null)
returns jsonb
language plpgsql
as $function$
-- Catalogo de jugadores desde futbolfantasy.com (misma fuente que falm.parsear_jornada_ff,
-- para que falm._casa_nombre empareje las puntuaciones por nombre).
-- Los clubes deben existir ya en falm.equipo_lfp con su ext_id de football-data.
-- Cedidos: futbolfantasy los lista en los dos clubes; manda el que le da dorsal.
-- primer_equipo: lleva dorsal y es el primero con ese dorsal en su club (el filial repite
-- los dorsales bajos y aparece despues en la pagina).
declare
  v_ns constant uuid := 'fa100000-0000-0000-0000-000000000001';
  r record;
  v_html text;
  v_n int;
  v_total int := 0;
  v_clubes int := 0;
  v_revisar text[] := array[]::text[];
begin
  set local statement_timeout to '240s';
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '30000');

  for r in
    select * from (values
      ('alaves',263),('athletic',77),('atletico',78),('barcelona',81),('betis',90),
      ('celta',558),('deportivo',560),('elche',285),('espanyol',80),('getafe',82),
      ('levante',88),('malaga',84),('osasuna',79),('racing',5335),('rayo-vallecano',87),
      ('real-madrid',86),('real-sociedad',92),('sevilla',559),('valencia',95),('villarreal',94)
    ) as t(slug, ext_id)
    where p_slug is null or t.slug = p_slug
  loop
    v_html := (extensions.http(('GET',
        'https://www.futbolfantasy.com/laliga/equipos/' || r.slug || '/plantilla',
        array[extensions.http_header('User-Agent','Mozilla/5.0 Chrome/126.0 Safari/537.36')],
        null, null)::extensions.http_request)).content;

    create temp table tmp_ff as
    with bloques as (
      select b as bloque, i as orden
      from unnest(regexp_split_to_array(v_html, '<div class="overflow-hidden elemento wjugador'))
           with ordinality as x(b, i)
      where i >= 2
    ),
    campos as (
      select orden,
        (regexp_match(bloque, '/jugadores/([a-z0-9\-]+)"'))[1]                      as slug,
        trim((regexp_match(bloque, 'class="jugador">\s*([^<]+)</a>'))[1])           as etiqueta,
        trim((regexp_match(bloque, 'class="posicion">([^<]+)<'))[1])                as pos_txt,
        (regexp_match(bloque, '(https://media\.futbolfantasy\.com/thumb/150x150/[^"'']+/(\d+)\.png)'))[1] as foto,
        (regexp_match(bloque, 'jugadores/ficha/(\d+)\.png'))[1]::int               as ext_id
      from bloques
    ),
    limpio as (
      select distinct on (slug)
        slug, orden,
        nullif((regexp_match(etiqueta, '^(\d+)\.'))[1], '')::int                   as dorsal,
        trim(regexp_replace(etiqueta, '^\d+\.\s*', ''))                            as nombre,
        (case pos_txt when 'Portero' then 'PORTERO' when 'Defensa' then 'DEFENSA'
                      when 'Mediocampista' then 'MEDIO' when 'Delantero' then 'DELANTERO' end)::falm.posicion as posicion,
        foto, ext_id
      from campos
      where slug is not null and etiqueta is not null
        and pos_txt in ('Portero','Defensa','Mediocampista','Delantero')
      order by slug, orden
    )
    select l.*,
           l.dorsal is not null
             and row_number() over (partition by l.dorsal order by l.orden) = 1 as primer_equipo
      from limpio l;

    -- Los fichados a los que la web les cambia el puesto: no se tocan, pero se
    -- anotan para poder hablarlo. Se mira antes de escribir, que despues ya no
    -- se distinguiria.
    v_revisar := v_revisar || array(
      select jl.nombre || ': ' || jl.posicion::text || ' -> ' || m.posicion::text
        from tmp_ff m
        join falm.jugador_lfp jl on jl.slug_ff = m.slug
        join falm.activo a on a.jugador_lfp_id = jl.id
        join falm.plantilla pl on pl.activo_id = a.id and pl.fecha_baja is null
       where pl.temporada_id = (select id from falm.temporada where activa)
         and m.posicion is not null and jl.posicion is distinct from m.posicion);

    insert into falm.jugador_lfp
      (id, slug_ff, ext_id, nombre, apellido, nombre_busqueda, posicion, equipo_lfp_id, foto, dorsal, primer_equipo)
    select extensions.uuid_generate_v5(v_ns, 'juglfp:ff:' || m.slug), m.slug, m.ext_id,
           m.nombre, null, m.nombre, m.posicion,
           extensions.uuid_generate_v5(v_ns, 'eqlfp:' || r.ext_id::text),
           m.foto, m.dorsal, m.primer_equipo
    from tmp_ff m
    on conflict (slug_ff) do update set
      nombre = excluded.nombre, nombre_busqueda = excluded.nombre_busqueda,
      -- La posicion de un jugador fichado se queda como esta: es la del draft y
      -- solo se cambia a mano. Para los libres si vale la de la web.
      posicion = case
        when exists (
          select 1 from falm.activo a
            join falm.plantilla pl on pl.activo_id = a.id and pl.fecha_baja is null
           where a.jugador_lfp_id = falm.jugador_lfp.id)
        then falm.jugador_lfp.posicion
        else excluded.posicion end,
      equipo_lfp_id = excluded.equipo_lfp_id,
      foto = excluded.foto, dorsal = excluded.dorsal, ext_id = excluded.ext_id,
      primer_equipo = excluded.primer_equipo
    -- un cedido solo cambia de club si la nueva ficha le da dorsal (o si la vieja no lo tenia)
    where excluded.dorsal is not null or falm.jugador_lfp.dorsal is null;

    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
    v_clubes := v_clubes + 1;
    drop table tmp_ff;
  end loop;

  return jsonb_build_object('fuente','futbolfantasy','clubes',v_clubes,'filas',v_total,
      'jugadores',(select count(*) from falm.jugador_lfp),
      'primer_equipo',(select count(*) from falm.jugador_lfp where primer_equipo),
      'con_foto',(select count(*) from falm.jugador_lfp where foto is not null),
      -- Fichados a los que la web cambia el puesto. No se les ha tocado: es la
      -- lista de lo que habria que hablar con el resto de equipos.
      'posicion_respetada', coalesce(array_length(v_revisar,1),0),
      'posicion_a_revisar', to_jsonb(v_revisar));
end $function$;
