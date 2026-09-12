-- Una alineacion por PARTIDO, no por jornada.
--
-- En una jornada doble cada equipo juega dos partidos y hasta ahora mandaba un
-- solo once que puntuaba en los dos: falm.alineacion estaba marcada
-- UNIQUE (equipo_falm_id, jornada_falm_id). Pero la liga siempre ha permitido
-- alinear distinto contra cada rival --contra quien juegas cambia a quien
-- pones-- asi que el once pertenece al enfrentamiento, no a la jornada.
--
-- Se anade falm.alineacion.enfrentamiento_id y la unicidad pasa a ser
-- (equipo, enfrentamiento). jornada_falm_id se queda porque medio esquema
-- consulta por jornada (plazos, bloqueos, herencia), pero deja de ser dato
-- suelto: un trigger lo saca siempre del propio partido para que no discrepen.
--
-- En una jornada simple no cambia nada: un enfrentamiento por equipo y por
-- tanto un once, igual que antes.

begin;

-- ---------------------------------------------------------------- 1. la tabla

alter table falm.alineacion
  add column if not exists enfrentamiento_id uuid references falm.enfrentamiento(id) on delete cascade;

-- Las que ya existen se colocan en el partido que les toca. Si el equipo juega
-- dos veces esa jornada, esta se queda en el primero y abajo se clona.
with primero as (
  select a.id as ali,
         (select e.id from falm.enfrentamiento e
           where e.jornada_falm_id = a.jornada_falm_id
             and a.equipo_falm_id in (e.equipo_local_id, e.equipo_visitante_id)
           order by e.id limit 1) as enf
    from falm.alineacion a
   where a.enfrentamiento_id is null
)
update falm.alineacion a
   set enfrentamiento_id = p.enf
  from primero p
 where p.ali = a.id and p.enf is not null;

-- El once que valia para los dos partidos de una doble pasa a ser dos onces
-- identicos: a partir de ahora cada uno se cambia por su lado.
with faltan as (
  select a.id as ali, a.equipo_falm_id as equipo, a.jornada_falm_id as jor,
         a.formacion, a.origen, e.id as enf
    from falm.alineacion a
    join falm.enfrentamiento e
      on e.jornada_falm_id = a.jornada_falm_id
     and a.equipo_falm_id in (e.equipo_local_id, e.equipo_visitante_id)
   where e.id is distinct from a.enfrentamiento_id
     and not exists (select 1 from falm.alineacion a2
                      where a2.equipo_falm_id = a.equipo_falm_id
                        and a2.enfrentamiento_id = e.id)
),
nuevas as (
  insert into falm.alineacion (equipo_falm_id, jornada_falm_id, formacion, origen, enfrentamiento_id)
  select f.equipo, f.jor, f.formacion, f.origen, f.enf from faltan f
  returning id, equipo_falm_id, enfrentamiento_id
)
insert into falm.alineacion_activo (alineacion_id, activo_id, rol, lineas, orden)
select n.id, aa.activo_id, aa.rol, aa.lineas, aa.orden
  from nuevas n
  join faltan f on f.enf = n.enfrentamiento_id and f.equipo = n.equipo_falm_id
  join falm.alineacion_activo aa on aa.alineacion_id = f.ali;

-- Un once sin partido no significa nada: si el equipo no juega esa jornada, no
-- hay nada que alinear.
delete from falm.alineacion where enfrentamiento_id is null;

alter table falm.alineacion alter column enfrentamiento_id set not null;
alter table falm.alineacion drop constraint if exists alineacion_equipo_falm_id_jornada_falm_id_key;
alter table falm.alineacion
  add constraint alineacion_equipo_enfrentamiento_key unique (equipo_falm_id, enfrentamiento_id);
create index if not exists alineacion_jornada_equipo_idx
  on falm.alineacion (jornada_falm_id, equipo_falm_id);

