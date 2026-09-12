-- Cuantos partidos de LaLiga van jugados en la jornada. Aplicado el 2026-09-12.
--
-- En Partidos el rotulo decia "1 de 22 resueltos", que obliga a restar de cabeza para
-- saber lo que queda, que es la pregunta de verdad mirando un marcador a medias. Ahora
-- cada equipo lleva debajo sus pendientes ("10 por jugar") y el centro dice como va la
-- jornada de LaLiga: "En juego - 1/10 partidos".
--
-- Cambia el tipo de retorno, asi que toca dropear antes y devolver el grant.
drop function if exists falm.marcadores_jornada(uuid);

create function falm.marcadores_jornada(p_jornada uuid)
returns table(equipo_falm_id uuid, puntos numeric, resueltos integer, plazas integer,
              cerrada boolean, partidos_jugados integer, partidos_total integer)
language plpgsql
stable
set search_path to 'public', 'falm'
as $function$
declare v_cerrada boolean; v_jug int; v_tot int;
begin
  select coalesce(bool_and(jl.procesada_en is not null), false) into v_cerrada
    from falm.mapeo_jornada mj
    join falm.jornada_lfp jl on jl.id = mj.jornada_lfp_id
   where mj.jornada_falm_id = p_jornada;

  -- Los de LaLiga, que son los que hacen que la jornada avance.
  select count(*) filter (where pl.goles_local is not null)::int, count(*)::int
    into v_jug, v_tot
    from falm.mapeo_jornada mj
    join falm.partido_lfp pl on pl.jornada_lfp_id = mj.jornada_lfp_id
   where mj.jornada_falm_id = p_jornada;

  return query
  select a.equipo_falm_id,
         coalesce(sum(o.puntos) filter (where o.cuenta), 0)::numeric,
         count(*) filter (where o.rol = 'TITULAR' and (o.jugo or not o.pendiente))::int,
         count(*) filter (where o.rol = 'TITULAR')::int,
         v_cerrada, coalesce(v_jug, 0), coalesce(v_tot, 0)
    from falm.alineacion a
    cross join lateral falm.once_resuelto(a.id) o
   where a.jornada_falm_id = p_jornada
   group by a.equipo_falm_id;
end $function$;

grant execute on function falm.marcadores_jornada(uuid) to authenticated;
revoke execute on function falm.marcadores_jornada(uuid) from public, anon;
