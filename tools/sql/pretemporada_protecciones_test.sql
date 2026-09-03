-- Verificación de las protecciones de la pretemporada y de la edición puntual.
--
-- Se ejecuta sobre la temporada activa y termina lanzando una excepción a
-- propósito, así que todo lo que toca se revierte: el calendario real no se
-- modifica. Repetible tantas veces como haga falta.
--
--   PASA  -> termina con el error 'TEST OK: los 11 casos pasaron'
--   FALLA -> termina con un error que empieza por 'FALLO C<n>'
--
-- Presupone la temporada 2026-27 tal como quedó montada: 32 jornadas mapeadas a
-- LFP 5-36 y 180 enfrentamientos sin jugar. Si cambian esas cifras, ajusta C1.

do $$
declare
  v_t uuid; v_est jsonb; v_r jsonb; v_enf uuid; v_jor uuid;
  v_loc uuid; v_vis uuid; v_otro uuid;
begin
  select id into v_t from falm.temporada where activa limit 1;
  v_est := falm.estado_pretemporada(v_t);

  -- C1: el estado refleja la realidad
  if (v_est->>'jornadas')::int <> 32 or (v_est->>'enfrentamientos')::int <> 180
     or (v_est->>'bloqueado')::boolean then
    raise exception 'FALLO C1: estado inesperado: %', v_est;
  end if;

  -- C2: mismo rango -> no hace nada
  v_r := falm.generar_jornadas_liga(v_t, 5, 36);
  if not coalesce((v_r->>'ya_estaba')::boolean, false) then
    raise exception 'FALLO C2: no detectó que ya estaba: %', v_r;
  end if;

  -- C3: rango distinto sin forzar -> rechazado
  begin
    perform falm.generar_jornadas_liga(v_t, 1, 38);
    raise exception 'FALLO C3: aceptó cambiar el rango sin forzar';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
    if position('marca forzar' in sqlerrm) = 0 then
      raise exception 'FALLO C3: error inesperado: %', sqlerrm;
    end if;
  end;

  -- C4: calendario ya existente sin forzar -> rechazado
  begin
    perform falm.generar_calendario_liga(v_t);
    raise exception 'FALLO C4: regeneró el calendario sin forzar';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
    if position('Marca forzar' in sqlerrm) = 0 then
      raise exception 'FALLO C4: error inesperado: %', sqlerrm;
    end if;
  end;

  -- C5: temporada duplicada -> rechazada
  begin
    perform falm.crear_temporada('2026-27', 2026);
    raise exception 'FALLO C5: creó una temporada duplicada';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
    if position('Ya existe una temporada' in sqlerrm) = 0 then
      raise exception 'FALLO C5: error inesperado: %', sqlerrm;
    end if;
  end;

  -- C6: con resultados, ni forzando
  select e.id, e.jornada_falm_id, e.equipo_local_id, e.equipo_visitante_id
    into v_enf, v_jor, v_loc, v_vis
    from falm.enfrentamiento e
    join falm.jornada_falm jf on jf.id = e.jornada_falm_id
    join falm.competicion c on c.id = jf.competicion_id
   where c.temporada_id = v_t limit 1;
  update falm.enfrentamiento set puntos_local = 50, puntos_visitante = 40 where id = v_enf;
  begin
    perform falm.generar_calendario_liga(v_t, true);
    raise exception 'FALLO C6: regeneró el calendario con resultados y forzando';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
    if position('ya está en marcha' in sqlerrm) = 0 then
      raise exception 'FALLO C6: error inesperado: %', sqlerrm;
    end if;
  end;

  -- C7: editar un cruce de una jornada con resultados -> rechazado
  begin
    perform falm.enfrentamiento_editar(v_enf, v_vis, v_loc);
    raise exception 'FALLO C7: dejó editar un cruce ya jugado';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
    if position('ya tiene resultados' in sqlerrm) = 0 then
      raise exception 'FALLO C7: error inesperado: %', sqlerrm;
    end if;
  end;
  update falm.enfrentamiento set puntos_local = null, puntos_visitante = null where id = v_enf;

  -- C8: dar la vuelta a la localía de un cruce sin jugar -> permitido
  perform falm.enfrentamiento_editar(v_enf, v_vis, v_loc);
  if (select equipo_local_id from falm.enfrentamiento where id = v_enf) <> v_vis then
    raise exception 'FALLO C8: no aplicó el cambio de localía';
  end if;

  -- C9: meter un equipo que ya juega en esa jornada -> rechazado
  select e.equipo_local_id into v_otro from falm.enfrentamiento e
   where e.jornada_falm_id = v_jor and e.id <> v_enf limit 1;
  begin
    perform falm.enfrentamiento_editar(v_enf, v_otro, v_loc);
    raise exception 'FALLO C9: aceptó un equipo duplicado en la jornada';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
    if position('ya juega en esa jornada' in sqlerrm) = 0 then
      raise exception 'FALLO C9: error inesperado: %', sqlerrm;
    end if;
  end;

  -- C10: remapear una jornada suelta a otra LFP -> permitido
  perform falm.jornada_editar(v_jor, 7, null);
  if (select jl.numero from falm.mapeo_jornada m join falm.jornada_lfp jl on jl.id = m.jornada_lfp_id
       where m.jornada_falm_id = v_jor) <> 7 then
    raise exception 'FALLO C10: no remapeó la jornada';
  end if;

  -- C11: remapear a una LFP que no existe en la temporada -> rechazado
  begin
    perform falm.jornada_editar(v_jor, 99, null);
    raise exception 'FALLO C11: aceptó una jornada LFP inexistente';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
    if position('no tiene la jornada LFP' in sqlerrm) = 0 then
      raise exception 'FALLO C11: error inesperado: %', sqlerrm;
    end if;
  end;

  raise exception 'TEST OK: los 11 casos pasaron';
end $$;
