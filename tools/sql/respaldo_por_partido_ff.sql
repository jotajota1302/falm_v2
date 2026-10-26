-- Respaldo por partido: si la pagina de la jornada no trae las notas de un
-- club, se leen de la pagina de su partido, y se ensenan como provisionales.
--
-- Jornada 8 (11/10/2026): la pagina de puntos de la jornada en futbolfantasy
-- (/laliga/puntos/2027/8/futmondo-prensa) solo traia el Malaga - Espanyol, y
-- con el 1x1 de Marca en "SC" para todos; los partidos del sabado ni salian.
-- La pagina de CADA partido (/partidos/22495-barcelona-getafe) si tenia ya las
-- estrellas de Marca, con la misma tabla, los mismos minutos y los mismos
-- eventos. En la J7 se cotejaron las dos y coincidian una a una: la de la
-- jornada se actualiza mas tarde.
--
-- Como queda:
--
-- 1) La pagina de la jornada sigue siendo la fuente. Solo para un club de un
--    partido ACABADO que no tenga ni una estrella en ella, ni puntuaciones ya
--    guardadas, se descarga la pagina de su partido (unos 1,5 MB). Si el
--    partido trae estrellas de ese club, sus filas sustituyen a las de la
--    jornada; si tampoco, se sigue esperando como siempre (clubes_sin_1x1).
--
-- 2) Esas puntuaciones llevan falm.puntuacion.fuente = 'PARTIDO'. Son
--    provisionales: en cuanto la pagina de la jornada trae al club, la buena
--    las pisa aunque no se pida sobreescribir, y puntuar_en_vivo sigue
--    mirando ese partido cada cuarto de hora hasta que pase.
--
-- 3) falm.clubes_provisionales(jornada_falm) dice a la pantalla que clubes
--    estan asi, mientras su jornada de LaLiga no se haya cerrado.
--
-- Escrito el 11/10/2026 pero no se llego a aplicar; se aplico el 26/10/2026,
-- cuando la LL10 se quedo igual (la jornada solo traia el Alaves - Malaga), con
-- el corte de fila de _parsear_tablas_ff anadido tras el ensayo.
--
-- Las filas que vienen de un partido llevan match_idx >= 100; el resumen de
-- ingestar_jornada_ff ('clubes_por_partido') y el de puntuar_en_vivo
-- ('por_partido') dicen quien ha entrado asi.

begin;

alter table falm.puntuacion add column if not exists fuente text;
comment on column falm.puntuacion.fuente is
  'null = pagina de la jornada de futbolfantasy; PARTIDO = pagina del partido (respaldo, provisional)';

-- El parser de las tablas, sacado aparte para usarlo en las dos paginas. El
-- club de cada tabla es el ultimo "del X</h2>" que la precede: en la pagina de
-- un partido hay otros h2 con "del" (titulares de noticias) y contar por
-- posicion los descolocaba.
create or replace function falm._parsear_tablas_ff(p_html text, p_base int default 0)
returns table(match_idx integer, equipo text, jugador text, slug text, estrellas integer,
  goles integer, goles_penalti integer, gol_propia integer, roja integer, pen_fallado integer,
  pen_parado integer, asistencias integer, minutos integer, goles_encajados integer, jugo boolean)
