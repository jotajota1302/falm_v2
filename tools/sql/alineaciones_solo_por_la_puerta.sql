-- Las alineaciones, solo por la puerta. Aplicado el 2026-09-11 (migraciones
-- alineaciones_solo_por_la_puerta + alineaciones_puerta_rol_efectivo + alineaciones_puerta_invoker).
--
-- El cierre de la jornada vivia solo dentro de falm.guardar_alineacion, pero el esquema
-- falm esta publicado en la API REST (pgrst.db_schemas) y la politica wr_dueno de
-- falm.alineacion y falm.alineacion_activo dejaba a cualquier manager escribir directo
-- sobre su propia alineacion sin mirar la hora. Con el token que el navegador ya tiene,
-- un PATCH a las 22:00 cambiaba el once con la jornada cerrada.
--
-- Habia ademas un segundo agujero, mas gordo: guardar_alineacion es SECURITY DEFINER (se
-- salta el RLS) y no comprobaba de quien era el equipo que le pasaban. Cualquiera con la
-- clave publica podia reescribir el once de otro.
--
-- Se cierran los dos:
--   1. guardar_alineacion exige que el equipo sea tuyo (o que seas el admin), y que haya
--      alguien identificado detras.
--   2. Un trigger en las dos tablas rechaza toda escritura que no venga de
--      guardar_alineacion, que deja una marca al entrar. El admin y las tareas internas
--      (pg_cron, service_role) siguen pasando: son las que heredan el once de oficio y las
--      que arreglan las cosas a mano.
--
-- Dos detalles que costaron un par de vueltas y conviene no repetir:
--   - El trigger NO puede ser security definer: dentro de una funcion definer current_user
--     es el dueno de la funcion, no quien llama, y entonces dejaba pasar a todo el mundo.
--   - Por lo mismo, dentro de guardar_alineacion (que si es definer) ni current_user ni
--     current_user sirven para saber quien llama: se mira auth.uid() y auth.role().
--
-- Probado en transacciones revertidas, poniendose en la piel de un manager (set role
-- authenticated + request.jwt.claims con su uid):
--   update/delete directos a su alineacion  -> cortados
--   update directo a la de otro             -> 0 filas (RLS)
--   guardar_alineacion con su equipo        -> guarda
--   guardar_alineacion con el equipo de otro-> cortado
--   guardar_alineacion sin identificarse    -> cortado
--   con la jornada cerrada, por los dos lados-> cortado
--   escritura como postgres (cron)          -> sigue pasando

-- ---------------------------------------------------------------- el portero de la tabla
create or replace function falm.alineacion_solo_por_la_puerta()
returns trigger
language plpgsql
set search_path to 'public', 'falm'
as $function$
declare
  v_fila record;
  v_equipo uuid;
  v_cierre timestamptz;
begin
  if TG_OP = 'DELETE' then v_fila := OLD; else v_fila := NEW; end if;

  -- El admin y las tareas internas pasan siempre. A un manager, PostgREST lo atiende como
  -- authenticated (o anon); pg_cron y los scripts entran como postgres.
  if current_user not in ('authenticated', 'anon')
     or coalesce(auth.role(), '') = 'service_role'
     or falm.es_admin() then
    return v_fila;
  end if;

  -- Para el resto, la unica entrada es falm.guardar_alineacion, que deja esta marca al
  -- entrar. Escribir en la tabla por la API REST se acabo.
  if coalesce(current_setting('falm.guardando', true), '') <> '1' then
    raise exception 'La alineacion solo se cambia desde la pantalla de alineacion';
  end if;

  if TG_TABLE_NAME = 'alineacion' then
    v_equipo := v_fila.equipo_falm_id;
    select jf.fecha_cierre into v_cierre
      from falm.jornada_falm jf where jf.id = v_fila.jornada_falm_id;
  else
    select a.equipo_falm_id, jf.fecha_cierre into v_equipo, v_cierre
      from falm.alineacion a
      join falm.jornada_falm jf on jf.id = a.jornada_falm_id
     where a.id = v_fila.alineacion_id;
  end if;

  -- El once que tocas es el tuyo.
  if v_equipo is not null and not falm.es_mi_equipo(v_equipo) then
    raise exception 'Esa alineacion no es de tu equipo';
  end if;

  -- Y la jornada sigue abierta.
  if v_cierre is not null and v_cierre <= now() then
    raise exception 'La jornada ya esta cerrada (cerro el %)',
      to_char(v_cierre at time zone 'Europe/Madrid', 'DD/MM HH24:MI');
  end if;

  return v_fila;
end $function$;

drop trigger if exists solo_por_la_puerta on falm.alineacion;
create trigger solo_por_la_puerta
  before insert or update or delete on falm.alineacion
  for each row execute function falm.alineacion_solo_por_la_puerta();

drop trigger if exists solo_por_la_puerta on falm.alineacion_activo;
create trigger solo_por_la_puerta
  before insert or update or delete on falm.alineacion_activo
  for each row execute function falm.alineacion_solo_por_la_puerta();

-- ---------------------------------------------------------------- la puerta
-- Igual que estaba (ver bloqueo_y_congelacion.sql) con el punto 0 nuevo: de quien es el
-- once, y la marca que mira el trigger.
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
  -- 0. el once que mandas es el tuyo. Si hay alguien identificado (la app), tiene que ser
  --    su equipo o el admin; si no hay nadie, solo puede ser una tarea interna, nunca la
  --    API publica.
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

  -- 1. nadie de un club cuyo partido quedo fuera de la jornada
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

  -- 2. los congelados (su partido ya empezo) tienen que quedar exactamente igual
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

  -- 3. el once: once titulares, y repartidos como dice la formacion
  with t as (
    select case when a.tipo = 'DEFENSA' then 'PORTERO' else jl.posicion::text end as pos
      from jsonb_array_elements(p_jugadores) j
      join falm.activo a on a.id = (j->>'activo')::uuid
      left join falm.jugador_lfp jl on jl.id = a.jugador_lfp_id
     where j->>'rol' = 'TITULAR'
  ),
  c as (
    select count(*) as tot,
           count(*) filter (where pos = 'PORTERO')   as por,
           count(*) filter (where pos = 'DEFENSA')   as def,
           count(*) filter (where pos = 'MEDIO')     as med,
           count(*) filter (where pos = 'DELANTERO') as del
      from t
  ),
  f as (
    select split_part(p_formacion, '-', 1)::int as fdef,
           split_part(p_formacion, '-', 2)::int as fmed,
           split_part(p_formacion, '-', 3)::int as fdel
  )
  select case
           when c.tot <> 11 then format('El once necesita 11 titulares y tiene %s', c.tot)
           when c.por <> 1  then format('Hace falta una porteria y hay %s', c.por)
           when c.def <> f.fdef then format('La formacion %s pide %s defensas y hay %s', p_formacion, f.fdef, c.def)
           when c.med <> f.fmed then format('La formacion %s pide %s medios y hay %s', p_formacion, f.fmed, c.med)
           when c.del <> f.fdel then format('La formacion %s pide %s delanteros y hay %s', p_formacion, f.fdel, c.del)
         end
    into v_msg
  from c, f;
  if v_msg is not null then
    raise exception '%', v_msg;
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
