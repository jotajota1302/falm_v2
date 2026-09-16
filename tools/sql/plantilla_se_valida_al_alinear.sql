-- El tope por club deja de bloquear el fichaje: se valida al alinear.
--
-- Decidido el 2026-09-16, viendo el reparto de la primera semana: RIVER
-- XAVALEO pidio a Job Ochieng de primera y le entro la segunda porque ya tenia
-- 3 de la Real Sociedad, y a PUSSYFISH le paso igual con el Real Madrid. Eso no
-- es lo que queremos: fichar no deberia tropezar con el tope, porque luego se
-- suelta a uno de ese club. Lo que no puede es quedarse asi.
--
-- Donde se valida ahora la plantilla: **al mandar el once**. Si te pasas de 23 o
-- de lo que cabe de un club, guardar_alineacion rebota y dice que hacer. Inicio
-- lleva el mismo aviso, y liberar_jugador solo deja soltar a quien arregla la
-- infraccion: si te sobra uno del Real Sociedad, soltar a otro no desbloquea
-- nada y ahora se rechaza.
--
-- La herencia de onces no pasa por guardar_alineacion, asi que nadie se queda
-- sin once por no arreglarlo a tiempo.

begin;

-- Lo que le falla a una plantilla, y quien se puede soltar para arreglarlo.
create or replace function falm.infracciones_plantilla(p_equipo uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'falm'
as $function$
declare v_temp uuid; v_total int; v_clubes jsonb; v_lib jsonb; v_aviso text;
        c_max constant int := 23;
begin
  select id into v_temp from falm.temporada where activa order by created_at desc limit 1;

  select count(*) into v_total from falm.plantilla
   where equipo_falm_id = p_equipo and temporada_id = v_temp and fecha_baja is null;

  with mis as (
    select falm.club_de_activo(pl.activo_id) as club_id
      from falm.plantilla pl
     where pl.equipo_falm_id = p_equipo and pl.temporada_id = v_temp and pl.fecha_baja is null
  ), por_club as (
    select el.id, el.nombre, coalesce(el.limite_plantilla, 99) as tope, count(*) as tienen
      from mis join falm.equipo_lfp el on el.id = mis.club_id
     group by el.id, el.nombre, el.limite_plantilla
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'club', nombre, 'club_id', id, 'tienen', tienen, 'tope', tope) order by nombre), '[]'::jsonb)
    into v_clubes
    from por_club where tienen > tope;

  -- Quien vale para arreglarlo: si hay algun club pasado, solo de esos clubes;
  -- si solo sobran jugadores, cualquiera.
  if jsonb_array_length(v_clubes) > 0 then
    select coalesce(jsonb_agg(pl.activo_id), '[]'::jsonb) into v_lib
      from falm.plantilla pl
     where pl.equipo_falm_id = p_equipo and pl.temporada_id = v_temp and pl.fecha_baja is null
       and falm.club_de_activo(pl.activo_id) in
           (select (c->>'club_id')::uuid from jsonb_array_elements(v_clubes) c);
  elsif v_total > c_max then
    select coalesce(jsonb_agg(pl.activo_id), '[]'::jsonb) into v_lib
      from falm.plantilla pl
     where pl.equipo_falm_id = p_equipo and pl.temporada_id = v_temp and pl.fecha_baja is null;
  else
    v_lib := '[]'::jsonb;
  end if;

  v_aviso := case
    when jsonb_array_length(v_clubes) > 0 then
      'Tienes ' || (v_clubes->0->>'tienen') || ' jugadores del ' || (v_clubes->0->>'club') ||
      ' y el tope son ' || (v_clubes->0->>'tope') || ': suelta a uno de ellos desde Plantilla.'
    when v_total > c_max then
      'Tienes ' || v_total || ' jugadores y el máximo son ' || c_max || ': suelta a uno desde Plantilla.'
    else null end;

  return jsonb_build_object(
    'total', v_total, 'tope', c_max, 'sobran', greatest(v_total - c_max, 0),
    'clubes', v_clubes,
    'bloquea', (v_total > c_max or jsonb_array_length(v_clubes) > 0),
    'aviso', v_aviso,
    'liberables', coalesce(v_lib, '[]'::jsonb));
end $function$;

revoke all on function falm.infracciones_plantilla(uuid) from public;
grant execute on function falm.infracciones_plantilla(uuid) to authenticated;

-- Soltar a uno: solo cuando la plantilla no cumple, y solo a quien lo arregla.
create or replace function falm.liberar_jugador(p_activo uuid)
returns integer
language plpgsql
security definer
set search_path to 'public', 'falm'
as $function$
declare v_eq uuid; v_temp uuid; v_n int; v_inf jsonb;
begin
  select pl.equipo_falm_id, pl.temporada_id into v_eq, v_temp
    from falm.plantilla pl join falm.temporada t on t.id = pl.temporada_id and t.activa
   where pl.activo_id = p_activo and pl.fecha_baja is null limit 1;
  if v_eq is null then raise exception 'Ese jugador no esta en ninguna plantilla'; end if;
  if not (falm.es_mi_equipo(v_eq) or falm.es_admin()) then
    raise exception 'Solo puedes liberar jugadores de tu plantilla';
  end if;

  v_inf := falm.infracciones_plantilla(v_eq);
  if not (v_inf->>'bloquea')::boolean then
    raise exception 'Tu plantilla cumple: no hay que soltar a nadie.';
  end if;
  if not (v_inf->'liberables' ? p_activo::text) then
    raise exception 'Con ese no arreglas nada. %', v_inf->>'aviso';
  end if;

  update falm.plantilla set fecha_baja = now()
   where equipo_falm_id = v_eq and temporada_id = v_temp and activo_id = p_activo and fecha_baja is null;

  -- Para el teletipo: "ficha a X y deja salir a Y" sale del ultimo fichaje.
  update falm.peticion_fichaje set activo_baja_id = p_activo
   where id = (select id from falm.peticion_fichaje
                where equipo_falm_id = v_eq and activo_fichado_id is not null
                  and activo_baja_id is null and activo_fichado_id <> p_activo
                order by fecha_procesamiento desc limit 1);

  select count(*) into v_n from falm.plantilla
   where equipo_falm_id = v_eq and temporada_id = v_temp and fecha_baja is null;
  return v_n;
end $function$;

commit;

-- Y en la base quedan, parcheadas sobre su definicion viva:
--
--  * procesar_fichajes_semana: fuera el bloque del cupo por club. Se mantiene
--    "un fichaje por equipo y semana" y que quien sigue por encima de 23 no
--    fiche otro.
--  * guardar_alineacion: el limite de 23 pasa a ser
--    falm.infracciones_plantilla(), que mira tambien los topes por club y
--    devuelve el aviso ya escrito.
--  * acta_fichajes: se cae el motivo "ya tienes N del club, que es el tope",
--    que ya no puede ser la causa de que una opcion no prospere.
