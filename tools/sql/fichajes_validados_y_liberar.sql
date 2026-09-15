-- Fichajes: el gestor valida el reparto, y la baja se decide DESPUES de fichar.
--
-- Pedido el 2026-09-15, antes del primer reparto semanal:
--
-- 1. "como es la primera vez, que lo tenga que validar yo desde el admin". El
--    cron del miercoles ya no reparte solo mientras la temporada tenga
--    `fichajes_con_validacion`: deja las peticiones pendientes y el gestor, en
--    Admin > Fichajes, ve como quedaria (falm.propuesta_fichajes, que corre el
--    reparto de verdad y lo deshace) y lo aplica (falm.aplicar_fichajes).
--
-- 2. "el jugador se anade y luego no te deja mandar alineacion hasta que no
--    hayas tirado a uno, desde Plantilla con una opcion de liberar". La baja ya
--    no se elige al pedir: el fichaje entra aunque la plantilla pase de 23, y
--    con mas de 23 guardar_alineacion rebota. Se sale liberando a uno
--    (falm.liberar_jugador), que vuelve al mercado. Asi hay dias para pensar a
--    quien se suelta, que era lo que se queria.
--
--    Quien sigue por encima de 23 una semana despues no ficha otro. El once de
--    la jornada no se queda vacio si nadie libera: la herencia no pasa por
--    guardar_alineacion.

begin;

alter table falm.temporada
  add column if not exists fichajes_con_validacion boolean not null default true;

-- El reparto de una semana. Igual que antes salvo la baja: ya no sale nadie al
-- entrar el fichaje.
create or replace function falm.procesar_fichajes_semana(p_ventana date)
returns integer
language plpgsql
security definer
set search_path to 'public', 'falm'
as $function$
declare
  v_temporada uuid; v_jornada uuid; v_num int; v_comp uuid; v_abre boolean;
  v_prioridad int; r_activo record; r_sol record; v_precio numeric;
  v_fichados int := 0; v_club uuid; v_limite int; v_ventana jsonb;
  v_previa date; v_tiene int; v_del_club int;
  c_max_plantilla constant int := 23;
