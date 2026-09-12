-- Distinguir "su partido esta rodando" de "acabo y falta la nota de prensa".
--
-- falm._lado_enf devolvia ESPERANDO para los dos casos, porque solo miraba si
-- la hora del partido ya habia pasado. Con eso, un jugador cuyo club esta
-- jugando en ese momento salia en pantalla como "ya ha jugado, falta su nota",
-- que es mentira: el partido esta en juego y todavia puede hacer cualquier cosa.
--
-- Ahora el estado se parte en dos y el de siempre se queda con su significado
-- exacto:
--   EN_JUEGO   el partido de su club empezo y aun no tiene marcador final
--   ESPERANDO  el partido acabo y todavia no hay ni una nota de su club
--
-- La senal de que acabo es el marcador (partido_lfp.goles_local), que lo trae
-- football-data poco despues del pitido; la de que hay notas sigue siendo por
-- club, como en suplente_no_entra_antes_de_tiempo.sql. Entre una y otra pasan
-- horas, y esa ventana es justo la que antes se contaba mal.
--
-- Sustituye a la version de _lado_enf que hay en alineacion_por_partido.sql:
-- lo unico que cambia es la CTE `part` (que ahora lleva `acabado`) y el `case`
-- del estado.

create or replace function falm._lado_enf(p_enf uuid, p_eq uuid)
returns jsonb
language sql
stable security definer
set search_path to 'public', 'falm'
as $function$
  with ali as (
    select id, jornada_falm_id as jor from falm.alineacion
     where equipo_falm_id = p_eq and enfrentamiento_id = p_enf
  ),
  res as (
    select * from falm.once_resuelto((select id from ali))
  ),
  jlfp as (
    select jl.id
    from falm.mapeo_jornada mj
    join falm.jornada_lfp jl on jl.id = mj.jornada_lfp_id
    where mj.jornada_falm_id = (select jor from ali)
  ),
  ap as (
    select p.activo_id, sum(p.puntos) puntos,
           (array_agg(p.desglose order by p.jornada_lfp_id))[1] as des
    from jlfp j
    join falm.puntuacion p on p.jornada_lfp_id = j.id
    group by p.activo_id
  ),
  -- Cuando juega su club y si ya ha acabado: sin lo segundo, "el partido esta
  -- rodando" y "acabo y falta la nota de prensa" eran el mismo estado.
  part as (
    select eq.equipo as club_id, min(pl.fecha) as fecha,
           bool_and(pl.goles_local is not null) as acabado
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
      case when a.tipo='DEFENSA' then null else jl.foto end foto,
      case when a.tipo='DEFENSA' then el.escudo else elj.escudo end escudo,
      coalesce(ap.puntos,0) puntos, (ap.activo_id is not null) jugo,
      coalesce(rs.cuenta, false) cuenta, rs.entra_por,
      case
        when ap.activo_id is not null then 'PUNTUADO'
        when pt.fecha is null then 'SIN_PARTIDO'
        when ld.club_id is not null then 'NO_JUGO'
        when pt.fecha > now() then 'PENDIENTE'
        when not pt.acabado then 'EN_JUEGO'
        else 'ESPERANDO'
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
    from ali
    join falm.alineacion_activo aa on aa.alineacion_id = ali.id
    join falm.activo a on a.id=aa.activo_id
    left join falm.jugador_lfp jl on jl.id=a.jugador_lfp_id
    left join falm.equipo_lfp el on el.id=a.equipo_lfp_id
    left join falm.equipo_lfp elj on elj.id=jl.equipo_lfp_id
    left join ap on ap.activo_id=aa.activo_id
    left join res rs on rs.activo_id = aa.activo_id
    left join part pt on pt.club_id = coalesce(a.equipo_lfp_id, jl.equipo_lfp_id)
    left join leidos ld on ld.club_id = coalesce(a.equipo_lfp_id, jl.equipo_lfp_id)
  )
  select jsonb_build_object(
    'equipo', (select nombre from falm.equipo_falm where id=p_eq),
    'total', coalesce((select falm.puntos_once(id) from ali), 0),
    'jugadores', coalesce((select jsonb_agg(jsonb_build_object(
        'nombre',nombre,'pos',pos,'rol',rol,'puntos',puntos,'jugo',jugo,
        'foto',foto,'escudo',escudo,
        'activo_id',activo_id,'ext_id',ext_id,'club',club,'estado',estado,
        'cuenta',cuenta,'entra_por',entra_por,'detalle',detalle)
        order by (rol='TITULAR') desc, orden) from jug), '[]'::jsonb)
  );
$function$;