-- La jornada la manda el partido: asi no hay forma de escribir una alineacion
-- que diga que es de la jornada 3 y cuelgue de un partido de la 2.
create or replace function falm.alineacion_cuadra_jornada()
returns trigger language plpgsql
set search_path to 'public', 'falm'
as $trg$
begin
  select e.jornada_falm_id into new.jornada_falm_id
    from falm.enfrentamiento e where e.id = new.enfrentamiento_id;
  if new.jornada_falm_id is null then
    raise exception 'Esa alineacion no apunta a ningun partido';
  end if;
  return new;
end $trg$;

drop trigger if exists cuadra_jornada on falm.alineacion;
create trigger cuadra_jornada before insert or update on falm.alineacion
  for each row execute function falm.alineacion_cuadra_jornada();

-- -------------------------------------------------------- 2. guardar el once

-- Ahora admite a que partido va. Sin decirlo se guarda en todos los de esa
-- jornada, que es justo lo que hacia antes: en una simple, el unico; en una
-- doble, el mismo once en los dos.
drop function if exists falm.guardar_alineacion(uuid, uuid, text, jsonb);

create or replace function falm.guardar_alineacion(
  p_equipo uuid, p_jornada uuid, p_formacion text, p_jugadores jsonb,
  p_enfrentamiento uuid default null)
