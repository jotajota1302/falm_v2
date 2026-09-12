-- En el detalle de un partido, en que anda cada jugador. Aplicado el 2026-09-12.
--
-- Hasta ahora solo se sabia si tenia puntuacion o no, y con eso se pintaba en gris a todo
-- el que no la tuviera. Pero "no la tiene" son tres cosas muy distintas: que su club no
-- haya jugado todavia, que haya jugado y la prensa aun no haya publicado las notas -- que
-- es lo que pasa toda la noche despues de un partido -- o que se leyeran las notas y no
-- apareciera, es decir que no jugo.
--
-- Se devuelve 'estado' por jugador:
--   PUNTUADO   tiene puntos, se enseñan
--   ESPERANDO  su partido ya empezo y de ese partido no hay ninguna nota leida todavia
--   NO_JUGO    de su partido ya hay notas y el no esta: no se vistio
--   PENDIENTE  su partido aun no ha empezado
--   SIN_PARTIDO su club no juega esta jornada (bloqueados y demas rarezas)
--
-- La señal de "ya hay notas" es por club y no por jornada: en una jornada normal hay diez
-- partidos y se van leyendo segun acaban, asi que el sabado por la noche puede haber unos
-- puntuados y otros esperando en el mismo once.

create or replace function falm._lado_enf(p_jor uuid, p_eq uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'falm'
as $function$
  with jlfp as (
    select jl.id
    from falm.mapeo_jornada mj
    join falm.jornada_lfp jl on jl.id = mj.jornada_lfp_id
    where mj.jornada_falm_id = p_jor
  ),
  ap as (
    select p.activo_id, sum(p.puntos) puntos
    from jlfp j
    join falm.puntuacion p on p.jornada_lfp_id = j.id
    group by p.activo_id
  ),
  -- cuando juega cada club en esta jornada
  part as (
    select eq.equipo as club_id, min(pl.fecha) as fecha
    from jlfp j
    join falm.partido_lfp pl on pl.jornada_lfp_id = j.id
    cross join lateral (values (pl.local_id), (pl.visitante_id)) as eq(equipo)
    group by eq.equipo
  ),
  -- clubes de los que ya se ha leido alguna nota en esta jornada
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
      case
        when ap.activo_id is not null then 'PUNTUADO'
        when pt.fecha is null then 'SIN_PARTIDO'
        when ld.club_id is not null then 'NO_JUGO'
        when pt.fecha <= now() then 'ESPERANDO'
        else 'PENDIENTE'
      end estado
    from falm.alineacion al
    join falm.alineacion_activo aa on aa.alineacion_id=al.id
    join falm.activo a on a.id=aa.activo_id
    left join falm.jugador_lfp jl on jl.id=a.jugador_lfp_id
    left join falm.equipo_lfp el on el.id=a.equipo_lfp_id
    left join falm.equipo_lfp elj on elj.id=jl.equipo_lfp_id
    left join ap on ap.activo_id=aa.activo_id
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
        'activo_id',activo_id,'ext_id',ext_id,'club',club,'estado',estado)
        order by (rol='TITULAR') desc, orden) from jug), '[]'::jsonb)
  );
$function$;
