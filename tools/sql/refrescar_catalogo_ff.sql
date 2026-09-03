-- falm.refrescar_catalogo_ff(): catalogo de jugadores desde futbolfantasy.com.
--
-- Es la misma fuente que scrapea falm.parsear_jornada_ff para las puntuaciones, y
-- falm._casa_nombre empareja POR NOMBRE: si el catalogo sale de otra web, los nombres
-- no coinciden. Medido sobre la jornada 1 de 2026/27 (320 jugadores con nota):
--     catalogo football-data -> casaban 80%
--     catalogo futbolfantasy -> casan 96.9% (los 10 restantes son apodos: 'Rafita', 'Tunde'...)
--
-- Requisitos: los clubes deben existir en falm.equipo_lfp con su ext_id de football-data
-- y con el nombre corto que usa futbolfantasy ('Deportivo', 'Alaves', 'Rayo'...), porque
-- falm._equipo_lfp_por_nombre resuelve por similitud: con 'RC Deportivo La Coruna' el
-- 'Deportivo' de la web se iba al 'Deportivo Alaves'.
--
-- Idempotente: se puede relanzar cada jornada (upsert por slug_ff).

alter table falm.jugador_lfp add column if not exists dorsal integer;
alter table falm.jugador_lfp add column if not exists primer_equipo boolean not null default false;
alter table falm.jugador_lfp add column if not exists slug_ff text;
create unique index if not exists jugador_lfp_slug_ff_uk on falm.jugador_lfp (slug_ff);

create or replace function falm.refrescar_catalogo_ff(p_slug text default null)
returns jsonb
language plpgsql
as $function$
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
    ),
    marcado as (
      select l.*,
             l.dorsal is not null
               and row_number() over (partition by l.dorsal order by l.orden) = 1 as primer_equipo
      from limpio l
    )
    insert into falm.jugador_lfp
      (id, slug_ff, ext_id, nombre, apellido, nombre_busqueda, posicion, equipo_lfp_id, foto, dorsal, primer_equipo)
    select extensions.uuid_generate_v5(v_ns, 'juglfp:ff:' || m.slug), m.slug, m.ext_id,
           m.nombre, null, m.nombre, m.posicion,
           extensions.uuid_generate_v5(v_ns, 'eqlfp:' || r.ext_id::text),
           m.foto, m.dorsal, m.primer_equipo
    from marcado m
    on conflict (slug_ff) do update set
      nombre = excluded.nombre, nombre_busqueda = excluded.nombre_busqueda,
      posicion = excluded.posicion, equipo_lfp_id = excluded.equipo_lfp_id,
      foto = excluded.foto, dorsal = excluded.dorsal, ext_id = excluded.ext_id,
      primer_equipo = excluded.primer_equipo
    where excluded.dorsal is not null or falm.jugador_lfp.dorsal is null;

    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
    v_clubes := v_clubes + 1;
  end loop;

  return jsonb_build_object('fuente','futbolfantasy','clubes',v_clubes,'filas',v_total,
      'jugadores',(select count(*) from falm.jugador_lfp),
      'primer_equipo',(select count(*) from falm.jugador_lfp where primer_equipo),
      'con_foto',(select count(*) from falm.jugador_lfp where foto is not null));
end $function$;

-- Los activos se derivan del catalogo: asi ningun jugador se queda sin activo.
-- Precios por posicion, los mismos que aplica falm.refrescar_catalogo_lfp.
--
--   insert into falm.activo (id, tipo, jugador_lfp_id, precio_mercado)
--   select extensions.uuid_generate_v5('fa100000-0000-0000-0000-000000000001'::uuid,
--          'activo:'||jl.id::text), 'JUGADOR', jl.id,
--          case jl.posicion when 'PORTERO' then 5 when 'DEFENSA' then 5
--                           when 'MEDIO' then 6 else 7 end
--   from falm.jugador_lfp jl
--   on conflict (id) do nothing;
