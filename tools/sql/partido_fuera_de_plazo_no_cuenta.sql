-- Un partido de LaLiga jugado antes de que abra la jornada FALM no cuenta para ella.
--
-- El caso: la jornada 2 (doble) va con la jornada 6 de LaLiga, pero el Real
-- Sociedad - Celta de esa jornada se jugo el 03/09, antes del draft. Sus
-- jugadores ya no se podian alinear (`jornada_lfp_bloqueo`, motivo BLOQUEADO),
-- pero el partido seguia contando para todo lo demas.
--
-- Y el fallo que se vio: Clasificacion decia 3 partidos jugados tras la jornada 1.
-- `recalcular_clasificacion` daba por jugada **cualquier jornada con alineaciones**,
-- y la 2 ya las tenia porque los managers mandan el once con dias de antelacion:
-- sumaba sus dos cruces a 0-0 y hasta repartia el premio de jornada doble.
--
-- Como queda:
--   * una jornada cuenta en la tabla y en los premios cuando ya ha cerrado y han
--     acabado todos sus partidos validos (o LaLiga la ha dado por procesada, que
--     cubre un aplazado). `falm.jornada_cuenta(jornada)`.
--   * los clubes bloqueados de una jornada no puntuan en ella aunque tengan
--     notas (once_resuelto), su partido no sale en el pop-up (_lado_enf) ni en el
--     "N de M partidos" (marcadores_jornada).
--   * el bloqueo de la PRIMERA jornada se calculaba con now(): cada refresco del
--     calendario bloqueaba la jornada 1 entera en cuanto se jugaba. Ahora es
--     desde su propio cierre.

begin;

create or replace function falm.recalcular_bloqueos(p_temporada uuid default null::uuid)
returns integer
language plpgsql
as $function$
declare v_temp uuid; v_n int;
begin
  v_temp := coalesce(p_temporada, (select id from falm.temporada where activa order by created_at desc limit 1));

  delete from falm.jornada_lfp_bloqueo b
   using falm.jornada_lfp jl
   where jl.id = b.jornada_lfp_id and jl.temporada_id = v_temp;

  -- Alineable desde que cierra la jornada FALM anterior. La primera no tiene
  -- anterior: desde su propio cierre. Con now() se bloqueaba entera en cuanto
  -- sus partidos pasaban a estar en el pasado.
  with jor as (
    select jl.id as jlfp_id, jl.numero as jlfp, jf.numero as jfalm, jf.fecha_cierre,
           lag(jf.fecha_cierre) over (order by jf.numero) as abre
    from falm.jornada_lfp jl
    join falm.mapeo_jornada mj on mj.jornada_lfp_id = jl.id
    join falm.jornada_falm jf on jf.id = mj.jornada_falm_id
    join falm.competicion c on c.id = jf.competicion_id and c.tipo = 'LIGA'
    where jl.temporada_id = v_temp
  )
  insert into falm.jornada_lfp_bloqueo (jornada_lfp_id, equipo_lfp_id)
  select j.jlfp_id, eq.equipo
  from jor j
  join falm.partido_lfp p on p.numero_jornada = j.jlfp
  cross join lateral (values (p.local_id), (p.visitante_id)) as eq(equipo)
  where p.fecha < coalesce(j.abre, j.fecha_cierre, now())
  on conflict do nothing;

  get diagnostics v_n = row_count;
  return v_n;
end $function$;

-- Si una jornada ya entra en la tabla: cerrada, con alineaciones y con todos sus
-- partidos validos acabados (o su jornada de LaLiga ya procesada, que es lo que
-- pasa con un aplazado a los 3 dias). Los partidos de clubes bloqueados no
-- cuentan: se jugaron antes de que abriera.
create or replace function falm.jornada_cuenta(p_jornada uuid)
returns boolean
language sql
stable
set search_path to 'public', 'falm'
as $function$
  select jf.fecha_cierre is not null and jf.fecha_cierre <= now()
     and exists (select 1 from falm.alineacion al where al.jornada_falm_id = jf.id)
     and exists (select 1 from falm.mapeo_jornada mj where mj.jornada_falm_id = jf.id)
     and not exists (
       select 1 from falm.mapeo_jornada mj
       join falm.jornada_lfp jl on jl.id = mj.jornada_lfp_id
       join falm.partido_lfp pl on pl.jornada_lfp_id = jl.id
       where mj.jornada_falm_id = jf.id
         and jl.procesada_en is null
         and pl.estado is distinct from 'FINISHED'
         and not exists (select 1 from falm.jornada_lfp_bloqueo b
                          where b.jornada_lfp_id = jl.id and b.equipo_lfp_id = pl.local_id))
  from falm.jornada_falm jf where jf.id = p_jornada;
