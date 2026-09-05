-- Contra quién juega cada uno, dónde, y quién no está para jugar.
--
-- Al mandar la alineación se decide a ciegas: no se ve si el jugador visita al
-- Madrid o recibe al colista, ni si arrastra una lesión. Dos datos distintos y
-- de origen distinto:
--
--   * El rival y si juega en casa ya estaban en la base: falm.partido_lfp tiene
--     los 380 partidos de la temporada con local, visitante y fecha. Cero
--     peticiones a nadie.
--
--   * El estado físico hay que traerlo de fuera. futbolfantasy publica dos
--     páginas, lesionados y sancionados, que enlazan a cada jugador con el
--     mismo slug que ya guardamos en jugador_lfp.slug_ff desde el scraping de
--     puntos, así que el emparejamiento sale gratis: las 70 fichas de la página
--     de lesionados casaron con el catálogo a la primera.
--
-- Lo que NO se hace aquí: la probabilidad de ser titular de todo el mundo. Eso
-- exigiría bajarse las diez previas de cada jornada y se ha dejado fuera a
-- propósito. Lo que sí llega es el estado de los tocados, que es lo que cambia
-- una alineación.
--
-- El dato es orientativo y caduca rápido: un "duda" del jueves puede ser titular
-- el sábado. Se enseña como aviso, nunca impide alinear a nadie.

create table if not exists falm.estado_jugador (
  jugador_lfp_id uuid primary key references falm.jugador_lfp(id) on delete cascade,
  -- LESIONADO, DUDA, SANCIONADO o DISPONIBLE (el que vuelve de una lesión).
  estado text not null check (estado in ('LESIONADO','DUDA','SANCIONADO','DISPONIBLE')),
  detalle text,          -- "Contusión en la rodilla"
  desde text,            -- "23/08"
  vuelve text,           -- "Disponible para la jornada 4"
  actualizado_en timestamptz not null default now()
);

alter table falm.estado_jugador enable row level security;

drop policy if exists sel_auth on falm.estado_jugador;
create policy sel_auth on falm.estado_jugador for select to authenticated using (true);
drop policy if exists wr_admin on falm.estado_jugador;
create policy wr_admin on falm.estado_jugador for all to authenticated using (falm.es_admin());

comment on table falm.estado_jugador is
  'Lesionados, dudas y sancionados leidos de futbolfantasy. Orientativo: solo avisa.';


-- Descarga una de las dos páginas y la parte en un bloque por jugador.
-- Cada bloque es un <div class="elemento lesionado|sancionado col-12"> con el
-- enlace al jugador, el icono que dice cómo está y el comentario médico.
create or replace function falm.parsear_estados_ff(p_url text, p_sancion boolean)
returns table (slug text, estado text, detalle text, desde text, vuelve text)
language plpgsql
as $function$
declare v_html text;
begin
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '25000');
  v_html := (extensions.http(('GET', p_url,
      array[extensions.http_header('User-Agent','Mozilla/5.0 Chrome/126.0 Safari/537.36')],
      null, null)::extensions.http_request)).content;

  return query
  with bloques as (
    select b from unnest(regexp_split_to_array(v_html, '<div class="elemento (?:lesionado|sancionado) col-12">'))
      with ordinality as x(b, ord) where ord >= 2
  )
  select
    (regexp_match(b, '/jugadores/([a-z0-9\-]+)'))[1],
    case
      when p_sancion then 'SANCIONADO'
      -- El icono manda sobre todo lo demás: es lo que se ve en su web.
      when (regexp_match(b, 'images/(lesionado|duda|disponible)_box_min\.png'))[1] = 'duda' then 'DUDA'
      when (regexp_match(b, 'images/(lesionado|duda|disponible)_box_min\.png'))[1] = 'disponible' then 'DISPONIBLE'
      else 'LESIONADO'
    end,
    trim(coalesce((regexp_match(b, '<span class="lesion">([^<]+)</span>'))[1], '')),
    (regexp_match(b, 'Desde\s+([0-9]{2}/[0-9]{2})'))[1],
    trim(coalesce((regexp_match(b, '<span class="gravedad-[0-9]+">([^<]+)</span>'))[1], ''))
  from bloques
  where (regexp_match(b, '/jugadores/([a-z0-9\-]+)'))[1] is not null;
end $function$;


