-- Lectura del calendario de la liga para poder editarlo desde el panel.
--
-- Devuelve, por jornada FALM: su jornada LFP mapeada, la fecha de cierre, si es
-- intocable (tiene resultados o alineaciones) y sus cruces con los ids de los
-- equipos. Va en una RPC y no en embeds de PostgREST porque el panel necesita
-- las tres cosas juntas en una sola llamada.

create or replace function falm.calendario_liga(p_temporada uuid)
returns jsonb
language sql
security definer
set search_path to 'public', 'falm'
as $function$
  with liga as (
    select id from falm.competicion where temporada_id = p_temporada and tipo = 'LIGA'
  )
  select coalesce(jsonb_agg(j order by j->>'numero'), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', jf.id,
      'numero', lpad(jf.numero::text, 3, '0'),
      'n', jf.numero,
      'lfp', (select jl.numero from falm.mapeo_jornada m
               join falm.jornada_lfp jl on jl.id = m.jornada_lfp_id
              where m.jornada_falm_id = jf.id limit 1),
      'fecha_cierre', jf.fecha_cierre,
      'jugada', exists (select 1 from falm.enfrentamiento e
                         where e.jornada_falm_id = jf.id
                           and (e.puntos_local is not null or e.puntos_visitante is not null))
                or exists (select 1 from falm.alineacion al where al.jornada_falm_id = jf.id),
      'cruces', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', e.id,
                 'local_id', e.equipo_local_id,
                 'visitante_id', e.equipo_visitante_id,
                 'local', el.nombre,
                 'visitante', ev.nombre,
                 'puntos_local', e.puntos_local,
                 'puntos_visitante', e.puntos_visitante
               ) order by el.nombre)
        from falm.enfrentamiento e
        join falm.equipo_falm el on el.id = e.equipo_local_id
        join falm.equipo_falm ev on ev.id = e.equipo_visitante_id
        where e.jornada_falm_id = jf.id), '[]'::jsonb)
    ) as j
    from falm.jornada_falm jf, liga
    where jf.competicion_id = liga.id
  ) t;
$function$;

grant execute on function falm.calendario_liga(uuid) to authenticated;
