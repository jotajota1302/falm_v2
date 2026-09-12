-- La agenda: con que enfrentamiento habla, y TODOS los de la jornada. 2026-09-12.
--
-- Dos cosas que le faltaban a falm.agenda_equipo:
--
--   1. El id del enfrentamiento, que tenia a mano y no devolvia. Inicio pintaba el marcador
--      del partido en juego, pero para ver los onces habia que irse a Partidos; ahora el
--      detalle se abre ahi mismo y hace falta saber de que partido.
--
--   2. Los dos partidos de una jornada doble. El 'limit 1' devolvia uno solo, asi que en la
--      jornada 2 -- MANCHISTER y TEAM GOURMET con la misma alineacion -- Inicio ensenaba la
--      mitad de lo que se juega esa semana, y el once se preparaba pensando en medio.
--
-- El objeto sigue teniendo los campos de siempre (el primer rival por orden alfabetico) y
-- anade 'rivales' con todos: en una jornada normal es uno y no cambia nada.

create or replace function falm._agenda_item(p_equipo uuid, p_jornada uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'falm'
as $function$
  with mis as (
    select e.id enfrentamiento_id,
      jf.id jornada_id, jf.numero, jf.fecha_cierre fecha, c.tipo comp,
      case when e.equipo_local_id=p_equipo then e.equipo_visitante_id else e.equipo_local_id end rival_id,
      case when e.equipo_local_id=p_equipo then evis.nombre else eloc.nombre end rival,
      (e.equipo_local_id=p_equipo) es_local,
      case when e.equipo_local_id=p_equipo then e.puntos_local else e.puntos_visitante end mis_puntos,
      case when e.equipo_local_id=p_equipo then e.puntos_visitante else e.puntos_local end rival_puntos
    from falm.enfrentamiento e
    join falm.jornada_falm jf on jf.id=e.jornada_falm_id
    join falm.competicion c on c.id=jf.competicion_id
    join falm.equipo_falm eloc on eloc.id=e.equipo_local_id
    join falm.equipo_falm evis on evis.id=e.equipo_visitante_id
    where jf.id = p_jornada
      and (e.equipo_local_id=p_equipo or e.equipo_visitante_id=p_equipo)
  )
  select (select to_jsonb(m0) || jsonb_build_object('rivales',
            (select jsonb_agg(to_jsonb(m2) order by m2.rival) from mis m2))
          from mis m0 order by m0.rival limit 1);
$function$;

create or replace function falm.agenda_equipo(p_equipo uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'falm'
as $function$
  with mis as (
    select jf.id jornada_id, jf.fecha_cierre fecha,
           (e.puntos_local is not null) jugado
    from falm.enfrentamiento e
    join falm.jornada_falm jf on jf.id=e.jornada_falm_id
    where e.equipo_local_id=p_equipo or e.equipo_visitante_id=p_equipo
  )
  select jsonb_build_object(
    'proximo',  falm._agenda_item(p_equipo,
      (select jornada_id from mis where not jugado and fecha > now() order by fecha asc limit 1)),
    'en_juego', falm._agenda_item(p_equipo,
      (select jornada_id from mis where not jugado and fecha <= now() order by fecha desc limit 1)),
    'ultimo',   falm._agenda_item(p_equipo,
      (select jornada_id from mis where jugado order by fecha desc limit 1))
  );
$function$;
