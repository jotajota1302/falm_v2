-- El fichaje extra por lesion entra en el reparto semanal.
--
-- Como estaba: la caja "Fichaje por lesion" de Fichajes apuntaba al lesionado y
-- la noticia en `fichaje_extra`, y ahi se acababa. No habia donde decir a quien
-- se queria fichar con el extra, y el reparto ni miraba la tabla: aplicaba "un
-- fichaje por equipo y semana" y, si un equipo tenia dos peticiones, anulaba la
-- mas antigua. El 2026-09-29 TOBAGO intento mandar el extra por el formulario
-- semanal y lo unico que consiguio fue pisarse la peticion tres veces.
--
-- Como queda: la peticion extra es una `peticion_fichaje` mas de esa semana,
-- con `fichaje_extra_id` apuntando a la lesion. En el reparto:
--
--   * no cuenta para el "un fichaje por equipo y semana": el equipo puede
--     llevarse el semanal y el de la lesion en el mismo reparto;
--   * compite con los demas con los desempates de siempre;
--   * dentro del mismo equipo se resuelve primero la semanal: si las dos piden
--     al mismo, se lo lleva la semanal y la extra pasa a su otra opcion;
--   * solo sustituye a otra peticion de la misma lesion, nunca a la semanal;
--   * al fichar, la lesion queda usada. Si no se lleva a nadie, sigue
--     disponible para otra semana.
--
-- El tope de 23 se mira con la plantilla tal como estaba ANTES del reparto: si
-- no, el segundo fichaje de la misma noche se quedaba fuera por el primero.
--
-- Y una lesion, un extra: los dobles clics dejaban dos filas "Disponible" por
-- el mismo lesionado.

begin;

-- Los duplicados sin usar: se queda la que trae la noticia, y si no la primera.
delete from falm.fichaje_extra fe
 using (select id, row_number() over (partition by equipo_falm_id, activo_lesionado_id
                                       order by (url_noticia is null), fecha_solicitud) as rn
          from falm.fichaje_extra where not usado) d
 where d.id = fe.id and d.rn > 1
   and not exists (select 1 from falm.peticion_fichaje p where p.fichaje_extra_id = fe.id);

create unique index if not exists fichaje_extra_una_por_lesion
  on falm.fichaje_extra (equipo_falm_id, activo_lesionado_id) where not usado;

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
  v_previa date; v_tiene int; v_esta_noche int; v_del_club int;
  c_max_plantilla constant int := 23;
