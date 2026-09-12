-- Las jornadas, con su numero de la liga FALM al lado. Aplicado el 2026-09-12.
--
-- Hay dos numeraciones y hasta ahora se mezclaban sin avisar. La liga FALM empieza en la
-- jornada 5 de LaLiga, asi que la J1 nuestra es la 5 de ellos, y las 1-4 de LaLiga no son
-- ninguna jornada nuestra: se jugaron antes de que empezase la liga y no puntuan.
--
-- El historial del jugador (la ficha) y el selector de Estadisticas pintaban el numero de
-- LaLiga tal cual: en la ficha salian "J1 J2 J3 J4 J6" mientras al lado, en Partidos, la
-- misma jornada se llamaba J1 de la liga. Ahora las tres funciones devuelven tambien el
-- numero FALM -- null cuando esa jornada de LaLiga no esta en la liga -- y la pantalla ya
-- puede decir de cual habla.

create or replace function falm.activo_jornadas(p_activo uuid)
returns jsonb
language sql
security definer
set search_path to 'public', 'falm'
as $function$
  with jorn as (
    select jlf.id, jlf.numero,
           (select jf.numero from falm.mapeo_jornada mj
              join falm.jornada_falm jf on jf.id = mj.jornada_falm_id
              join falm.competicion c on c.id = jf.competicion_id and c.tipo = 'LIGA'
             where mj.jornada_lfp_id = jlf.id limit 1) as falm_numero
    from falm.jornada_lfp jlf
    join falm.temporada t on t.id = jlf.temporada_id and t.activa
    where exists (select 1 from falm.puntuacion p where p.jornada_lfp_id = jlf.id)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'jornada', jsonb_build_object('numero', j.numero, 'falm', j.falm_numero),
      'jugo', (pn.activo_id is not null and coalesce((pn.desglose->>'minutos')::int, 0) > 0),
      'puntosJornada', coalesce(pn.puntos, 0),
      'goles', coalesce((pn.desglose->>'goles')::int, 0),
      'golesPenalti', coalesce((pn.desglose->>'goles_penalti')::int, 0),
      'asistencias', coalesce((pn.desglose->>'asistencias')::int, 0),
      'estrellas', coalesce((pn.desglose->>'estrellas')::numeric, 0),
      'minutosJugados', coalesce((pn.desglose->>'minutos')::int, 0),
      'imbatido', coalesce((pn.desglose->>'imbatido')::boolean, false),
      'tarjetasRojas', coalesce((pn.desglose->>'tarjetas_rojas')::int, 0),
      'golesEnPropia', coalesce((pn.desglose->>'goles_en_propia')::int, 0),
      'penaltiFallado', coalesce((pn.desglose->>'penalti_fallado')::int, 0),
      'penaltiParado', coalesce((pn.desglose->>'penalti_parado')::int, 0),
      'golesEnContra', coalesce((pn.desglose->>'goles_en_contra')::int, 0),
      'resultado', pn.desglose->>'resultado'
    ) order by j.numero), '[]'::jsonb)
  from jorn j
  left join falm.puntuacion pn on pn.jornada_lfp_id = j.id and pn.activo_id = p_activo;
$function$;

create or replace function falm.jugador_jornadas(p_id integer)
returns jsonb
language sql
security definer
set search_path to 'public', 'falm'
as $function$
  with act as (
    select a.id
    from falm.activo a
    join falm.jugador_lfp jl on jl.id = a.jugador_lfp_id
    where jl.ext_id = p_id
    limit 1
  ),
  jorn as (
    select jlf.id, jlf.numero,
           (select jf.numero from falm.mapeo_jornada mj
              join falm.jornada_falm jf on jf.id = mj.jornada_falm_id
              join falm.competicion c on c.id = jf.competicion_id and c.tipo = 'LIGA'
             where mj.jornada_lfp_id = jlf.id limit 1) as falm_numero
    from falm.jornada_lfp jlf
    join falm.temporada t on t.id = jlf.temporada_id and t.activa
    where exists (select 1 from falm.puntuacion p where p.jornada_lfp_id = jlf.id)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'jornada', jsonb_build_object('numero', j.numero, 'falm', j.falm_numero),
      'jugo', (pn.activo_id is not null and coalesce((pn.desglose->>'minutos')::int, 0) > 0),
      'puntosJornada', coalesce(pn.puntos, 0),
      'goles', coalesce((pn.desglose->>'goles')::int, 0),
      'golesPenalti', coalesce((pn.desglose->>'goles_penalti')::int, 0),
      'asistencias', coalesce((pn.desglose->>'asistencias')::int, 0),
      'estrellas', coalesce((pn.desglose->>'estrellas')::numeric, 0),
      'minutosJugados', coalesce((pn.desglose->>'minutos')::int, 0),
      'imbatido', coalesce((pn.desglose->>'imbatido')::boolean, false),
      'tarjetasRojas', coalesce((pn.desglose->>'tarjetas_rojas')::int, 0),
      'golesEnPropia', coalesce((pn.desglose->>'goles_en_propia')::int, 0),
      'penaltiFallado', coalesce((pn.desglose->>'penalti_fallado')::int, 0),
      'penaltiParado', coalesce((pn.desglose->>'penalti_parado')::int, 0),
      'golesEnContra', coalesce((pn.desglose->>'goles_en_contra')::int, 0),
      'resultado', pn.desglose->>'resultado'
    ) order by j.numero), '[]'::jsonb)
  from jorn j
  left join act on true
  left join falm.puntuacion pn on pn.jornada_lfp_id = j.id and pn.activo_id = act.id;
$function$;

-- El selector de Estadisticas: sigue eligiendo por numero de LaLiga -- que es como estan
-- guardadas las puntuaciones -- pero ya dice cual es la de la liga.
create or replace function falm.jornadas_lfp_validas()
returns jsonb
language sql
security definer
set search_path to 'public', 'falm'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
           'numero', numero, 'falm', falm_numero,
           'descripcion', case when falm_numero is not null
                               then 'Jornada ' || falm_numero || ' de la liga (LaLiga ' || numero || ')'
                               else 'LaLiga ' || numero || ', antes de empezar la liga' end)
         order by numero desc), '[]'::jsonb)
  from (
    select distinct jlf.numero,
           (select jf.numero from falm.mapeo_jornada mj
              join falm.jornada_falm jf on jf.id = mj.jornada_falm_id
              join falm.competicion c on c.id = jf.competicion_id and c.tipo = 'LIGA'
             where mj.jornada_lfp_id = jlf.id limit 1) as falm_numero
    from falm.puntuacion pn
    join falm.jornada_lfp jlf on jlf.id = pn.jornada_lfp_id
    join falm.temporada t on t.id = jlf.temporada_id and t.activa
  ) s;
$function$;