-- Rehace la tabla entera con lo que digan las dos páginas. Se reemplaza en vez
-- de acumular: quien ya no sale es que se ha curado.
create or replace function falm.refrescar_estados_jugadores()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'falm'
as $function$
declare v_les int; v_san int; v_guardados int; v_huerfanos text[];
begin
  if not falm.puede_gestionar() then
    raise exception 'Solo un administrador puede refrescar los estados';
  end if;

  drop table if exists _est;
  create temp table _est on commit drop as
    select * from falm.parsear_estados_ff('https://www.futbolfantasy.com/laliga/lesionados', false)
    union all
    select * from falm.parsear_estados_ff('https://www.futbolfantasy.com/laliga/sancionados', true);

  select count(*) filter (where estado <> 'SANCIONADO'), count(*) filter (where estado = 'SANCIONADO')
    into v_les, v_san from _est;

  -- Si la página viene vacía, no se borra lo que había: es más probable que
  -- hayan cambiado el HTML a que se hayan curado los setenta a la vez.
  if v_les = 0 and v_san = 0 then
    return jsonb_build_object('guardados', 0, 'motivo', 'las dos paginas vinieron vacias, no se toca nada');
  end if;

  select array_agg(distinct e.slug) into v_huerfanos
    from _est e left join falm.jugador_lfp jl on jl.slug_ff = e.slug where jl.id is null;

  delete from falm.estado_jugador;
  insert into falm.estado_jugador (jugador_lfp_id, estado, detalle, desde, vuelve)
  select distinct on (jl.id) jl.id, e.estado, nullif(e.detalle,''), e.desde, nullif(e.vuelve,'')
    from _est e join falm.jugador_lfp jl on jl.slug_ff = e.slug
   -- Una sanción pesa más que una duda: si sale en las dos, manda la sanción.
   order by jl.id, (e.estado = 'SANCIONADO') desc, (e.estado = 'LESIONADO') desc;
  get diagnostics v_guardados = row_count;

  return jsonb_build_object(
    'guardados', v_guardados,
    'lesionados_y_dudas', v_les,
    'sancionados', v_san,
    'sin_casar', coalesce(v_huerfanos, array[]::text[]),
    'cuando', now());
end $function$;


-- Lo que necesita la pantalla de alineación, por activo: contra quién juega esa
-- jornada, si es en casa, y cómo está. Va por activo_id porque es lo que la
-- pantalla maneja, e incluye las porterías: la del Getafe también tiene rival.
--
-- Devuelve un array de partidos, no uno: en las jornadas dobles se juegan dos
-- y una sola alineación puntúa en ambos.
create or replace function falm.contexto_jornada(p_jornada uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'falm'
as $function$
  with jlfp as (
    select mj.jornada_lfp_id id
      from falm.mapeo_jornada mj where mj.jornada_falm_id = p_jornada
  ),
  act as (
    select a.id activo_id,
           coalesce(a.equipo_lfp_id, jl.equipo_lfp_id) club_id,
           a.jugador_lfp_id
      from falm.activo a
      left join falm.jugador_lfp jl on jl.id = a.jugador_lfp_id
  ),
  part as (
    select p.local_id club, p.visitante_id rival, true casa, p.fecha, p.estado
      from falm.partido_lfp p join jlfp j on j.id = p.jornada_lfp_id
    union all
    select p.visitante_id, p.local_id, false, p.fecha, p.estado
      from falm.partido_lfp p join jlfp j on j.id = p.jornada_lfp_id
  )
  select coalesce(jsonb_object_agg(activo_id, dato), '{}'::jsonb)
  from (
    select a.activo_id,
      jsonb_strip_nulls(jsonb_build_object(
        'partidos', (
          select coalesce(jsonb_agg(jsonb_build_object(
                   'rival', el.nombre, 'escudo', el.escudo,
                   'casa', pt.casa, 'fecha', pt.fecha) order by pt.fecha), '[]'::jsonb)
            from part pt left join falm.equipo_lfp el on el.id = pt.rival
           where pt.club = a.club_id),
        'estado', ej.estado,
        'detalle', ej.detalle,
        'vuelve', ej.vuelve
      )) dato
    from act a
    left join falm.estado_jugador ej on ej.jugador_lfp_id = a.jugador_lfp_id
  ) q;
$function$;

grant execute on function falm.refrescar_estados_jugadores() to authenticated;
grant execute on function falm.contexto_jornada(uuid) to authenticated;
-- El parser es interna: la usa la de refresco, no se llama desde la web.
revoke execute on function falm.parsear_estados_ff(text, boolean) from public, anon, authenticated;
