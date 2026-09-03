-- Verificación de draft_pick v2 y draft_pick_deshacer.
--
-- Todo ocurre dentro de un bloque DO que termina lanzando una excepción a
-- propósito, de modo que Postgres revierte el draft de prueba y la base queda
-- exactamente como estaba. Se puede ejecutar tantas veces como haga falta.
--
--   PASA  -> termina con el error 'TEST OK: todos los casos pasaron'
--   FALLA -> termina con un error que empieza por 'FALLO C<n>'
--
-- Lo que NO se puede probar aquí: la validación de identidad (auth.uid()), que
-- es nulo al ejecutar como postgres. Eso se verifica desde el navegador.

do $$
declare
  v_temp uuid; v_draft uuid; v_eq1 uuid; v_eq2 uuid;
  v_campo uuid; v_campo2 uuid; v_porteria uuid; v_portero_indiv uuid;
  v_turno_eq uuid;
  v_porterias_eq int; v_restantes_eq int; v_obligado boolean;
begin
  select id into v_temp from falm.temporada where activa limit 1;
  if v_temp is null then raise exception 'FALLO C0: no hay temporada activa'; end if;

  v_draft := falm.draft_crear(v_temp, 'TEST draft', 3);

  select equipo_falm_id into v_eq1 from falm.draft_orden
   where draft_id = v_draft and not completado order by orden_global limit 1;
  select id into v_eq2 from falm.equipo_falm
   where temporada_id = v_temp and id <> v_eq1 limit 1;

  select activo_id into v_campo from falm.v_activo_libre where tipo = 'JUGADOR' limit 1;
  select a.id into v_portero_indiv from falm.activo a
    join falm.jugador_lfp j on j.id = a.jugador_lfp_id
   where j.posicion = 'PORTERO' limit 1;

  -- CASO 1: pick fuera de turno
  begin
    perform falm.draft_pick(v_draft, v_campo, v_eq2);
    raise exception 'FALLO C1: aceptó un pick fuera de turno';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
    if position('turno' in lower(sqlerrm)) = 0 then
      raise exception 'FALLO C1: error inesperado: %', sqlerrm;
    end if;
  end;

  -- CASO 2: activo no fichable (portero individual)
  begin
    perform falm.draft_pick(v_draft, v_portero_indiv, v_eq1);
    raise exception 'FALLO C2: aceptó un portero individual';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
    if position('disponible' in lower(sqlerrm)) = 0 then
      raise exception 'FALLO C2: error inesperado: %', sqlerrm;
    end if;
  end;

  -- CASO 3: pick válido
  perform falm.draft_pick(v_draft, v_campo, v_eq1);
  if not exists (select 1 from falm.draft_pick where draft_id = v_draft and activo_id = v_campo) then
    raise exception 'FALLO C3: el pick válido no se guardó';
  end if;

  -- CASO 4: activo ya elegido
  select equipo_falm_id into v_turno_eq from falm.draft_orden
   where draft_id = v_draft and not completado order by orden_global limit 1;
  begin
    perform falm.draft_pick(v_draft, v_campo, v_turno_eq);
    raise exception 'FALLO C4: aceptó un activo ya elegido';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
    if position('elegido' in lower(sqlerrm)) = 0
       and position('disponible' in lower(sqlerrm)) = 0 then
      raise exception 'FALLO C4: error inesperado: %', sqlerrm;
    end if;
  end;

  -- CASO 5: deshacer devuelve el turno al equipo original
  perform falm.draft_pick_deshacer(v_draft);
  if exists (select 1 from falm.draft_pick where draft_id = v_draft and activo_id = v_campo) then
    raise exception 'FALLO C5: el pick no se deshizo';
  end if;
  select equipo_falm_id into v_turno_eq from falm.draft_orden
   where draft_id = v_draft and not completado order by orden_global limit 1;
  if v_turno_eq <> v_eq1 then
    raise exception 'FALLO C5: el turno no volvió al equipo original';
  end if;

  -- CASO 6: mínimo de porterías. Con 3 rondas, el equipo tiene 3 turnos.
  -- Gasta el primero en un jugador de campo: le quedan 2 turnos y le faltan 2
  -- porterías, así que el segundo pick de campo debe ser rechazado.
  --
  -- Para llegar hasta ahí hay que fichar por los 9 rivales hasta que el turno
  -- vuelva. Cada rival elige según su propio cupo: portería si la regla ya le
  -- obliga, jugador de campo si aún puede. Si el bucle no respetara la regla,
  -- fallaría por la misma validación que estamos probando.
  perform falm.draft_pick(v_draft, v_campo, v_eq1);
  loop
    select equipo_falm_id into v_turno_eq from falm.draft_orden
     where draft_id = v_draft and not completado order by orden_global limit 1;
    exit when v_turno_eq = v_eq1;

    select count(*) into v_porterias_eq
      from falm.draft_pick dp join falm.activo a on a.id = dp.activo_id
     where dp.draft_id = v_draft and dp.equipo_falm_id = v_turno_eq and a.tipo = 'DEFENSA';
    select count(*) into v_restantes_eq
      from falm.draft_orden
     where draft_id = v_draft and equipo_falm_id = v_turno_eq and not completado;
    v_obligado := (2 - v_porterias_eq) > 0 and v_restantes_eq <= (2 - v_porterias_eq);

    perform falm.draft_pick(v_draft,
      (select activo_id from falm.v_activo_libre v
        where (not v_obligado or v.tipo = 'DEFENSA')
          and (v_obligado or v.tipo = 'JUGADOR')
          and not exists (select 1 from falm.draft_pick dp
                           where dp.draft_id = v_draft and dp.activo_id = v.activo_id)
        limit 1),
      v_turno_eq);
  end loop;

  -- v_campo2 se elige aquí, no al principio: el bucle de arriba ya ha ido
  -- consumiendo jugadores de la lista.
  select activo_id into v_campo2 from falm.v_activo_libre v
   where v.tipo = 'JUGADOR'
     and not exists (select 1 from falm.draft_pick dp
                      where dp.draft_id = v_draft and dp.activo_id = v.activo_id)
   limit 1;
  begin
    perform falm.draft_pick(v_draft, v_campo2, v_eq1);
    raise exception 'FALLO C6: aceptó un jugador de campo sin cubrir el mínimo de porterías';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
    if position('portería' in lower(sqlerrm)) = 0 then
      raise exception 'FALLO C6: error inesperado: %', sqlerrm;
    end if;
  end;

  -- CASO 7: la portería sí se acepta en esa misma situación
  select activo_id into v_porteria from falm.v_activo_libre v
   where v.tipo = 'DEFENSA'
     and not exists (select 1 from falm.draft_pick dp
                      where dp.draft_id = v_draft and dp.activo_id = v.activo_id)
   limit 1;
  perform falm.draft_pick(v_draft, v_porteria, v_eq1);
  if not exists (select 1 from falm.draft_pick dp join falm.activo a on a.id = dp.activo_id
                  where dp.draft_id = v_draft and dp.equipo_falm_id = v_eq1 and a.tipo = 'DEFENSA') then
    raise exception 'FALLO C7: no aceptó la portería';
  end if;

  -- Todo bien: revienta a propósito para revertir el draft de prueba.
  raise exception 'TEST OK: todos los casos pasaron';
end $$;