returns void
language plpgsql
security definer
set search_path to 'public', 'falm'
as $function$
declare v_ali uuid; v_cierre timestamptz; v_msg text; v_enfs uuid[]; v_enf uuid;
begin
  -- 0. el once que mandas es el tuyo. Si viene alguien identificado (la app), tiene que ser
  --    su equipo o el admin; si no hay nadie identificado, solo puede ser una tarea interna,
  --    nunca la API publica.
  if auth.uid() is not null then
    if not (falm.es_mi_equipo(p_equipo) or falm.es_admin()) then
      raise exception 'Solo puedes cambiar la alineacion de tu equipo';
    end if;
  elsif coalesce(auth.role(), '') in ('anon', 'authenticated') then
    raise exception 'Hay que identificarse para mandar una alineacion';
  end if;
  perform set_config('falm.guardando', '1', true);

  select fecha_cierre into v_cierre from falm.jornada_falm where id = p_jornada;
  if v_cierre is not null and v_cierre <= now() and not falm.es_admin() then
    raise exception 'La jornada ya esta cerrada (cerro el %)', to_char(v_cierre at time zone 'Europe/Madrid','DD/MM HH24:MI');
  end if;

  -- A que partido o partidos va este once.
  if p_enfrentamiento is not null then
    select array[e.id] into v_enfs from falm.enfrentamiento e
     where e.id = p_enfrentamiento and e.jornada_falm_id = p_jornada
       and p_equipo in (e.equipo_local_id, e.equipo_visitante_id);
    if v_enfs is null then
      raise exception 'Ese partido no es de tu equipo en esta jornada';
    end if;
  else
    select array_agg(e.id order by e.id) into v_enfs from falm.enfrentamiento e
     where e.jornada_falm_id = p_jornada
       and p_equipo in (e.equipo_local_id, e.equipo_visitante_id);
  end if;
  if coalesce(array_length(v_enfs, 1), 0) = 0 then
    raise exception 'Tu equipo no juega esta jornada';
  end if;

  select string_agg(coalesce(jl.nombre, el.nombre), ', ') into v_msg
  from jsonb_array_elements(p_jugadores) j
  join falm.activos_no_editables(p_jornada) ne on ne.activo_id = (j->>'activo')::uuid and ne.motivo = 'BLOQUEADO'
  join falm.activo a on a.id = ne.activo_id
  left join falm.jugador_lfp jl on jl.id = a.jugador_lfp_id
  left join falm.equipo_lfp el on el.id = a.equipo_lfp_id
  where j->>'rol' is not null;
  if v_msg is not null then
    raise exception 'Estos jugadores no se pueden alinear esta jornada, su partido se jugo fuera de plazo: %', v_msg;
  end if;

  -- Quien ya ha jugado no se toca. Se compara contra el once que hubiera en el
  -- primero de los partidos afectados: en una doble los dos salen del mismo fin
  -- de semana, asi que lo congelado es lo mismo en los dos.
  with prev as (
    select aa.activo_id, aa.rol from falm.alineacion a
    join falm.alineacion_activo aa on aa.alineacion_id = a.id
    where a.equipo_falm_id = p_equipo and a.enfrentamiento_id = v_enfs[1]
  ), nuevo as (
    select (j->>'activo')::uuid as activo_id, (j->>'rol')::falm.rol_alineacion as rol
    from jsonb_array_elements(p_jugadores) j where j->>'rol' is not null
  ), cong as (select activo_id from falm.activos_no_editables(p_jornada) where motivo = 'CONGELADO')
  select string_agg(coalesce(jl.nombre, el.nombre) ||
           case when p.activo_id is null then ' (no se puede meter, ya ha jugado)'
                when n.activo_id is null then ' (no se puede quitar, ya ha jugado)'
                else ' (ya ha jugado)' end, ', ') into v_msg
  from prev p full outer join nuevo n on n.activo_id = p.activo_id
  join cong on cong.activo_id = coalesce(p.activo_id, n.activo_id)
  join falm.activo a on a.id = coalesce(p.activo_id, n.activo_id)
  left join falm.jugador_lfp jl on jl.id = a.jugador_lfp_id
  left join falm.equipo_lfp el on el.id = a.equipo_lfp_id
  where p.activo_id is null or n.activo_id is null or p.rol is distinct from n.rol;
  if v_msg is not null then raise exception 'No se puede cambiar a: %', v_msg; end if;

  with t as (
    select case when a.tipo = 'DEFENSA' then 'PORTERO' else jl.posicion::text end as pos
      from jsonb_array_elements(p_jugadores) j
      join falm.activo a on a.id = (j->>'activo')::uuid
      left join falm.jugador_lfp jl on jl.id = a.jugador_lfp_id
     where j->>'rol' = 'TITULAR'
  ), c as (
    select count(*) as tot, count(*) filter (where pos='PORTERO') as por,
           count(*) filter (where pos='DEFENSA') as def, count(*) filter (where pos='MEDIO') as med,
           count(*) filter (where pos='DELANTERO') as del from t
  ), f as (
    select split_part(p_formacion,'-',1)::int as fdef, split_part(p_formacion,'-',2)::int as fmed,
           split_part(p_formacion,'-',3)::int as fdel
  )
  select case
    when c.tot <> 11 then format('El once necesita 11 titulares y tiene %s', c.tot)
    when c.por <> 1 then format('Hace falta una porteria y hay %s', c.por)
    when c.def <> f.fdef then format('La formacion %s pide %s defensas y hay %s', p_formacion, f.fdef, c.def)
    when c.med <> f.fmed then format('La formacion %s pide %s medios y hay %s', p_formacion, f.fmed, c.med)
    when c.del <> f.fdel then format('La formacion %s pide %s delanteros y hay %s', p_formacion, f.fdel, c.del)
  end into v_msg from c, f;
  if v_msg is not null then raise exception '%', v_msg; end if;

  foreach v_enf in array v_enfs loop
    insert into falm.alineacion(equipo_falm_id, jornada_falm_id, formacion, enfrentamiento_id)
      values (p_equipo, p_jornada, p_formacion::falm.formacion, v_enf)
    on conflict (equipo_falm_id, enfrentamiento_id)
      do update set formacion = excluded.formacion, origen = 'MANAGER', updated_at = now()
    returning id into v_ali;

    delete from falm.alineacion_activo where alineacion_id = v_ali;
    insert into falm.alineacion_activo(alineacion_id, activo_id, rol, lineas, orden)
    select v_ali, (j->>'activo')::uuid, (j->>'rol')::falm.rol_alineacion,
      case when jsonb_typeof(j->'lineas')='array' then array(select jsonb_array_elements_text(j->'lineas')) else null end,
      coalesce((j->>'orden')::int, (row_number() over ())::int)
    from jsonb_array_elements(p_jugadores) j where j->>'rol' is not null;
  end loop;
end $function$;

revoke all on function falm.guardar_alineacion(uuid, uuid, text, jsonb, uuid) from public;
grant execute on function falm.guardar_alineacion(uuid, uuid, text, jsonb, uuid) to authenticated;

