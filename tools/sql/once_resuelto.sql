-- falm.once_resuelto: quien suma y por que, jugador a jugador.
-- Aplicado el 2026-09-08.
--
-- La regla de los relevos vivia entera dentro de falm.puntos_once, que solo
-- devolvia el total. La pantalla no tenia con que distinguir un titular que no
-- jugo de uno que jugo y saco 0 -pintaba el mismo 0 gris en los dos casos- ni
-- podia decir que suplente habia entrado por quien. Repetir el algoritmo en
-- TypeScript habria dejado la regla escrita dos veces, que es justo lo que hay
-- que evitar aqui.
--
-- Ahora la resolucion es una funcion propia que devuelve una fila por jugador,
-- y puntos_once no es mas que la suma de los que cuentan. Misma regla para el
-- marcador y para lo que se ve.
--
-- La mecanica, sin cambios respecto a lo que ya habia:
--   1. Los titulares que jugaron suman.
--   2. Un titular que no jugo deja un HUECO DE SU LINEA. Una porteria no deja
--      hueco: si no juega, no entra nadie por ella y esos puntos se pierden.
--   3. Los suplentes, en orden de prioridad, tapan el primer hueco libre cuya
--      linea tengan MARCADA (no la suya: un delantero puede entrar por un
--      medio, y de ahi salen las formaciones imposibles que valida la pantalla).
--   4. Un suplente que no jugo no entra, y el hueco pasa al siguiente.
--   5. "Jugo" es tener fila en falm.puntuacion de esa jornada, no minutos > 0.
--      La ingesta solo registra a quien jugo, asi que en la practica coincide.
--
-- 'pendiente' (anadido el 2026-09-08) dice que el club de ese activo todavia
-- tiene sin acabar algun partido de la jornada. Sin el, "no tiene puntuacion"
-- mezclaba dos cosas muy distintas -no jugo, y aun no le toca- y la pantalla
-- pintaba el once entero como caido mientras la jornada no empezaba. No entra
-- en el calculo: los relevos se resuelven igual, y al acabar la jornada es
-- false para todos.

-- Si cambia la lista de columnas hay que soltarla antes: Postgres no deja
-- cambiar el tipo de retorno con un replace.
drop function if exists falm.once_resuelto(uuid);

create function falm.once_resuelto(p_ali uuid)
returns table (
  activo_id uuid, rol text, pos text, orden int, lineas text[],
  jugo boolean, puntos numeric, cuenta boolean, entra_por uuid, hueco text,
  pendiente boolean)
language plpgsql
stable
set search_path to 'public', 'falm'
as $function$
declare
  v_jor uuid;
  -- Un hueco recuerda de que linea es y de quien era, para poder decir
  -- "entra por Fulano" y no solo "entra".
  vac_pos text[] := array[]::text[];
  vac_act uuid[] := array[]::uuid[];
  vac_used boolean[] := array[]::boolean[];
  r record; i int; v_cuenta boolean; v_entra uuid; v_hueco text;