begin
  if not falm.puede_gestionar() then raise exception 'Solo un administrador puede procesar los fichajes'; end if;
  v_ventana := falm.ventana_fichajes((p_ventana + time '23:59') at time zone 'Europe/Madrid');
  v_jornada := (v_ventana->>'jornada_id')::uuid; v_num := (v_ventana->>'jornada_numero')::int;
  v_abre := (v_ventana->>'admite_fichajes')::boolean; v_previa := p_ventana - 7;
  if v_jornada is null then
    update falm.peticion_fichaje set estado = 'RECHAZADA', fecha_procesamiento = now(),
           observaciones = 'No queda ninguna jornada por jugar despues de esta semana.'
     where ventana = p_ventana and estado = 'PENDIENTE';
    return 0;
  end if;
  select c.id, c.temporada_id into v_comp, v_temporada from falm.jornada_falm jf join falm.competicion c on c.id = jf.competicion_id where jf.id = v_jornada;
  update falm.peticion_fichaje set jornada_objetivo_id = v_jornada where ventana = p_ventana and estado = 'PENDIENTE' and jornada_objetivo_id is distinct from v_jornada;
  if v_abre is not true then
    update falm.peticion_fichaje set estado = 'RECHAZADA', fecha_procesamiento = now(),
           observaciones = format('La jornada %s no admitia fichajes.', v_num)
     where ventana = p_ventana and estado = 'PENDIENTE';
    return 0;
  end if;
  -- Solo cuenta la ultima peticion de cada clase: la semanal sustituye a la
  -- semanal y la de una lesion a la de esa misma lesion, nunca una a la otra.
  update falm.peticion_fichaje p set estado = 'RECHAZADA', fecha_procesamiento = now(),
         observaciones = 'Sustituida por una peticion posterior del mismo equipo'
   where p.ventana = p_ventana and p.estado = 'PENDIENTE'
     and exists (select 1 from falm.peticion_fichaje q where q.ventana = p.ventana and q.equipo_falm_id = p.equipo_falm_id and q.estado = 'PENDIENTE'
                    and q.fichaje_extra_id is not distinct from p.fichaje_extra_id
                    and (q.fecha_creacion, q.id) > (p.fecha_creacion, p.id));
  -- Una lesion da derecho a un fichaje: si ya se uso, la peticion no entra.
  update falm.peticion_fichaje p set estado = 'RECHAZADA', fecha_procesamiento = now(),
         observaciones = 'El fichaje extra de esa lesion ya se habia usado.'
   where p.ventana = p_ventana and p.estado = 'PENDIENTE'
     and exists (select 1 from falm.fichaje_extra fe where fe.id = p.fichaje_extra_id and fe.usado);
  for v_prioridad in 1..2 loop
    for r_activo in
      select distinct o.activo_id from falm.peticion_fichaje p
        join falm.peticion_fichaje_opcion o on o.peticion_id = p.id and o.prioridad = v_prioridad
       where p.ventana = p_ventana and p.estado = 'PENDIENTE' and p.activo_fichado_id is null
    loop
      if exists (select 1 from falm.plantilla where activo_id = r_activo.activo_id and temporada_id = v_temporada and fecha_baja is null) then continue; end if;
      select precio_mercado into v_precio from falm.activo where id = r_activo.activo_id;
      v_club := falm.club_de_activo(r_activo.activo_id);
      select limite_plantilla into v_limite from falm.equipo_lfp where id = v_club;
      for r_sol in
        select p.id as peticion_id, p.equipo_falm_id, p.fichaje_extra_id from falm.peticion_fichaje p
          join falm.peticion_fichaje_opcion o on o.peticion_id = p.id and o.prioridad = v_prioridad and o.activo_id = r_activo.activo_id
         where p.ventana = p_ventana and p.estado = 'PENDIENTE' and p.activo_fichado_id is null
         order by
           (exists (select 1 from falm.peticion_fichaje pa where pa.equipo_falm_id = p.equipo_falm_id and pa.ventana = v_previa and pa.activo_fichado_id is not null)),
           coalesce((select ef.puntos_clasif from falm.equipo_falm ef where ef.id = p.equipo_falm_id), 0) asc,
           coalesce((select ef.puntos_totales from falm.equipo_falm ef where ef.id = p.equipo_falm_id), 0) asc,
           -- dentro del mismo equipo, antes la semanal que la de la lesion
           (p.fichaje_extra_id is not null)
      loop
        -- un fichaje por equipo y SEMANA; el de una lesion va aparte
        if r_sol.fichaje_extra_id is null
           and exists (select 1 from falm.peticion_fichaje pf where pf.ventana = p_ventana and pf.equipo_falm_id = r_sol.equipo_falm_id
                          and pf.fichaje_extra_id is null and pf.activo_fichado_id is not null) then continue; end if;
        -- El fichaje entra aunque pase de 23: la baja la decide el manager
        -- despues, desde Plantilla. Quien sigue con uno de mas no suma otro.
        -- Se mira la plantilla de antes del reparto: lo fichado esta misma
        -- noche (la semanal, cuando llega la de la lesion) no cuenta.
        select count(*) into v_tiene from falm.plantilla where equipo_falm_id = r_sol.equipo_falm_id and temporada_id = v_temporada and fecha_baja is null;
        select count(*) into v_esta_noche from falm.peticion_fichaje pf
         where pf.ventana = p_ventana and pf.equipo_falm_id = r_sol.equipo_falm_id
           and pf.estado = 'PENDIENTE' and pf.activo_fichado_id is not null;
        if v_tiene - v_esta_noche > c_max_plantilla then continue; end if;
        -- El tope por club ya no frena el fichaje: se arregla despues
        -- soltando a uno de ese club, y hasta entonces no se puede alinear.
        insert into falm.plantilla (temporada_id, equipo_falm_id, activo_id, precio, fecha_fichaje) values (v_temporada, r_sol.equipo_falm_id, r_activo.activo_id, v_precio, now());
        update falm.peticion_fichaje set activo_fichado_id = r_activo.activo_id where id = r_sol.peticion_id;
        if r_sol.fichaje_extra_id is not null then
          update falm.fichaje_extra set usado = true, jornada_usada_id = v_jornada, fecha_uso = now()
           where id = r_sol.fichaje_extra_id;
        end if;
        v_fichados := v_fichados + 1;
        exit;
      end loop;
    end loop;
  end loop;
  update falm.peticion_fichaje set estado = 'PROCESADA', fecha_procesamiento = now(),
         observaciones = case when activo_fichado_id is not null then 'Fichaje realizado: libera a un jugador desde Plantilla para volver a alinear'
           else 'No se pudo realizar ningun fichaje (sin opcion disponible, plantilla por encima de 23 sin liberar o cupo de club agotado)' end
   where ventana = p_ventana and estado = 'PENDIENTE';
  return v_fichados;