-- ------------------------------------------ 3. el once de oficio y la herencia

-- Pasa a ser por partido: en una doble, borrar "el once de la jornada" se
-- habria llevado por delante tambien el del otro partido.
drop function if exists falm.generar_alineacion_defecto(uuid, uuid);

create or replace function falm.generar_alineacion_defecto(p_equipo uuid, p_enfrentamiento uuid)
returns integer
language plpgsql
security definer
set search_path to 'public', 'falm'
as $function$
declare v_ali uuid; v_tit int; v_jornada uuid;
begin
  select jornada_falm_id into v_jornada from falm.enfrentamiento where id = p_enfrentamiento;
  if v_jornada is null then return 0; end if;

  delete from falm.alineacion where equipo_falm_id = p_equipo and enfrentamiento_id = p_enfrentamiento;
  insert into falm.alineacion(equipo_falm_id, jornada_falm_id, formacion, origen, enfrentamiento_id)
    values (p_equipo, v_jornada, '4-4-2', 'DE_OFICIO', p_enfrentamiento) returning id into v_ali;

  insert into falm.alineacion_activo(alineacion_id, activo_id, rol, lineas, orden)
  select v_ali, activo_id,
    (case when es_titular then 'TITULAR' else 'SUPLENTE' end)::falm.rol_alineacion,
    case when es_titular then null else array[linea] end,
    row_number() over (order by es_titular desc, pos, rn)
  from (
    select activo_id, pos, rn,
      (case
        when pos='PORTERO'  and rn=1 then true
        when pos='DEFENSA'  and rn<=4 then true
        when pos='MEDIO'    and rn<=4 then true
        when pos='DELANTERO' and rn<=2 then true
        else false end) as es_titular,
      (pos in ('DEFENSA','MEDIO','DELANTERO')
        and ((pos='DEFENSA' and rn=5) or (pos='MEDIO' and rn=5) or (pos='DELANTERO' and rn=3))) as es_suplente,
      pos as linea
    from (
      select p.activo_id,
        case when a.tipo='DEFENSA' then 'PORTERO' else jl.posicion::text end as pos,
        row_number() over (partition by (case when a.tipo='DEFENSA' then 'PORTERO' else jl.posicion::text end)
          order by a.precio_mercado desc) rn
      from falm.plantilla p
      join falm.activo a on a.id=p.activo_id
      left join falm.jugador_lfp jl on jl.id=a.jugador_lfp_id
      where p.equipo_falm_id=p_equipo and p.fecha_baja is null
        and p.activo_id not in (
          select ne.activo_id from falm.activos_no_editables(v_jornada) ne where ne.motivo = 'BLOQUEADO')
    ) s
  ) r
  where es_titular or es_suplente;

  select count(*) into v_tit
    from falm.alineacion_activo where alineacion_id = v_ali and rol = 'TITULAR';
  return v_tit;
end $function$;

-- Nadie se queda sin once, y ahora tampoco a medias: se recorre partido a
-- partido. Para el segundo de una doble, lo primero que se mira es el once que
-- el propio manager haya puesto en el otro partido de esa misma jornada, que se
-- parece mas a lo que queria que el de la jornada pasada.
create or replace function falm.heredar_alineaciones(p_jornada uuid)
returns integer
language plpgsql
as $function$
declare
  v_comp uuid; v_num int; v_ant uuid; v_nueva uuid; r record;
  v_count int := 0; v_tit int;
