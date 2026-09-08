-- Casos de la regla "un fichaje por equipo y jornada". Se revierte solo:
-- termina lanzando una excepcion a proposito, asi que Postgres deshace las
-- peticiones y los fichajes de mentira que inserta.
-- Pasa si el error empieza por 'TEST OK'; falla si empieza por 'FALLO'.
--
-- Reproduce el caso real: un equipo con varias peticiones pendientes en la
-- misma jornada, cada una pidiendo un jugador distinto. Antes se llevaba uno
-- por peticion.

do $$
declare
  v_temp uuid; v_jor uuid; v_eq uuid;
  v_a1 uuid; v_a2 uuid;
  v_p1 uuid; v_p2 uuid;
  v_fichados int; v_n int; v_obs text; v_tapado uuid;
  v_fallos text[] := array[]::text[];
begin
  select id into v_temp from falm.temporada where activa limit 1;

  -- Una jornada de liga sin peticiones pendientes, para no pisar nada de verdad.
  select jf.id into v_jor
    from falm.jornada_falm jf
    join falm.competicion c on c.id = jf.competicion_id
   where c.temporada_id = v_temp and c.tipo = 'LIGA'
     and not exists (select 1 from falm.peticion_fichaje p
                      where p.jornada_objetivo_id = jf.id and p.estado = 'PENDIENTE')
   order by jf.numero limit 1;

  -- Un equipo cualquiera, y le hacemos DOS huecos. Las diez plantillas estan a
  -- 23, que es el tope, asi que sin esto no ficharia nadie y la prueba pasaria
  -- por el motivo equivocado. Con dos huecos, si se llevara dos jugadores el
  -- tope no seria quien lo impide: lo tiene que impedir la regla.
  select e.id into v_eq from falm.equipo_falm e
   where e.temporada_id = v_temp order by e.nombre limit 1;

  update falm.plantilla set fecha_baja = now()
   where id in (select pl.id from falm.plantilla pl
                 where pl.equipo_falm_id = v_eq and pl.temporada_id = v_temp
                   and pl.fecha_baja is null limit 2);

  -- Dos activos libres de clubes donde este equipo no tiene a nadie, para que
  -- no sea el cupo por club quien corte y creamos haber probado la regla.
  select a.id into v_a1
    from falm.activo a
   where not exists (select 1 from falm.plantilla pl
                      where pl.activo_id = a.id and pl.temporada_id = v_temp and pl.fecha_baja is null)
     and not exists (select 1 from falm.plantilla pl
                      where pl.equipo_falm_id = v_eq and pl.temporada_id = v_temp and pl.fecha_baja is null
                        and falm.club_de_activo(pl.activo_id) = falm.club_de_activo(a.id))
   limit 1;

  select a.id into v_a2
    from falm.activo a
   where a.id <> v_a1
     and falm.club_de_activo(a.id) is distinct from falm.club_de_activo(v_a1)
     and not exists (select 1 from falm.plantilla pl
                      where pl.activo_id = a.id and pl.temporada_id = v_temp and pl.fecha_baja is null)
     and not exists (select 1 from falm.plantilla pl
                      where pl.equipo_falm_id = v_eq and pl.temporada_id = v_temp and pl.fecha_baja is null
                        and falm.club_de_activo(pl.activo_id) = falm.club_de_activo(a.id))
   limit 1;

  if v_jor is null or v_eq is null or v_a1 is null or v_a2 is null then
    raise exception 'FALLO: faltan datos para montar el caso (jornada %, equipo %, activos % y %)',
      v_jor, v_eq, v_a1, v_a2;
  end if;

  -- Dos peticiones del MISMO equipo y la MISMA jornada, pidiendo cada una un
  -- jugador distinto. Es lo que hoy deja hacer la pantalla al pulsar Enviar
  -- dos veces en vez de sustituir la anterior.
  insert into falm.peticion_fichaje (equipo_falm_id, jornada_objetivo_id, estado, fecha_creacion)
  values (v_eq, v_jor, 'PENDIENTE', now() - interval '2 hours') returning id into v_p1;
  insert into falm.peticion_fichaje_opcion (peticion_id, activo_id, prioridad)
  values (v_p1, v_a1, 1);

  insert into falm.peticion_fichaje (equipo_falm_id, jornada_objetivo_id, estado, fecha_creacion)
  values (v_eq, v_jor, 'PENDIENTE', now()) returning id into v_p2;
  insert into falm.peticion_fichaje_opcion (peticion_id, activo_id, prioridad)
  values (v_p2, v_a2, 1);

  v_fichados := falm.procesar_fichajes(v_jor);

  -- 1. Un solo fichaje, no dos. Es el fallo que se arregla.
  if v_fichados <> 1 then
    v_fallos := v_fallos || format('1: procesar_fichajes devuelve %s fichajes, esperado 1', v_fichados);
  end if;

  select count(*) into v_n from falm.plantilla
   where equipo_falm_id = v_eq and temporada_id = v_temp
     and fecha_baja is null and activo_id in (v_a1, v_a2);
  if v_n <> 1 then
    v_fallos := v_fallos || format('1: el equipo se lleva %s jugadores de los dos pedidos, esperado 1', v_n);
  end if;

  -- 2. El que entra es el de la ULTIMA peticion, que es lo que uno espera al
  --    volver a mandar el formulario.
  select activo_fichado_id into v_tapado from falm.peticion_fichaje where id = v_p2;
  if v_tapado is distinct from v_a2 then
    v_fallos := v_fallos || '2: no ficha el jugador de la ultima peticion';
  end if;
  if exists (select 1 from falm.plantilla
              where equipo_falm_id = v_eq and temporada_id = v_temp
                and fecha_baja is null and activo_id = v_a1) then
    v_fallos := v_fallos || '2: ha fichado tambien el de la peticion vieja';
  end if;

  -- 3. La peticion vieja queda cerrada, y dice por que.
  select observaciones into v_obs from falm.peticion_fichaje where id = v_p1;
  if v_obs is null or v_obs not ilike '%sustituida%' then
    v_fallos := v_fallos || format('3: la peticion vieja no explica que fue sustituida (dice: %s)', coalesce(v_obs,'nada'));
  end if;
  select count(*) into v_n from falm.peticion_fichaje
   where jornada_objetivo_id = v_jor and estado = 'PENDIENTE';
  if v_n <> 0 then
    v_fallos := v_fallos || format('3: quedan %s peticiones pendientes despues de procesar', v_n);
  end if;

  if array_length(v_fallos, 1) > 0 then
    raise exception 'FALLO: %', array_to_string(v_fallos, ' | ');
  end if;
  raise exception 'TEST OK: 3 casos (un fichaje por jornada, gana la ultima peticion, la vieja queda explicada)';
end $$;