end $function$;

-- El acta dice cual de las dos peticiones de un equipo es la de la lesion, y de
-- quien. Se parchea sobre la definicion viva para no reescribirla entera.
do $l$
declare d text; n text;
begin
  d := pg_get_functiondef('falm.acta_fichajes(date)'::regprocedure);

  n := replace(d, 'pf.observaciones, pf.fecha_procesamiento, pf.jornada_objetivo_id,',
    'pf.observaciones, pf.fecha_procesamiento, pf.jornada_objetivo_id, pf.fichaje_extra_id,' || E'\n' ||
    '           (select nl.nombre from falm.fichaje_extra fe' || E'\n' ||
    '             cross join lateral falm._nombre_activo(fe.activo_lesionado_id) nl' || E'\n' ||
    '             where fe.id = pf.fichaje_extra_id) as lesionado,');
  if n = d then raise exception 'no casa la lista de p'; end if;
  d := n;

  n := replace(d, $$'equipo', p.equipo,$$,
    $$'equipo', p.equipo, 'extra', p.fichaje_extra_id is not null, 'lesionado', p.lesionado,$$);
  if n = d then raise exception 'no casa equipos'; end if;
  d := n;

  n := replace(d, 'order by (p.activo_fichado_id is null), p.equipo) as j',
    'order by (p.activo_fichado_id is null), p.equipo, (p.fichaje_extra_id is not null)) as j');
  if n = d then raise exception 'no casa el orden'; end if;
  d := n;

  n := replace(d, $$'equipo', p2.equipo, 'prioridad', o2.prioridad,$$,
    $$'equipo', p2.equipo, 'extra', p2.fichaje_extra_id is not null, 'prioridad', o2.prioridad,$$);
  if n = d then raise exception 'no casa lo_pidieron'; end if;

  execute n;
end $l$;

commit;

-- La pantalla todavia no deja elegir a quien se ficha con el extra: mientras
-- tanto la peticion la mete el gestor a mano, asi (semana del 2026-09-29):
--
--   insert into falm.peticion_fichaje (equipo_falm_id, jornada_objetivo_id, ventana, fichaje_extra_id)
--   values (<equipo>, <jornada de esa ventana>, <martes>, <fichaje_extra.id>) returning id;
--   insert into falm.peticion_fichaje_opcion (peticion_id, activo_id, prioridad) values (...);