begin
  select competicion_id, numero into v_comp, v_num from falm.jornada_falm where id = p_jornada;

  for r in
    select e.id as enf, v.eq as equipo_id
      from falm.enfrentamiento e
      cross join lateral (values (e.equipo_local_id), (e.equipo_visitante_id)) as v(eq)
     where e.jornada_falm_id = p_jornada
       and not exists (select 1 from falm.alineacion a
                        where a.equipo_falm_id = v.eq and a.enfrentamiento_id = e.id)
  loop
    -- 1) el otro partido de esta misma jornada, si ya tiene once
    select a.id into v_ant
      from falm.alineacion a
     where a.equipo_falm_id = r.equipo_id and a.jornada_falm_id = p_jornada
     order by (a.origen = 'MANAGER') desc, a.updated_at desc limit 1;

    -- 2) y si no, el ultimo de una jornada anterior de esta competicion
    if v_ant is null then
      select a.id into v_ant
      from falm.alineacion a
      join falm.jornada_falm jf on jf.id = a.jornada_falm_id
      where a.equipo_falm_id = r.equipo_id and jf.competicion_id = v_comp and jf.numero < v_num
      order by jf.numero desc, a.updated_at desc limit 1;
    end if;

    v_tit := 0;

    if v_ant is not null then
      insert into falm.alineacion (equipo_falm_id, jornada_falm_id, formacion, origen, enfrentamiento_id)
      select r.equipo_id, p_jornada, formacion, 'HEREDADA', r.enf from falm.alineacion where id = v_ant
      returning id into v_nueva;

      insert into falm.alineacion_activo (alineacion_id, activo_id, rol, lineas, orden)
      select v_nueva, aa.activo_id, aa.rol, aa.lineas, aa.orden
      from falm.alineacion_activo aa
      where aa.alineacion_id = v_ant
        and aa.activo_id not in (
          select ne.activo_id from falm.activos_no_editables(p_jornada) ne where ne.motivo = 'BLOQUEADO')
        and exists (
          select 1 from falm.plantilla pl
           where pl.activo_id = aa.activo_id and pl.equipo_falm_id = r.equipo_id
             and pl.fecha_baja is null);

      v_tit := falm.completar_once(v_nueva);
    end if;

    if v_tit <> 11 then
      v_tit := falm.generar_alineacion_defecto(r.equipo_id, r.enf);
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end $function$;

-- ------------------------------------------------------ 4. puntos y marcadores

-- El once ya no es de la jornada sino del partido: quien sume por equipo y
-- jornada tiene que agrupar, porque en una doble hay dos.
create or replace view falm.v_puntos_jornada_falm as
  select al.equipo_falm_id, al.jornada_falm_id, falm.puntos_once(al.id) as puntos,
         al.enfrentamiento_id
    from falm.alineacion al;

-- Lo que lleva un equipo en UN partido. Antes solo existia por jornada, y en
-- una doble eso son dos marcadores distintos.
create or replace function falm.marcador_enfrentamiento(p_enf uuid, p_equipo uuid)
returns jsonb
language plpgsql
stable
set search_path to 'public', 'falm'
as $function$
declare v_ali uuid; v_pts numeric; v_res int; v_tot int;
begin
  select id into v_ali from falm.alineacion
   where enfrentamiento_id = p_enf and equipo_falm_id = p_equipo;
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

revoke all on function falm.marcador_enfrentamiento(uuid, uuid) from public;
grant execute on function falm.marcador_enfrentamiento(uuid, uuid) to authenticated;

-- Lo de la jornada entera pasa a ser la suma de los partidos de ese equipo: en
-- una simple es el unico once, en una doble los dos.
create or replace function falm.marcador_jornada(p_jornada uuid, p_equipo uuid)
returns jsonb
language plpgsql
stable
set search_path to 'public', 'falm'
as $function$
declare v_pts numeric; v_res int; v_tot int; v_hay int;
begin
  select count(*) into v_hay from falm.alineacion
   where jornada_falm_id = p_jornada and equipo_falm_id = p_equipo;
  if v_hay = 0 then
    return jsonb_build_object('alineada', false);
  end if;

  select coalesce(sum(o.puntos) filter (where o.cuenta), 0),
         count(*) filter (where o.rol = 'TITULAR' and (o.jugo or not o.pendiente))::int,
         count(*) filter (where o.rol = 'TITULAR')::int
    into v_pts, v_res, v_tot
    from falm.alineacion a
    cross join lateral falm.once_resuelto(a.id) o
   where a.jornada_falm_id = p_jornada and a.equipo_falm_id = p_equipo;

  return jsonb_build_object('alineada', true, 'puntos', v_pts,
                            'resueltos', v_res, 'plazas', v_tot);
