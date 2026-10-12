-- marcadores_jornada separa lo que queda: por jugar y pendiente de puntuacion.
--
-- La lista de partidos decia "3 por jugar" a CHANATIBORG en la J8 2026-27 cuando dos
-- de ellos eran del Rayo-Athletic suspendido y el tercero (Iñigo Vicente) ya habia
-- jugado y solo faltaba la nota del Racing. Ahora, de los titulares pendientes:
--   sin_nota  = su club ya acabo todos sus partidos de la jornada (FINISHED): jugo y
--               falta la puntuacion.
--   el resto  = su partido aun no ha acabado (por jugar, en juego, suspendido).
--
-- Va en una funcion nueva, marcadores_jornada_detalle, que es la que usa la pantalla:
-- cambiar lo que devuelve la antigua obliga a borrarla, y el conector de Supabase no
-- deja hacer un DROP sin una confirmacion que en remoto no llega. La antigua
-- (marcadores_jornada) se queda sin uso y se puede borrar cuando se quiera.

begin;

create or replace function falm.marcadores_jornada_detalle(p_jornada uuid)
 returns table(equipo_falm_id uuid, enfrentamiento_id uuid, puntos numeric, resueltos integer,
               plazas integer, cerrada boolean, partidos_jugados integer, partidos_total integer,
               sin_nota integer)
 language plpgsql
 stable
 set search_path to 'public', 'falm'
as $function$
declare v_cerrada boolean; v_jug int; v_tot int;
begin
  select coalesce(bool_and(jl.procesada_en is not null), false) into v_cerrada
    from falm.mapeo_jornada mj join falm.jornada_lfp jl on jl.id = mj.jornada_lfp_id
   where mj.jornada_falm_id = p_jornada;

  -- Los de LaLiga ya ACABADOS (el marcador no vale: football-data escribe el 0-0
  -- nada mas empezar), y sin los que se jugaron antes de que abriera la jornada.
  select count(*) filter (where pl.estado = 'FINISHED')::int, count(*)::int into v_jug, v_tot
    from falm.mapeo_jornada mj join falm.partido_lfp pl on pl.jornada_lfp_id = mj.jornada_lfp_id
   where mj.jornada_falm_id = p_jornada
     and not exists (select 1 from falm.jornada_lfp_bloqueo b
                      where b.jornada_lfp_id = pl.jornada_lfp_id and b.equipo_lfp_id = pl.local_id);

  return query
  select a.equipo_falm_id, a.enfrentamiento_id,
         coalesce(sum(o.puntos) filter (where o.cuenta), 0)::numeric,
         (count(*) filter (where o.rol = 'TITULAR' and (o.jugo or not o.pendiente)))::int,
         (count(*) filter (where o.rol = 'TITULAR'))::int,
         v_cerrada, coalesce(v_jug, 0), coalesce(v_tot, 0),
         -- Pendientes cuyo club ya ha acabado: jugaron y falta la nota.
         (count(*) filter (where o.rol = 'TITULAR' and not o.jugo and o.pendiente
            and not exists (
              select 1 from falm.mapeo_jornada mj
                join falm.partido_lfp pl on pl.jornada_lfp_id = mj.jornada_lfp_id
               where mj.jornada_falm_id = p_jornada and pl.estado <> 'FINISHED'
                 and coalesce(jl.equipo_lfp_id, ac.equipo_lfp_id) in (pl.local_id, pl.visitante_id))))::int
    from falm.alineacion a
    cross join lateral falm.once_resuelto(a.id) o
    join falm.activo ac on ac.id = o.activo_id
    left join falm.jugador_lfp jl on jl.id = ac.jugador_lfp_id
   where a.jornada_falm_id = p_jornada
   group by a.equipo_falm_id, a.enfrentamiento_id;
end $function$;

revoke execute on function falm.marcadores_jornada_detalle(uuid) from public, anon;
grant execute on function falm.marcadores_jornada_detalle(uuid) to authenticated;

commit;