$function$;

create or replace function falm.recalcular_clasificacion(p_temp uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'falm'
as $function$
declare v_n int; v_jf uuid;
begin
  perform falm.recalcular_clasificacion_guardia(p_temp);

  create temp table if not exists _jugadas (jf uuid primary key) on commit drop;
  truncate _jugadas;
  insert into _jugadas
  select jf.id from falm.jornada_falm jf join falm.competicion c on c.id = jf.competicion_id
   where c.temporada_id = p_temp and falm.jornada_cuenta(jf.id);

  update falm.enfrentamiento e set
    puntos_local = coalesce((select v.puntos from falm.v_puntos_jornada_falm v
                     where v.enfrentamiento_id = e.id and v.equipo_falm_id = e.equipo_local_id), 0),
    puntos_visitante = coalesce((select v.puntos from falm.v_puntos_jornada_falm v
                     where v.enfrentamiento_id = e.id and v.equipo_falm_id = e.equipo_visitante_id), 0)
  where e.jornada_falm_id in (select jf from _jugadas);
  get diagnostics v_n = row_count;

  -- Lo que se escribio antes de tiempo (una jornada con onces pero sin jugar) se
  -- borra: el marcador guardado es lo que la pantalla toma por resultado final.
  update falm.enfrentamiento e set puntos_local = null, puntos_visitante = null
   where (e.puntos_local is not null or e.puntos_visitante is not null)
     and e.jornada_falm_id in (
       select jf.id from falm.jornada_falm jf join falm.competicion c on c.id = jf.competicion_id
        where c.temporada_id = p_temp)
     and e.jornada_falm_id in (select al.jornada_falm_id from falm.alineacion al)
     and e.jornada_falm_id not in (select jf from _jugadas);

  with m as (
    select e.equipo_local_id eq, e.puntos_local pf, e.puntos_visitante pc
    from falm.enfrentamiento e join falm.jornada_falm jf on jf.id = e.jornada_falm_id
    join falm.competicion c on c.id = jf.competicion_id
    where c.temporada_id = p_temp and c.tipo = 'LIGA' and e.jornada_falm_id in (select jf from _jugadas)
    union all
    select e.equipo_visitante_id, e.puntos_visitante, e.puntos_local
    from falm.enfrentamiento e join falm.jornada_falm jf on jf.id = e.jornada_falm_id
    join falm.competicion c on c.id = jf.competicion_id
    where c.temporada_id = p_temp and c.tipo = 'LIGA' and e.jornada_falm_id in (select jf from _jugadas)
  ),
  calc as (
    select eq, pf, pc,
      case when pf-pc>=3 then 3 when pf-pc>=0.5 then 2 when pf-pc>-0.5 then 1.5 when pf-pc>-3 then 1 else 0 end cl,
      case when pf-pc>=3 then 'V' when pf-pc>=0.5 then 'Vm' when pf-pc>-0.5 then 'E' when pf-pc>-3 then 'Dm' else 'D' end res
    from m
  ),
  agg as (
    select eq, sum(cl) pts, sum(pf) favor, sum(pc) contra,
      count(*) filter (where res='V') v, count(*) filter (where res='Vm') vm,
      count(*) filter (where res='E') e, count(*) filter (where res='Dm') dm, count(*) filter (where res='D') d
    from calc group by eq
  )
  update falm.equipo_falm ef set
    puntos_clasif = coalesce(a.pts,0), puntos_totales = coalesce(a.favor,0), puntos_contra = coalesce(a.contra,0),
    victorias = coalesce(a.v,0), victorias_min = coalesce(a.vm,0), empates = coalesce(a.e,0),
    derrotas_min = coalesce(a.dm,0), derrotas = coalesce(a.d,0)
  from falm.equipo_falm ef2 left join agg a on a.eq = ef2.id
  where ef2.id = ef.id and ef.temporada_id = p_temp;

  -- Premios: solo de las jornadas que cuentan, y fuera los que se hubieran
  -- repartido antes de tiempo.
  delete from falm.premio pr
   using falm.jornada_falm jf, falm.competicion c
   where pr.tipo = 'JORNADA' and jf.id = pr.jornada_falm_id and c.id = jf.competicion_id
     and c.temporada_id = p_temp and c.tipo = 'LIGA'
     and jf.id not in (select jf from _jugadas);

  for v_jf in
    select j.jf from _jugadas j
    join falm.jornada_falm jf on jf.id = j.jf
    join falm.competicion c on c.id = jf.competicion_id and c.tipo = 'LIGA'
  loop
    perform falm.calcular_premios_jornada(v_jf);
  end loop;

  update falm.equipo_falm ef set
    beneficio = coalesce((select sum(pr.importe) from falm.premio pr where pr.equipo_falm_id = ef.id), 0)
  where ef.temporada_id = p_temp;

  return jsonb_build_object('enfrentamientos_calculados', v_n,
    'jornadas', (select count(*) from _jugadas));
end $function$;

create or replace function falm.once_resuelto(p_ali uuid)
returns table(activo_id uuid, rol text, pos text, orden integer, lineas text[], jugo boolean, puntos numeric, cuenta boolean, entra_por uuid, hueco text, pendiente boolean)
language plpgsql
stable
set search_path to 'public', 'falm'
as $function$
declare
  v_jor uuid;
  vac_pos text[] := array[]::text[];
  vac_act uuid[] := array[]::uuid[];
  vac_used boolean[] := array[]::boolean[];
  r record; i int; v_cuenta boolean; v_entra uuid; v_hueco text;
begin
  select jornada_falm_id into v_jor from falm.alineacion where id = p_ali;
  for r in
    with clubq as (
      select aa.activo_id, aa.rol::text rol, aa.lineas, aa.orden,
        case when a.tipo='DEFENSA' then 'PORTERO' else jl.posicion::text end as pos,
        coalesce(jl.equipo_lfp_id, a.equipo_lfp_id) as club_id
      from falm.alineacion_activo aa
      join falm.activo a on a.id=aa.activo_id
      left join falm.jugador_lfp jl on jl.id=a.jugador_lfp_id
      where aa.alineacion_id=p_ali
    )
    select q.activo_id, q.rol, q.lineas, q.orden, q.pos,
      coalesce(ap.puntos,0) as puntos, (ap.activo_id is not null) as jugo,
      (
        -- su partido se jugo antes de que abriera la jornada: no juega en ella
        not exists (
          select 1 from falm.mapeo_jornada mj
          join falm.jornada_lfp_bloqueo b on b.jornada_lfp_id = mj.jornada_lfp_id
          where mj.jornada_falm_id = v_jor and b.equipo_lfp_id = q.club_id
        )
        and (
          -- su partido aun no ha acabado
          exists (
            select 1 from falm.mapeo_jornada mj
            join falm.partido_lfp pa on pa.jornada_lfp_id = mj.jornada_lfp_id
            where mj.jornada_falm_id = v_jor
              and q.club_id in (pa.local_id, pa.visitante_id)
              and pa.goles_local is null
          )
          -- o acabo pero todavia no hay ni una nota de su club
          or not exists (
            select 1 from falm.mapeo_jornada mj
            join falm.puntuacion pu on pu.jornada_lfp_id = mj.jornada_lfp_id
            join falm.activo a2 on a2.id = pu.activo_id and a2.tipo = 'JUGADOR'
            join falm.jugador_lfp j2 on j2.id = a2.jugador_lfp_id
            where mj.jornada_falm_id = v_jor
              and j2.equipo_lfp_id = q.club_id
          )
        )
      ) as pendiente
    from clubq q
    left join lateral (
      select p.activo_id, sum(p.puntos) puntos
      from falm.mapeo_jornada mj join falm.puntuacion p on p.jornada_lfp_id=mj.jornada_lfp_id
      where mj.jornada_falm_id=v_jor and p.activo_id = q.activo_id
        -- las notas de un partido jugado antes de que abriera no cuentan
        and not exists (select 1 from falm.jornada_lfp_bloqueo b
                         where b.jornada_lfp_id = p.jornada_lfp_id and b.equipo_lfp_id = q.club_id)
      group by p.activo_id
    ) ap on true
    order by (q.rol='TITULAR') desc, q.orden
  loop
    v_cuenta := false; v_entra := null; v_hueco := null;
    if r.rol='TITULAR' then
      if r.jugo then
        v_cuenta := true;
      -- El hueco solo se abre cuando ya se sabe que no jugo: mientras este pendiente,
      -- su sitio sigue siendo suyo.
      elsif r.pos in ('DEFENSA','MEDIO','DELANTERO') and not r.pendiente then
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

create or replace function falm.marcadores_jornada(p_jornada uuid)
returns table(equipo_falm_id uuid, enfrentamiento_id uuid, puntos numeric, resueltos integer, plazas integer, cerrada boolean, partidos_jugados integer, partidos_total integer)
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

  -- Los de LaLiga ya ACABADOS, que son los que hacen avanzar la jornada. Con el
  -- marcador no valia: football-data escribe el 0-0 nada mas empezar y un
  -- partido en juego se contaba como jugado. Y sin los que se jugaron antes de
  -- que abriera la jornada, que no son suyos.
  select count(*) filter (where pl.estado = 'FINISHED')::int, count(*)::int
    into v_jug, v_tot
    from falm.mapeo_jornada mj
    join falm.partido_lfp pl on pl.jornada_lfp_id = mj.jornada_lfp_id
   where mj.jornada_falm_id = p_jornada
     and not exists (select 1 from falm.jornada_lfp_bloqueo b
                      where b.jornada_lfp_id = pl.jornada_lfp_id and b.equipo_lfp_id = pl.local_id);

  return query
  select a.equipo_falm_id, a.enfrentamiento_id,
         coalesce(sum(o.puntos) filter (where o.cuenta), 0)::numeric,
         (count(*) filter (where o.rol = 'TITULAR' and (o.jugo or not o.pendiente)))::int,
         (count(*) filter (where o.rol = 'TITULAR'))::int,
         v_cerrada, coalesce(v_jug, 0), coalesce(v_tot, 0)
    from falm.alineacion a
    cross join lateral falm.once_resuelto(a.id) o
   where a.jornada_falm_id = p_jornada
   group by a.equipo_falm_id, a.enfrentamiento_id;
end $function$;

-- _lado_enf (el pop-up del partido): el mismo filtro en `ap` (notas) y en `part`
-- (partidos), asi un jugador de un club bloqueado sale SIN_PARTIDO y sin puntos.
-- Se parchea sobre la definicion viva para no reescribir la funcion entera.
do $l$
declare d text; n text;
begin
  d := pg_get_functiondef('falm._lado_enf(uuid,uuid)'::regprocedure);
  n := replace(d, E'    join falm.puntuacion p on p.jornada_lfp_id = j.id\n    group by p.activo_id',
     E'    join falm.puntuacion p on p.jornada_lfp_id = j.id\n    join falm.activo a3 on a3.id = p.activo_id\n    left join falm.jugador_lfp j3 on j3.id = a3.jugador_lfp_id\n    -- las notas de un partido jugado antes de que abriera la jornada no cuentan\n    where not exists (select 1 from falm.jornada_lfp_bloqueo b\n                       where b.jornada_lfp_id = p.jornada_lfp_id\n                         and b.equipo_lfp_id = coalesce(j3.equipo_lfp_id, a3.equipo_lfp_id))\n    group by p.activo_id');
  if n = d then raise exception 'no casa ap'; end if;
  d := n;
  n := replace(d, E'as eq(equipo)\n    group by eq.equipo',
     E'as eq(equipo)\n    -- sin el partido que se jugo antes de que abriera la jornada\n    where not exists (select 1 from falm.jornada_lfp_bloqueo b\n                       where b.jornada_lfp_id = pl.jornada_lfp_id and b.equipo_lfp_id = pl.local_id)\n    group by eq.equipo');
  if n = d then raise exception 'no casa part'; end if;
  execute n;
end $l$;

-- Y rehacer lo que ya estaba mal escrito: los bloqueos de la jornada 1 y la
-- tabla con la 2 contada.
select falm.recalcular_bloqueos();
select falm.recalcular_clasificacion((select id from falm.temporada where activa order by created_at desc limit 1));

commit;