end $function$;

-- La tabla de marcadores de una jornada pasa a llevar el partido: Partidos
-- pinta una fila por cruce y en una doble el mismo equipo sale en dos.
drop function if exists falm.marcadores_jornada(uuid);

create or replace function falm.marcadores_jornada(p_jornada uuid)
returns table(equipo_falm_id uuid, enfrentamiento_id uuid, puntos numeric,
              resueltos integer, plazas integer, cerrada boolean,
              partidos_jugados integer, partidos_total integer)
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
  select a.equipo_falm_id, a.enfrentamiento_id,
         coalesce(sum(o.puntos) filter (where o.cuenta), 0)::numeric,
         count(*) filter (where o.rol = 'TITULAR' and (o.jugo or not o.pendiente))::int,
         count(*) filter (where o.rol = 'TITULAR')::int,
         v_cerrada, coalesce(v_jug, 0), coalesce(v_tot, 0)
    from falm.alineacion a
    cross join lateral falm.once_resuelto(a.id) o
   where a.jornada_falm_id = p_jornada
   group by a.equipo_falm_id, a.enfrentamiento_id;
end $function$;

revoke all on function falm.marcadores_jornada(uuid) from public;
grant execute on function falm.marcadores_jornada(uuid) to authenticated;

-- ------------------------------------------------ 5. el detalle de un partido

-- Cada lado ensena el once de ESE partido. Antes se pedia por jornada y en una
-- doble los dos cruces habrian ensenado el mismo once.
-- OJO: esta version la sustituye detalle_partido_en_juego.sql, que parte el
-- estado ESPERANDO en EN_JUEGO / ESPERANDO. Lo de aqui se deja como esta porque
-- el cambio del partido es lo que documenta este fichero.
drop function if exists falm._lado_enf(uuid, uuid);

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