begin
  if not falm.puede_gestionar() then
    raise exception 'Solo un administrador puede procesar los fichajes';
  end if;

  v_ventana := falm.ventana_fichajes((p_ventana + time '23:59') at time zone 'Europe/Madrid');
  v_jornada := (v_ventana->>'jornada_id')::uuid;
  v_num     := (v_ventana->>'jornada_numero')::int;
  v_abre    := (v_ventana->>'admite_fichajes')::boolean;
  v_previa  := p_ventana - 7;

  if v_jornada is null then
    update falm.peticion_fichaje
       set estado = 'RECHAZADA', fecha_procesamiento = now(),
           observaciones = 'No queda ninguna jornada por jugar despues de esta semana.'
     where ventana = p_ventana and estado = 'PENDIENTE';
    return 0;
  end if;

  select c.id, c.temporada_id into v_comp, v_temporada
    from falm.jornada_falm jf join falm.competicion c on c.id = jf.competicion_id
   where jf.id = v_jornada;

  update falm.peticion_fichaje set jornada_objetivo_id = v_jornada
   where ventana = p_ventana and estado = 'PENDIENTE'
     and jornada_objetivo_id is distinct from v_jornada;

  if v_abre is not true then
    update falm.peticion_fichaje
       set estado = 'RECHAZADA', fecha_procesamiento = now(),
           observaciones = format('La jornada %s no admitia fichajes.', v_num)
     where ventana = p_ventana and estado = 'PENDIENTE';
    return 0;
  end if;

  update falm.peticion_fichaje p
     set estado = 'RECHAZADA', fecha_procesamiento = now(),
         observaciones = 'Sustituida por una peticion posterior del mismo equipo'
   where p.ventana = p_ventana and p.estado = 'PENDIENTE'
     and exists (select 1 from falm.peticion_fichaje q
                  where q.ventana = p.ventana
                    and q.equipo_falm_id = p.equipo_falm_id and q.estado = 'PENDIENTE'
                    and (q.fecha_creacion, q.id) > (p.fecha_creacion, p.id));

  for v_prioridad in 1..2 loop
    for r_activo in
      select distinct o.activo_id from falm.peticion_fichaje p
        join falm.peticion_fichaje_opcion o on o.peticion_id = p.id and o.prioridad = v_prioridad
       where p.ventana = p_ventana and p.estado = 'PENDIENTE' and p.activo_fichado_id is null
    loop
      if exists (select 1 from falm.plantilla where activo_id = r_activo.activo_id
                   and temporada_id = v_temporada and fecha_baja is null) then continue; end if;
      select precio_mercado into v_precio from falm.activo where id = r_activo.activo_id;
      v_club := falm.club_de_activo(r_activo.activo_id);
      select limite_plantilla into v_limite from falm.equipo_lfp where id = v_club;
      for r_sol in
        select p.id as peticion_id, p.equipo_falm_id
          from falm.peticion_fichaje p
          join falm.peticion_fichaje_opcion o
            on o.peticion_id = p.id and o.prioridad = v_prioridad and o.activo_id = r_activo.activo_id
         where p.ventana = p_ventana and p.estado = 'PENDIENTE' and p.activo_fichado_id is null
         order by
           (exists (select 1 from falm.peticion_fichaje pa
                     where pa.equipo_falm_id = p.equipo_falm_id and pa.ventana = v_previa
                       and pa.activo_fichado_id is not null)),
           coalesce((select ef.puntos_clasif from falm.equipo_falm ef where ef.id = p.equipo_falm_id), 0) asc,
           coalesce((select ef.puntos_totales from falm.equipo_falm ef where ef.id = p.equipo_falm_id), 0) asc
      loop
        -- un fichaje por equipo y SEMANA
        if exists (select 1 from falm.peticion_fichaje pf
                    where pf.ventana = p_ventana
                      and pf.equipo_falm_id = r_sol.equipo_falm_id
                      and pf.activo_fichado_id is not null) then continue; end if;

        -- El fichaje entra aunque pase de 23: la baja la decide el manager
        -- despues, desde Plantilla. Pero quien todavia tiene uno de mas de otra
        -- semana no suma otro.
        select count(*) into v_tiene from falm.plantilla
         where equipo_falm_id = r_sol.equipo_falm_id
           and temporada_id = v_temporada and fecha_baja is null;
        if v_tiene > c_max_plantilla then continue; end if;

        if v_club is not null then
          select count(*) into v_del_club from falm.plantilla pl
           where pl.equipo_falm_id = r_sol.equipo_falm_id
             and pl.temporada_id = v_temporada and pl.fecha_baja is null
             and falm.club_de_activo(pl.activo_id) = v_club;
          if v_del_club >= v_limite then continue; end if;
        end if;

        insert into falm.plantilla (temporada_id, equipo_falm_id, activo_id, precio, fecha_fichaje)
        values (v_temporada, r_sol.equipo_falm_id, r_activo.activo_id, v_precio, now());
        update falm.peticion_fichaje set activo_fichado_id = r_activo.activo_id where id = r_sol.peticion_id;
        v_fichados := v_fichados + 1;
        exit;
      end loop;
    end loop;
  end loop;

  update falm.peticion_fichaje
     set estado = 'PROCESADA', fecha_procesamiento = now(),
         observaciones = case
           when activo_fichado_id is not null then 'Fichaje realizado: libera a un jugador desde Plantilla para volver a alinear'
           else 'No se pudo realizar ningun fichaje (sin opcion disponible, plantilla por encima de 23 sin liberar o cupo de club agotado)' end
   where ventana = p_ventana and estado = 'PENDIENTE';
  return v_fichados;
end $function$;

-- La semana que toca repartir: la mas antigua con peticiones pendientes, o la
-- que esta abierta si no hay ninguna.
create or replace function falm._ventana_a_repartir()
returns date
language sql
stable
set search_path to 'public', 'falm'
as $function$
  select coalesce(
    (select min(ventana) from falm.peticion_fichaje where estado = 'PENDIENTE'),
    (falm.ventana_fichajes()->>'ventana')::date);
$function$;

