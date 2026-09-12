-- El detalle de un partido, completo. Aplicado el 2026-09-12.
-- (Version final de falm._lado_enf; deja atras detalle_partido_abre_ficha.sql y
--  detalle_partido_estado_jugador.sql, que son los pasos intermedios.)
--
-- Devuelve, por jugador, tres cosas que antes no estaban y que la pantalla necesita:
--
--   estado      PUNTUADO / ESPERANDO / NO_JUGO / PENDIENTE / SIN_PARTIDO.
--               "No tiene puntos" eran tres cosas distintas y se pintaban igual: que su
--               club no haya jugado, que haya jugado y la prensa no haya publicado, o que
--               se leyeran las notas y el no apareciera. La señal de "ya hay notas" es por
--               club, que en una jornada normal los partidos se leen segun acaban.
--   detalle     de que se componen sus puntos EN ESTE partido, para enseñarlo al tocarlo
--               sin abrir la ficha entera. Nombres en camelCase, los mismos de
--               activo_jornadas, para que la pantalla lo lea igual.
--   cuenta      si suma de verdad, y entra_por a quien tapa. Sale de once_resuelto: un
--               suplente puede haber jugado y sumado 4 y no contar, porque el titular al
--               que taparia todavia tiene su partido por delante.
create or replace function falm._lado_enf(p_jor uuid, p_eq uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'falm'
as $function$
  with ali as (
    select id from falm.alineacion where equipo_falm_id = p_eq and jornada_falm_id = p_jor
  ),
  res as (
    select * from falm.once_resuelto((select id from ali))
  ),
  jlfp as (
    select jl.id
    from falm.mapeo_jornada mj
    join falm.jornada_lfp jl on jl.id = mj.jornada_lfp_id
    where mj.jornada_falm_id = p_jor
  ),
  ap as (
    select p.activo_id, sum(p.puntos) puntos,
           (array_agg(p.desglose order by p.jornada_lfp_id))[1] as des
    from jlfp j
    join falm.puntuacion p on p.jornada_lfp_id = j.id
    group by p.activo_id
  ),
  part as (
    select eq.equipo as club_id, min(pl.fecha) as fecha
    from jlfp j
    join falm.partido_lfp pl on pl.jornada_lfp_id = j.id
    cross join lateral (values (pl.local_id), (pl.visitante_id)) as eq(equipo)
    group by eq.equipo
  ),
  leidos as (
    select distinct j2.equipo_lfp_id as club_id
    from falm.puntuacion pu
    join jlfp jj on jj.id = pu.jornada_lfp_id
    join falm.activo a2 on a2.id = pu.activo_id and a2.tipo = 'JUGADOR'
    join falm.jugador_lfp j2 on j2.id = a2.jugador_lfp_id
  ),
  jug as (
    select aa.rol::text rol, aa.orden, aa.activo_id, jl.ext_id,
      case when a.tipo='DEFENSA' then 'Portería '||coalesce(el.nombre,'') else trim(jl.nombre||' '||coalesce(jl.apellido,'')) end nombre,
      case when a.tipo='DEFENSA' then 'PORTERO' else jl.posicion::text end pos,
      coalesce(el.nombre, elj.nombre) club,
      -- una portería no tiene retrato: se queda con el escudo de su club
      case when a.tipo='DEFENSA' then null else jl.foto end foto,
      case when a.tipo='DEFENSA' then el.escudo else elj.escudo end escudo,
      coalesce(ap.puntos,0) puntos, (ap.activo_id is not null) jugo,
      coalesce(rs.cuenta, false) cuenta, rs.entra_por,
      case
        when ap.activo_id is not null then 'PUNTUADO'
        when pt.fecha is null then 'SIN_PARTIDO'
        when ld.club_id is not null then 'NO_JUGO'
        when pt.fecha <= now() then 'ESPERANDO'
        else 'PENDIENTE'
      end estado,
      case when ap.des is null then null else jsonb_build_object(
        'goles', coalesce((ap.des->>'goles')::int, 0),
        'golesPenalti', coalesce((ap.des->>'goles_penalti')::int, 0),
        'asistencias', coalesce((ap.des->>'asistencias')::int, 0),
        'estrellas', coalesce((ap.des->>'estrellas')::numeric, 0),
        'minutosJugados', coalesce((ap.des->>'minutos')::int, 0),
        'imbatido', coalesce((ap.des->>'imbatido')::boolean, false),
        'tarjetasRojas', coalesce((ap.des->>'tarjetas_rojas')::int, 0),
        'golesEnPropia', coalesce((ap.des->>'goles_en_propia')::int, 0),
        'penaltiFallado', coalesce((ap.des->>'penalti_fallado')::int, 0),
        'penaltiParado', coalesce((ap.des->>'penalti_parado')::int, 0),
        'golesEnContra', coalesce((ap.des->>'goles_en_contra')::int, 0),
        'resultado', ap.des->>'resultado') end detalle
    from falm.alineacion al
    join falm.alineacion_activo aa on aa.alineacion_id=al.id
    join falm.activo a on a.id=aa.activo_id
    left join falm.jugador_lfp jl on jl.id=a.jugador_lfp_id
    left join falm.equipo_lfp el on el.id=a.equipo_lfp_id
    left join falm.equipo_lfp elj on elj.id=jl.equipo_lfp_id
    left join ap on ap.activo_id=aa.activo_id
    left join res rs on rs.activo_id = aa.activo_id
    left join part pt on pt.club_id = coalesce(a.equipo_lfp_id, jl.equipo_lfp_id)
    left join leidos ld on ld.club_id = coalesce(a.equipo_lfp_id, jl.equipo_lfp_id)
    where al.equipo_falm_id=p_eq and al.jornada_falm_id=p_jor
  )
  select jsonb_build_object(
    'equipo', (select nombre from falm.equipo_falm where id=p_eq),
    'total', (select coalesce(puntos,0) from falm.v_puntos_jornada_falm where equipo_falm_id=p_eq and jornada_falm_id=p_jor),
    -- si no hay ninguno, es que ese equipo no ha mandado alineación
    'jugadores', coalesce((select jsonb_agg(jsonb_build_object(
        'nombre',nombre,'pos',pos,'rol',rol,'puntos',puntos,'jugo',jugo,
        'foto',foto,'escudo',escudo,
        'activo_id',activo_id,'ext_id',ext_id,'club',club,'estado',estado,
        'cuenta',cuenta,'entra_por',entra_por,'detalle',detalle)
        order by (rol='TITULAR') desc, orden) from jug), '[]'::jsonb)
  );
$function$;