create or replace function falm.detalle_enfrentamiento(p_enf uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'falm'
as $function$
declare v_jor uuid; v_loc uuid; v_vis uuid;
begin
  select jornada_falm_id, equipo_local_id, equipo_visitante_id into v_jor, v_loc, v_vis
  from falm.enfrentamiento where id=p_enf;
  if v_jor is null then return null; end if;
  return jsonb_build_object('local', falm._lado_enf(p_enf, v_loc), 'visitante', falm._lado_enf(p_enf, v_vis));
end $function$;

-- ------------------------------------------------ 6. clasificacion y premios

create or replace function falm.recalcular_clasificacion(p_temp uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'falm'
as $function$
declare v_n int; v_jf uuid;
begin
  -- Sobre la temporada activa solo el admin: la app la llama únicamente para
  -- temporadas de pruebas, pero eso lo comprobaba el cliente, no el servidor.
  perform falm.recalcular_clasificacion_guardia(p_temp);

  -- 1. resultado de cada enfrentamiento jugado (los no jugados quedan NULL).
  --    Cada cruce coge el once de ESE cruce: en una doble los dos partidos de
  --    un equipo pueden llevar onces distintos y por tanto puntos distintos.
  with jugadas as (select distinct jornada_falm_id jf from falm.alineacion)
  update falm.enfrentamiento e set
    puntos_local = (select coalesce(v.puntos,0) from falm.v_puntos_jornada_falm v
                     where v.enfrentamiento_id=e.id and v.equipo_falm_id=e.equipo_local_id),
    puntos_visitante = (select coalesce(v.puntos,0) from falm.v_puntos_jornada_falm v
                     where v.enfrentamiento_id=e.id and v.equipo_falm_id=e.equipo_visitante_id)
  where e.jornada_falm_id in (
    select jf.id from falm.jornada_falm jf join falm.competicion c on c.id=jf.competicion_id
    where c.temporada_id=p_temp)
    and e.jornada_falm_id in (select jf from jugadas);
  get diagnostics v_n = row_count;

  -- 2. clasificación (solo jornadas jugadas)
  with jugadas as (select distinct jornada_falm_id jf from falm.alineacion),
  m as (
    select e.equipo_local_id eq, e.puntos_local pf, e.puntos_visitante pc
    from falm.enfrentamiento e join falm.jornada_falm jf on jf.id=e.jornada_falm_id
    join falm.competicion c on c.id=jf.competicion_id
    where c.temporada_id=p_temp and c.tipo='LIGA' and e.jornada_falm_id in (select jf from jugadas)
    union all
    select e.equipo_visitante_id, e.puntos_visitante, e.puntos_local
    from falm.enfrentamiento e join falm.jornada_falm jf on jf.id=e.jornada_falm_id
    join falm.competicion c on c.id=jf.competicion_id
    where c.temporada_id=p_temp and c.tipo='LIGA' and e.jornada_falm_id in (select jf from jugadas)
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
    victorias=coalesce(a.v,0), victorias_min=coalesce(a.vm,0), empates=coalesce(a.e,0),
    derrotas_min=coalesce(a.dm,0), derrotas=coalesce(a.d,0)
  from agg a where a.eq=ef.id;

  -- 3. premio de cada jornada LIGA jugada (al cargar puntuaciones)
  for v_jf in
    select distinct al.jornada_falm_id
    from falm.alineacion al
    join falm.jornada_falm jf on jf.id=al.jornada_falm_id
    join falm.competicion c on c.id=jf.competicion_id
    where c.temporada_id=p_temp and c.tipo='LIGA'
  loop
    perform falm.calcular_premios_jornada(v_jf);
  end loop;

  -- 4. beneficio = suma de TODOS los premios del equipo (jornada + competición)
  update falm.equipo_falm ef set
    beneficio = coalesce((select sum(pr.importe) from falm.premio pr where pr.equipo_falm_id=ef.id), 0)
  where ef.temporada_id=p_temp;

  return jsonb_build_object('enfrentamientos_calculados', v_n);
end $function$;

-- El premio de jornada: en una doble se suman los dos partidos, y la jornada es
-- doble cuando alguien juega dos veces en ella. Antes se miraba si tenia dos
-- jornadas de LaLiga mapeadas, y no es asi como se montan: la 2 es doble con
-- una sola jornada de LaLiga detras, asi que repartia premio sencillo.
create or replace function falm.calcular_premios_jornada(
  p_jornada uuid,
  p_normal numeric[] default array[(10)::numeric, (5)::numeric, (0)::numeric],
  p_doble numeric[] default array[(20)::numeric, (15)::numeric, (5)::numeric])
returns integer
language plpgsql
as $function$
declare
  v_premios numeric[];
  v_count   int;
  v_max     int;
begin
  select coalesce(max(t.n), 0) into v_max from (
    select count(*) as n
      from falm.enfrentamiento e
      cross join lateral (values (e.equipo_local_id), (e.equipo_visitante_id)) as v(eq)
     where e.jornada_falm_id = p_jornada
     group by v.eq) t;
  v_premios := case when v_max >= 2 then p_doble else p_normal end;

  -- recalcular: borrar premios de jornada previos de esta jornada
  delete from falm.premio where jornada_falm_id = p_jornada and tipo = 'JORNADA';

  with pts as (
    select equipo_falm_id, sum(puntos) as puntos
      from falm.v_puntos_jornada_falm
     where jornada_falm_id = p_jornada
     group by equipo_falm_id
  ),
  ranked as (
    select equipo_falm_id, puntos,
           rank()  over (order by puntos desc)        as rank_min,
           count(*) over (partition by puntos)         as grupo
      from pts
  ),
  calc as (
    select equipo_falm_id, puntos, rank_min, grupo,
           ( select coalesce(sum(v_premios[pos]), 0)
               from generate_series(rank_min, rank_min + grupo - 1) as pos ) as suma
      from ranked
  )
  insert into falm.premio (equipo_falm_id, tipo, jornada_falm_id, posicion, importe, puntos_obtenidos)
  select equipo_falm_id, 'JORNADA', p_jornada, rank_min, suma / grupo, puntos
    from calc
   where suma > 0;

  get diagnostics v_count = row_count;
  return v_count;
end $function$;

commit;
