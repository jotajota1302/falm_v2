-- Partidos que no caen dentro de su jornada: bloqueo y congelacion.
-- Aplicado el 2026-09-03 (migraciones bloqueo_y_congelacion_de_alineaciones +
-- alineaciones_automaticas_respetan_bloqueos).
--
-- BLOQUEO -- el partido se juega ANTES de que la jornada sea alineable, es decir antes de
--   que cierre la jornada FALM anterior. Nadie pudo poner alineacion para el, asi que ese
--   partido no cuenta: los jugadores de los dos clubes no se pueden alinear esa jornada.
--   Se apunta en falm.jornada_lfp_bloqueo, que ya existia sin usar.
--   Caso real 2026/27: Real Sociedad - Celta de la jornada 6 (jugado el 03/09, cuando la
--   jornada 6 cierra el 15/09 y la liga FALM ni siquiera habia empezado).
--
-- CONGELACION -- el partido se adelanta pero ya dentro de la ventana de alineacion. Ahi si
--   se puede elegir a esos jugadores: simplemente quedan fijados en cuanto arranca su
--   partido, y el resto del once se sigue tocando hasta el cierre.
--   Es SIMETRICA a proposito: ni se pueden sacar ni METER despues de haber jugado. Si solo
--   se protegiese al que ya esta alineado, se podria meter a toro pasado al que acaba de
--   marcar tres goles.
--
-- Ambas reglas viven en falm.guardar_alineacion, que hasta ahora no validaba nada: ni el
-- cierre de la jornada. Tambien las respetan generar_alineacion_defecto y
-- heredar_alineaciones, para no colocar solos a un jugador bloqueado.
--
-- Probado en una transaccion revertida: alinear a un jugador del Celta en la jornada 2 se
-- rechaza; con el partido del Barcelona adelantado a ayer, su jugador figura CONGELADO y no
-- se deja ni quitar ni meter.

-- ---------------------------------------------------------------- bloqueos
create or replace function falm.recalcular_bloqueos(p_temporada uuid default null)
returns integer
language plpgsql
as $function$
declare v_temp uuid; v_n int;
begin
  v_temp := coalesce(p_temporada, (select id from falm.temporada where activa order by created_at desc limit 1));

  delete from falm.jornada_lfp_bloqueo b
   using falm.jornada_lfp jl
   where jl.id = b.jornada_lfp_id and jl.temporada_id = v_temp;

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
  where p.fecha < coalesce(j.abre, now())
  on conflict do nothing;

  get diagnostics v_n = row_count;
  return v_n;
end $function$;

-- ---------------------------------------------------------------- estado por activo
-- Devuelve los activos que no se pueden tocar en esa jornada y por que.
-- Vale igual para jugadores y para porterias virtuales (el activo va por club).
create or replace function falm.activos_no_editables(p_jornada_falm uuid)
returns table (activo_id uuid, motivo text)
language sql
stable
as $function$
  with j as (
    select jl.id as jlfp_id, jl.numero as jlfp
    from falm.mapeo_jornada mj
    join falm.jornada_lfp jl on jl.id = mj.jornada_lfp_id
    where mj.jornada_falm_id = p_jornada_falm
  ),
  club as (
    select a.id as activo_id, coalesce(jl.equipo_lfp_id, a.equipo_lfp_id) as equipo_lfp_id
    from falm.activo a
    left join falm.jugador_lfp jl on jl.id = a.jugador_lfp_id
  )
  select c.activo_id, 'BLOQUEADO'::text
  from club c
  join j on true
  join falm.jornada_lfp_bloqueo b
    on b.jornada_lfp_id = j.jlfp_id and b.equipo_lfp_id = c.equipo_lfp_id
  union
  select c.activo_id, 'CONGELADO'::text
  from club c
  join j on true
  join falm.partido_lfp p
    on p.numero_jornada = j.jlfp
   and c.equipo_lfp_id in (p.local_id, p.visitante_id)
  where p.fecha <= now()
    and not exists (select 1 from falm.jornada_lfp_bloqueo b
                     where b.jornada_lfp_id = j.jlfp_id and b.equipo_lfp_id = c.equipo_lfp_id);