language sql
immutable
as $function$
  with segs as (
    select s, ord from unnest(regexp_split_to_array(p_html, '<table class="tablestats">'))
      with ordinality as y(s, ord)
  ),
  tabs as (
    select t.s tabla, t.ord - 1 o,
      (select m[1] from regexp_matches(prev.s, 'del\s+([^<]+?)\s*</h2>', 'g') with ordinality as x(m, k)
        order by k desc limit 1) eq
    from segs t join segs prev on prev.ord = t.ord - 1
    where t.ord >= 2
  ),
  -- Cada fila se corta donde acaba su tabla: la ultima seguia hasta la tabla
  -- siguiente, y en la pagina de un partido lo que viene detras es la
  -- cronologia, con un data-tooltip="Gol" por gol. El 26/10/2026 eso le
  -- apuntaba a Enes Unal, el ultimo del Getafe, los 4 goles del Athletic.
  filas as (
    select p_base + ((t.o + 1) / 2)::int mi, t.eq, split_part(f.fila, '</table>', 1) fila from tabs t,
      lateral unnest(regexp_split_to_array(t.tabla, '<tr class="plegado plegable"')) with ordinality as f(fila, ford)
    where f.ford >= 2 and t.eq is not null
  ),
  base as (select mi, eq, fila,
      substring(substring(fila from position('>' in fila)+1) for position('</td>' in substring(fila from position('>' in fila)+1))-1) name_cell from filas),
  parsed as (
    select mi, eq,
      trim(regexp_replace(regexp_replace(regexp_replace(name_cell,'<[^>]*>','','g'),'\s+',' ','g'),'\s+\d+\W*$','')) nom,
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
$function$;

revoke all on function falm._parsear_tablas_ff(text, int) from public;

create or replace function falm.parsear_jornada_ff(p_anio integer, p_jornada integer)
returns table(match_idx integer, equipo text, jugador text, slug text, estrellas integer,
  goles integer, goles_penalti integer, gol_propia integer, roja integer, pen_fallado integer,
  pen_parado integer, asistencias integer, minutos integer, goles_encajados integer, jugo boolean)
language plpgsql
as $function$
#variable_conflict use_column
declare
  v_ua constant text := 'Mozilla/5.0 Chrome/126.0 Safari/537.36';
  v_html text; v_pag text; v_lfp uuid; r record; v_k int := 0;
  v_faltan uuid[]; v_llegan uuid[];
begin
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS','25000');
  v_html := (extensions.http(('GET',
      format('https://www.futbolfantasy.com/laliga/puntos/%s/%s/futmondo-prensa', p_anio, p_jornada),
      array[extensions.http_header('User-Agent', v_ua)], null, null)::extensions.http_request)).content;

  drop table if exists _pj;
  create temp table _pj on commit drop as
    select t.*, falm._equipo_lfp_por_nombre(t.equipo) eq_id from falm._parsear_tablas_ff(v_html, 0) t;

  select j.id into v_lfp
    from falm.jornada_lfp j join falm.temporada te on te.id = j.temporada_id
   where j.numero = p_jornada and coalesce(te.anio_scrape, te.anio_inicio + 1) = p_anio
   order by te.activa desc limit 1;

  -- A que club le faltan las notas: no tiene ni una estrella en la pagina de
  -- la jornada y tampoco tiene ya puntuaciones guardadas. Con lo segundo, un
  -- club que ya entro por su partido no se vuelve a descargar cada cuarto de
  -- hora; se queda como esta hasta que lo traiga la jornada.
  drop table if exists _pj_faltan;
  create temp table _pj_faltan on commit drop as
    select c.id
      from falm.partido_lfp p, unnest(array[p.local_id, p.visitante_id]) c(id)
     where p.jornada_lfp_id = v_lfp and p.estado = 'FINISHED'
       and not exists (select 1 from _pj
                        where _pj.eq_id = c.id and _pj.minutos is not null
                          and coalesce(_pj.estrellas, 0) <> 0)
       and not exists (select 1 from falm.puntuacion pu
                         join falm.activo a on a.id = pu.activo_id and a.tipo = 'JUGADOR'
                         join falm.jugador_lfp jl on jl.id = a.jugador_lfp_id
                        where pu.jornada_lfp_id = v_lfp and jl.equipo_lfp_id = c.id);

  -- Los partidos de la jornada que la pagina enlaza (enlaza tambien los de la
  -- siguiente y los de otras ligas: el cruce con partido_lfp los filtra).
  for r in
    with links as (
      select distinct m[1] ruta, m[2] tip
        from regexp_matches(coalesce(v_html, ''),
          '<a[^>]*href="https://www\.futbolfantasy\.com/partidos/([0-9]+-[a-z0-9-]+)"[^>]*data-tooltip="([^"]*)"', 'g') m
    ),
    eqs as (
      select ruta, (regexp_match(tip, '^(.+?)\s+(?:\d+\s*-\s*\d+|-)\s+(.+)$')) e from links
    )
    select e.ruta, p.local_id, p.visitante_id
      from eqs e
      join falm.partido_lfp p
        on p.jornada_lfp_id = v_lfp and p.estado = 'FINISHED'
       and p.local_id = falm._equipo_lfp_por_nombre(e.e[1])
       and p.visitante_id = falm._equipo_lfp_por_nombre(e.e[2])
     where e.e is not null
       and exists (select 1 from _pj_faltan f where f.id in (p.local_id, p.visitante_id))
     limit 10
  loop
    v_k := v_k + 100;  -- las filas de este partido llevan match_idx v_k + 1
    select array_agg(f.id) into v_faltan
      from _pj_faltan f where f.id in (r.local_id, r.visitante_id);
    begin
      v_pag := (extensions.http(('GET', 'https://www.futbolfantasy.com/partidos/' || r.ruta,
          array[extensions.http_header('User-Agent', v_ua)], null, null)::extensions.http_request)).content;
    exception when others then
      continue;  -- un partido que no baja no tumba la jornada: se reintenta en la siguiente pasada
    end;
    insert into _pj
      select t.*, falm._equipo_lfp_por_nombre(t.equipo) from falm._parsear_tablas_ff(v_pag, v_k) t;
    -- Por club, una sola fuente: el partido solo entra para el club al que le
    -- faltaban las notas y que en el partido si las tiene; para ese club se
    -- quitan las filas de la jornada. Lo demas del partido se tira.
    select array_agg(distinct x.eq_id) into v_llegan
      from _pj x
     where x.match_idx between v_k and v_k + 99
       and x.eq_id = any(v_faltan)
       and x.minutos is not null and coalesce(x.estrellas, 0) <> 0;
    v_llegan := coalesce(v_llegan, '{}');
    delete from _pj
     where _pj.match_idx between v_k and v_k + 99
       and not coalesce(_pj.eq_id = any(v_llegan), false);
    delete from _pj
     where _pj.match_idx < 100 and coalesce(_pj.eq_id = any(v_llegan), false);
  end loop;

  return query
    select t.match_idx, t.equipo, t.jugador, t.slug, t.estrellas, t.goles, t.goles_penalti,
           t.gol_propia, t.roja, t.pen_fallado, t.pen_parado, t.asistencias, t.minutos,
           t.goles_encajados, t.jugo
      from _pj t;
end $function$;

-- ingestar_jornada_cruda: guarda de donde sale cada nota, y una puntuacion
-- provisional la pisa la buena aunque no se haya pedido sobreescribir.
create or replace function falm.ingestar_jornada_cruda(p_jornada_lfp uuid, p_payload jsonb, p_sobreescribir boolean DEFAULT false)
 returns integer
 language plpgsql
as $function$
declare
  v_item     jsonb;
  v_activo   uuid;
  v_pos      falm.posicion;
  v_desglose jsonb;
  v_puntos   numeric;
  v_fuente   text;
  v_pisa     boolean;
  v_count    int := 0;
begin
  for v_item in select * from jsonb_array_elements(p_payload) loop
    v_activo := (v_item->>'activo_id')::uuid;
    v_fuente := v_item->>'fuente';

    select case when a.tipo = 'DEFENSA' then 'PORTERO'::falm.posicion else jl.posicion end
      into v_pos
      from falm.activo a
      left join falm.jugador_lfp jl on jl.id = a.jugador_lfp_id
     where a.id = v_activo;
    if v_pos is null then continue; end if;

    v_desglose := falm.construir_desglose(
      array(select jsonb_array_elements_text(coalesce(v_item->'eventos','[]'::jsonb))),
      (v_item->>'minutos')::int,
      v_item->>'estrellas',
      (v_item->>'goles_equipo')::int,
      (v_item->>'goles_rival')::int
    );
    v_puntos := falm.calcular_puntos(v_pos, v_desglose);

    -- Lo que viene de la pagina de la jornada pisa a lo que entro por la del
    -- partido: es la fuente de siempre y la que da la nota por buena.
    v_pisa := v_fuente is null and exists (
      select 1 from falm.puntuacion
       where activo_id = v_activo and jornada_lfp_id = p_jornada_lfp and fuente = 'PARTIDO');

    if falm.upsert_puntuacion(v_activo, p_jornada_lfp, v_puntos, v_desglose,
                              'AUTOMATICO', p_sobreescribir or v_pisa) <> 'OMITIDO' then
      update falm.puntuacion set fuente = v_fuente
       where activo_id = v_activo and jornada_lfp_id = p_jornada_lfp
         and fuente is distinct from v_fuente;
      v_count := v_count + 1;
    end if;
  end loop;

  perform falm.sincronizar_porterias(p_jornada_lfp);
  return v_count;
end $function$;

-- ingestar_jornada_ff: marca las filas que vienen de un partido y dice que
-- clubes han entrado asi.
do $$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('falm.ingestar_jornada_ff'::regproc);
  v_new := replace(v_def,
    $a$v_sin_notas int; v_sin_estrellas int; v_clubes_crudos text;$a$,
    $a$v_sin_notas int; v_sin_estrellas int; v_clubes_crudos text; v_por_partido text;$a$);
  v_new := replace(v_new,
    $a$  -- Sin minutos no hay prensa publicada$a$,
    $a$  select string_agg(distinct equipo, ', ') into v_por_partido from _ff where match_idx >= 100;

  -- Sin minutos no hay prensa publicada$a$);
  v_new := replace(v_new,
    $a$'goles_equipo', s.gf, 'goles_rival', s.ga) item$a$,
    $a$'goles_equipo', s.gf, 'goles_rival', s.ga,
      'fuente', case when m.match_idx >= 100 then 'PARTIDO' end) item$a$);
  v_new := replace(v_new,
    $a$'clubes_sin_1x1', v_clubes_crudos,$a$,
    $a$'clubes_sin_1x1', v_clubes_crudos, 'clubes_por_partido', v_por_partido,$a$);
  if v_new not like '%v_por_partido text%' or v_new not like '%into v_por_partido%'
     or v_new not like '%''fuente'', case when m.match_idx%' or v_new not like '%''clubes_por_partido''%' then
    raise exception 'ingestar_jornada_ff no tiene la forma esperada; no se toca';
  end if;
  execute v_new;
