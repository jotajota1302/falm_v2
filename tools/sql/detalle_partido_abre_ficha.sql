-- El detalle de un partido lleva con que jugador se abre la ficha. Aplicado el 2026-09-12.
--
-- En Partidos se ve el once de los dos equipos con lo que ha sumado cada uno, pero la
-- cifra estaba sola: no habia manera de saber de donde salian esos puntos sin irse a
-- Estadisticas a buscar al jugador. La ficha -- el overlay que ya se abre desde Plantilla,
-- Mercado, Fichajes y Puntuaciones, con los puntos por jornada y el desglose en palabras --
-- servia igual aqui, pero _lado_enf no devolvia con que abrirla.
--
-- Se anaden tres campos por jugador: activo_id (el que usa el historial, y el unico que
-- vale para las porterias de club, que no son un jugador), ext_id y club.

create or replace function falm._lado_enf(p_jor uuid, p_eq uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'falm'
as $function$
  with ap as (
    select p.activo_id, sum(p.puntos) puntos
    from falm.mapeo_jornada mj join falm.puntuacion p on p.jornada_lfp_id=mj.jornada_lfp_id
    where mj.jornada_falm_id=p_jor group by p.activo_id
  ),
  jug as (
    select aa.rol::text rol, aa.orden, aa.activo_id, jl.ext_id,
      case when a.tipo='DEFENSA' then 'Portería '||coalesce(el.nombre,'') else trim(jl.nombre||' '||coalesce(jl.apellido,'')) end nombre,
      case when a.tipo='DEFENSA' then 'PORTERO' else jl.posicion::text end pos,
      coalesce(el.nombre, elj.nombre) club,
      -- una portería no tiene retrato: se queda con el escudo de su club
      case when a.tipo='DEFENSA' then null else jl.foto end foto,
      case when a.tipo='DEFENSA' then el.escudo else elj.escudo end escudo,
      coalesce(ap.puntos,0) puntos, (ap.activo_id is not null) jugo
    from falm.alineacion al
    join falm.alineacion_activo aa on aa.alineacion_id=al.id
    join falm.activo a on a.id=aa.activo_id
    left join falm.jugador_lfp jl on jl.id=a.jugador_lfp_id
    left join falm.equipo_lfp el on el.id=a.equipo_lfp_id
    left join falm.equipo_lfp elj on elj.id=jl.equipo_lfp_id
    left join ap on ap.activo_id=aa.activo_id
    where al.equipo_falm_id=p_eq and al.jornada_falm_id=p_jor
  )
  select jsonb_build_object(
    'equipo', (select nombre from falm.equipo_falm where id=p_eq),
    'total', (select coalesce(puntos,0) from falm.v_puntos_jornada_falm where equipo_falm_id=p_eq and jornada_falm_id=p_jor),
    -- si no hay ninguno, es que ese equipo no ha mandado alineación
    'jugadores', coalesce((select jsonb_agg(jsonb_build_object(
        'nombre',nombre,'pos',pos,'rol',rol,'puntos',puntos,'jugo',jugo,
        'foto',foto,'escudo',escudo,
        'activo_id',activo_id,'ext_id',ext_id,'club',club)
        order by (rol='TITULAR') desc, orden) from jug), '[]'::jsonb)
  );
$function$;