$function$;

-- ---------------------------------------------------------------- guardar alineacion
create or replace function falm.guardar_alineacion(p_equipo uuid, p_jornada uuid, p_formacion text, p_jugadores jsonb)
returns void
language plpgsql
security definer
set search_path to 'public', 'falm'
as $function$
declare
  v_ali uuid;
  v_cierre timestamptz;
  v_msg text;
begin
  select fecha_cierre into v_cierre from falm.jornada_falm where id = p_jornada;
  if v_cierre is not null and v_cierre <= now() and not falm.es_admin() then
    raise exception 'La jornada ya esta cerrada (cerro el %)', to_char(v_cierre at time zone 'Europe/Madrid','DD/MM HH24:MI');
  end if;

  select string_agg(coalesce(jl.nombre, el.nombre), ', ')
    into v_msg
  from jsonb_array_elements(p_jugadores) j
  join falm.activos_no_editables(p_jornada) ne
    on ne.activo_id = (j->>'activo')::uuid and ne.motivo = 'BLOQUEADO'
  join falm.activo a on a.id = ne.activo_id
  left join falm.jugador_lfp jl on jl.id = a.jugador_lfp_id
  left join falm.equipo_lfp el on el.id = a.equipo_lfp_id
  where j->>'rol' is not null;
  if v_msg is not null then
    raise exception 'Estos jugadores no se pueden alinear esta jornada, su partido se jugo fuera de plazo: %', v_msg;
  end if;

  with prev as (
    select aa.activo_id, aa.rol
    from falm.alineacion a
    join falm.alineacion_activo aa on aa.alineacion_id = a.id
    where a.equipo_falm_id = p_equipo and a.jornada_falm_id = p_jornada
  ),
  nuevo as (
    select (j->>'activo')::uuid as activo_id, (j->>'rol')::falm.rol_alineacion as rol
    from jsonb_array_elements(p_jugadores) j
    where j->>'rol' is not null
  ),
  cong as (select activo_id from falm.activos_no_editables(p_jornada) where motivo = 'CONGELADO')
  select string_agg(coalesce(jl.nombre, el.nombre) ||
           case when p.activo_id is null then ' (no se puede meter, ya ha jugado)'
                when n.activo_id is null then ' (no se puede quitar, ya ha jugado)'
                else ' (ya ha jugado)' end, ', ')
    into v_msg
  from prev p
  full outer join nuevo n on n.activo_id = p.activo_id
  join cong on cong.activo_id = coalesce(p.activo_id, n.activo_id)
  join falm.activo a on a.id = coalesce(p.activo_id, n.activo_id)
  left join falm.jugador_lfp jl on jl.id = a.jugador_lfp_id
  left join falm.equipo_lfp el on el.id = a.equipo_lfp_id
  where p.activo_id is null or n.activo_id is null or p.rol is distinct from n.rol;
  if v_msg is not null then
    raise exception 'No se puede cambiar a: %', v_msg;
  end if;

  insert into falm.alineacion(equipo_falm_id, jornada_falm_id, formacion)
    values (p_equipo, p_jornada, p_formacion::falm.formacion)
  on conflict (equipo_falm_id, jornada_falm_id) do update set formacion = excluded.formacion
  returning id into v_ali;

  delete from falm.alineacion_activo where alineacion_id = v_ali;
  insert into falm.alineacion_activo(alineacion_id, activo_id, rol, lineas, orden)
  select v_ali, (j->>'activo')::uuid, (j->>'rol')::falm.rol_alineacion,
    case when jsonb_typeof(j->'lineas')='array' then array(select jsonb_array_elements_text(j->'lineas')) else null end,
    coalesce((j->>'orden')::int, (row_number() over ())::int)
  from jsonb_array_elements(p_jugadores) j
  where j->>'rol' is not null;
end $function$;

-- falm.refrescar_calendario_fd llama a falm.recalcular_bloqueos() al final, asi que los
-- bloqueos se mantienen solos cada vez que se refresca el calendario.
-- generar_alineacion_defecto y heredar_alineaciones filtran los bloqueados (ver migracion
-- alineaciones_automaticas_respetan_bloqueos).