end $$;

-- puntuar_en_vivo: un partido con notas provisionales sigue "por leer", para
-- que la buena entre en cuanto la publique la pagina de la jornada; y su
-- resumen dice que clubes han entrado por el partido.
do $$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('falm.puntuar_en_vivo'::regproc);
  v_new := replace(v_def,
    $a$    if v_por_leer = 0 then$a$,
    $a$    select v_por_leer + count(*) into v_por_leer
      from falm.partido_lfp pl
     where pl.jornada_lfp_id = r.id and pl.estado = 'FINISHED'
       and exists (select 1 from falm.puntuacion pu
                   join falm.activo a on a.id = pu.activo_id and a.tipo = 'JUGADOR'
                   join falm.jugador_lfp j2 on j2.id = a.jugador_lfp_id
                   where pu.jornada_lfp_id = r.id and pu.fuente = 'PARTIDO'
                     and j2.equipo_lfp_id in (pl.local_id, pl.visitante_id));

    if v_por_leer = 0 then$a$);
  v_new := replace(v_new,
    $a$'sin_1x1', v_ing->'clubes_sin_1x1');$a$,
    $a$'sin_1x1', v_ing->'clubes_sin_1x1', 'por_partido', v_ing->'clubes_por_partido');$a$);
  if v_new not like '%pu.fuente = ''PARTIDO''%' or v_new not like '%''por_partido''%' then
    raise exception 'puntuar_en_vivo no tiene la forma esperada; no se toca';
  end if;
  execute v_new;
end $$;

-- Para la pantalla: los clubes de una jornada de la liga con notas
-- provisionales, mientras su jornada de LaLiga no se haya cerrado.
create or replace function falm.clubes_provisionales(p_jornada_falm uuid)
returns text[]
language sql
stable
security definer
set search_path to 'public', 'falm'
as $function$
  select coalesce(array_agg(distinct e.nombre order by e.nombre), '{}')
    from falm.mapeo_jornada m
    join falm.jornada_lfp j on j.id = m.jornada_lfp_id and j.procesada_en is null
    join falm.puntuacion pu on pu.jornada_lfp_id = j.id and pu.fuente = 'PARTIDO'
    join falm.activo a on a.id = pu.activo_id
    join falm.jugador_lfp jl on jl.id = a.jugador_lfp_id
    join falm.equipo_lfp e on e.id = jl.equipo_lfp_id
   where m.jornada_falm_id = p_jornada_falm;
$function$;
revoke all on function falm.clubes_provisionales(uuid) from public;
grant execute on function falm.clubes_provisionales(uuid) to authenticated;

commit;