begin
  select jornada_falm_id into v_jor from falm.alineacion where id = p_ali;
  for r in
    select aa.activo_id, aa.rol::text rol, aa.lineas, aa.orden,
      case when a.tipo='DEFENSA' then 'PORTERO' else jl.posicion::text end as pos,
      coalesce(ap.puntos,0) as puntos, (ap.activo_id is not null) as jugo,
      exists (
        select 1 from falm.mapeo_jornada mj
        join falm.partido_lfp pa on pa.jornada_lfp_id = mj.jornada_lfp_id
        where mj.jornada_falm_id = v_jor
          and coalesce(jl.equipo_lfp_id, a.equipo_lfp_id) in (pa.local_id, pa.visitante_id)
          and pa.goles_local is null
      ) as pendiente
    from falm.alineacion_activo aa
    join falm.activo a on a.id=aa.activo_id
    left join falm.jugador_lfp jl on jl.id=a.jugador_lfp_id
    left join (
      select p.activo_id, sum(p.puntos) puntos
      from falm.mapeo_jornada mj join falm.puntuacion p on p.jornada_lfp_id=mj.jornada_lfp_id
      where mj.jornada_falm_id=v_jor group by p.activo_id
    ) ap on ap.activo_id=aa.activo_id
    where aa.alineacion_id=p_ali
    order by (aa.rol='TITULAR') desc, aa.orden
  loop
    v_cuenta := false; v_entra := null; v_hueco := null;
    if r.rol='TITULAR' then
      if r.jugo then
        v_cuenta := true;
      elsif r.pos in ('DEFENSA','MEDIO','DELANTERO') then
        vac_pos := vac_pos || r.pos;
        vac_act := vac_act || r.activo_id;
        vac_used := vac_used || false;
      end if;
    else -- SUPLENTE, ya en orden de prioridad y solo si jugo
      if r.jugo and coalesce(array_length(vac_pos,1),0) > 0 then
        for i in 1 .. array_length(vac_pos,1) loop
          if not vac_used[i] and vac_pos[i] = any(coalesce(r.lineas, array[]::text[])) then
            vac_used[i] := true; v_cuenta := true;
            v_entra := vac_act[i]; v_hueco := vac_pos[i];
            exit;
          end if;
        end loop;
      end if;
    end if;
    activo_id := r.activo_id; rol := r.rol; pos := r.pos; orden := r.orden;
    lineas := r.lineas; jugo := r.jugo; puntos := r.puntos;
    cuenta := v_cuenta; entra_por := v_entra; hueco := v_hueco;
    pendiente := r.pendiente;
    return next;
  end loop;
end $function$;

-- El total del equipo, que es de donde salen la clasificacion y los premios
-- (via la vista falm.v_puntos_jornada_falm), es la suma de los que cuentan.
-- Al sustituir a la version anterior se comprobaron las dos con 240
-- combinaciones aleatorias de quien juega y quien no, 235 de ellas con algun
-- titular caido: mismo resultado en todas.
create or replace function falm.puntos_once(p_ali uuid)
returns numeric
language sql
stable
set search_path to 'public', 'falm'
as $function$
  select coalesce(sum(puntos) filter (where cuenta), 0) from falm.once_resuelto(p_ali);
$function$;

-- Solo lectura y la RLS de alineacion_activo sigue filtrando lo que cada uno ve.
grant execute on function falm.once_resuelto(uuid) to authenticated;
revoke execute on function falm.once_resuelto(uuid) from public, anon;

-- ---------------------------------------------------------------------------
-- El marcador de Inicio, calculado con lo que haya puntuado ya.
--
-- Salia de falm.enfrentamiento.puntos_local, que solo se escribe cuando
-- recalcular_clasificacion corre, y eso pasa cuando el cron procesa la jornada
-- entera (tres horas despues del ultimo partido). Con partidos de viernes a
-- lunes, el marcador se pasaba el fin de semana en blanco aunque hubiera medio
-- once puntuado. Cuando la jornada se cierra, los dos numeros coinciden.
--
-- 'resueltos' de 'plazas' es cuantas de las once ya tienen desenlace: el
-- titular jugo, o ya se sabe que no juega porque su club acabo el partido.
-- ---------------------------------------------------------------------------
create or replace function falm.marcador_jornada(p_jornada uuid, p_equipo uuid)
returns jsonb
language plpgsql
stable
set search_path to 'public', 'falm'
as $function$
declare v_ali uuid; v_pts numeric; v_res int; v_tot int;
begin
  select id into v_ali from falm.alineacion
   where jornada_falm_id = p_jornada and equipo_falm_id = p_equipo;
  if v_ali is null then
    return jsonb_build_object('alineada', false);
  end if;

  select coalesce(sum(puntos) filter (where cuenta), 0),
         count(*) filter (where rol = 'TITULAR' and (jugo or not pendiente)),
         count(*) filter (where rol = 'TITULAR')
    into v_pts, v_res, v_tot
    from falm.once_resuelto(v_ali);

  return jsonb_build_object('alineada', true, 'puntos', v_pts,
                            'resueltos', v_res, 'plazas', v_tot);
end $function$;

grant execute on function falm.marcador_jornada(uuid, uuid) to authenticated;
revoke execute on function falm.marcador_jornada(uuid, uuid) from public, anon;