-- Como quedaria el reparto si se aplicara ahora. Corre el reparto de verdad
-- -mismo codigo, mismos desempates- y lo deshace: lo que se ve es exactamente
-- lo que va a pasar.
create or replace function falm.propuesta_fichajes(p_ventana date default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'falm'
as $function$
declare v_ventana date; v_out jsonb; v_cierre timestamptz; v_pend int;
begin
  if not falm.puede_gestionar() then
    raise exception 'Solo el gestor puede ver la propuesta de fichajes';
  end if;
  v_ventana := coalesce(p_ventana, falm._ventana_a_repartir());
  v_cierre := (v_ventana + time '23:59') at time zone 'Europe/Madrid';
  select count(*) into v_pend from falm.peticion_fichaje where ventana = v_ventana and estado = 'PENDIENTE';

  begin
    perform falm.procesar_fichajes_semana(v_ventana);

    select coalesce(jsonb_agg(jsonb_build_object(
             'equipo', ef.nombre,
             'estado', p.estado,
             'fichado', fa.nombre, 'fichado_club', fa.club, 'fichado_pos', fa.posicion,
             'opcion', (select o.prioridad from falm.peticion_fichaje_opcion o
                         where o.peticion_id = p.id and o.activo_id = p.activo_fichado_id),
             'pedia', (select jsonb_agg(jsonb_build_object('prioridad', o.prioridad, 'nombre', oa.nombre, 'club', oa.club)
                                        order by o.prioridad)
                         from falm.peticion_fichaje_opcion o
                         cross join lateral falm._nombre_activo(o.activo_id) oa
                        where o.peticion_id = p.id),
             'plantilla', (select count(*) from falm.plantilla pl
                            where pl.equipo_falm_id = p.equipo_falm_id and pl.fecha_baja is null),
             'observaciones', p.observaciones)
           order by (p.activo_fichado_id is null), ef.nombre), '[]'::jsonb)
      into v_out
      from falm.peticion_fichaje p
      join falm.equipo_falm ef on ef.id = p.equipo_falm_id
      left join lateral falm._nombre_activo(p.activo_fichado_id) fa on p.activo_fichado_id is not null
     where p.ventana = v_ventana
       and p.fecha_procesamiento = now()
       and coalesce(p.observaciones, '') not like 'Sustituida%';

    raise exception using message = '__ensayo_fichajes__';
  exception when others then
    if sqlerrm <> '__ensayo_fichajes__' then raise; end if;
  end;

  return jsonb_build_object(
    'ventana', v_ventana, 'cierre', v_cierre, 'abierta', v_cierre > now(),
    'pendientes', v_pend, 'jornada', falm.ventana_fichajes(v_cierre)->>'jornada_numero',
    'filas', coalesce(v_out, '[]'::jsonb));
end $function$;

-- Aplicar el reparto, desde Admin. Solo cuando la semana ya ha cerrado: antes
-- los managers todavia pueden cambiar lo que piden.
create or replace function falm.aplicar_fichajes(p_ventana date default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'falm'
as $function$
declare v_ventana date; v_cierre timestamptz; v_pend int; v_fichados int;
begin
  if not falm.puede_gestionar() then
    raise exception 'Solo el gestor puede aplicar los fichajes';
  end if;
  v_ventana := coalesce(p_ventana, falm._ventana_a_repartir());
  v_cierre := (v_ventana + time '23:59') at time zone 'Europe/Madrid';
  if v_cierre > now() then
    raise exception 'La semana sigue abierta hasta el % : todavia pueden cambiar lo que piden.',
      to_char(v_cierre at time zone 'Europe/Madrid', 'DD/MM HH24:MI');
  end if;
  select count(*) into v_pend from falm.peticion_fichaje where ventana = v_ventana and estado = 'PENDIENTE';
  if v_pend = 0 then
    raise exception 'No hay peticiones pendientes en la semana del %.', to_char(v_ventana, 'DD/MM');
  end if;
  v_fichados := falm.procesar_fichajes_semana(v_ventana);
  return jsonb_build_object('ventana', v_ventana, 'peticiones', v_pend, 'fichados', v_fichados);
end $function$;

-- El cron del miercoles. Con validacion no toca nada: lo aplica el gestor.
create or replace function falm.procesar_fichajes_semanales()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'falm'
as $function$
declare v_cierre timestamptz; v_ventana date; v_fichados int; v_pendientes int;
begin
  v_cierre := falm.cierre_fichajes(now());
  if v_cierre > now() then
    v_cierre := v_cierre - interval '7 days';
  end if;
  v_ventana := (v_cierre at time zone 'Europe/Madrid')::date;

  select count(*) into v_pendientes
    from falm.peticion_fichaje where ventana = v_ventana and estado = 'PENDIENTE';
  if v_pendientes = 0 then
    return jsonb_build_object('ventana', v_ventana, 'motivo', 'no habia peticiones');
  end if;

  if coalesce((select fichajes_con_validacion from falm.temporada where activa
                order by created_at desc limit 1), true) then
    return jsonb_build_object('ventana', v_ventana, 'peticiones', v_pendientes,
      'motivo', 'esperando a que el gestor lo valide desde Admin');
  end if;

  v_fichados := falm.procesar_fichajes_semana(v_ventana);
  return jsonb_build_object('ventana', v_ventana, 'peticiones', v_pendientes, 'fichados', v_fichados);
end $function$;

-- Soltar a un jugador. Solo cuando se pasa de 23, que es cuando hace falta: es
-- la puerta para volver a alinear despues de fichar. Vuelve al mercado.
create or replace function falm.liberar_jugador(p_activo uuid)
returns integer
language plpgsql
security definer
set search_path to 'public', 'falm'
as $function$
declare v_eq uuid; v_temp uuid; v_n int;
begin
  select pl.equipo_falm_id, pl.temporada_id into v_eq, v_temp
    from falm.plantilla pl
    join falm.temporada t on t.id = pl.temporada_id and t.activa
   where pl.activo_id = p_activo and pl.fecha_baja is null
   limit 1;
  if v_eq is null then
    raise exception 'Ese jugador no esta en ninguna plantilla';
  end if;
  if not (falm.es_mi_equipo(v_eq) or falm.es_admin()) then
    raise exception 'Solo puedes liberar jugadores de tu plantilla';
  end if;

  select count(*) into v_n from falm.plantilla
   where equipo_falm_id = v_eq and temporada_id = v_temp and fecha_baja is null;
  if v_n <= 23 then
    raise exception 'Solo se libera a un jugador cuando te pasas de 23, y tienes %.', v_n;
  end if;

  update falm.plantilla set fecha_baja = now()
   where equipo_falm_id = v_eq and temporada_id = v_temp and activo_id = p_activo and fecha_baja is null;

  -- Para el teletipo: "ficha a X y deja salir a Y" sale del ultimo fichaje.
  update falm.peticion_fichaje set activo_baja_id = p_activo
   where id = (select id from falm.peticion_fichaje
                where equipo_falm_id = v_eq and activo_fichado_id is not null
                  and activo_baja_id is null and activo_fichado_id <> p_activo
                order by fecha_procesamiento desc limit 1);

  return v_n - 1;
end $function$;

-- Nombre, club y posicion de un activo, que se repetia en cada consulta.
create or replace function falm._nombre_activo(p_activo uuid)
returns table(nombre text, club text, posicion text)
language sql
stable
set search_path to 'public', 'falm'
as $function$
  select case when a.tipo = 'DEFENSA' then 'Porteria ' || coalesce(el.nombre, '')
              else trim(jl.nombre || ' ' || coalesce(jl.apellido, '')) end,
         coalesce(el.nombre, elj.nombre),
         case when a.tipo = 'DEFENSA' then 'PORTERO' else jl.posicion::text end
    from falm.activo a
    left join falm.jugador_lfp jl on jl.id = a.jugador_lfp_id
    left join falm.equipo_lfp el on el.id = a.equipo_lfp_id
    left join falm.equipo_lfp elj on elj.id = jl.equipo_lfp_id
   where a.id = p_activo;
$function$;

-- guardar_alineacion: con mas de 23 no se manda once. Se parchea sobre la
-- definicion viva para no reescribir la funcion entera.
do $l$
declare d text; n text;
begin
  d := pg_get_functiondef('falm.guardar_alineacion(uuid,uuid,text,jsonb,uuid)'::regprocedure);
  n := replace(d, 'declare v_ali uuid;', 'declare v_plantilla int; v_ali uuid;');
  if n = d then raise exception 'no casa declare'; end if;
  d := n;
  n := replace(d, E'  perform set_config(''falm.guardando'', ''1'', true);',
    E'  perform set_config(''falm.guardando'', ''1'', true);\n\n' ||
    E'  -- Despues de fichar se pasa de 23, y hasta liberar a uno no se alinea: la\n' ||
    E'  -- baja la decide el manager, pero tiene que decidirla.\n' ||
    E'  select count(*) into v_plantilla\n' ||
    E'    from falm.plantilla pl\n' ||
    E'    join falm.competicion c on c.temporada_id = pl.temporada_id\n' ||
    E'    join falm.jornada_falm jf on jf.competicion_id = c.id and jf.id = p_jornada\n' ||
    E'   where pl.equipo_falm_id = p_equipo and pl.fecha_baja is null;\n' ||
    -- Sin excepcion para el admin: tambien juega la liga con su equipo.
    E'  if v_plantilla > 23 then\n' ||
    E'    raise exception ''Tienes % jugadores y el maximo es 23: libera a uno desde Plantilla para poder mandar la alineacion.'', v_plantilla;\n' ||
    E'  end if;');
  if n = d then raise exception 'no casa guardando'; end if;
  execute n;
end $l$;

revoke all on function falm.propuesta_fichajes(date) from public;
revoke all on function falm.aplicar_fichajes(date) from public;
revoke all on function falm.liberar_jugador(uuid) from public;
revoke all on function falm._ventana_a_repartir() from public;
revoke all on function falm._nombre_activo(uuid) from public;
grant execute on function falm.propuesta_fichajes(date) to authenticated;
grant execute on function falm.aplicar_fichajes(date) to authenticated;
grant execute on function falm.liberar_jugador(uuid) to authenticated;

commit;
