-- Verificación de la edición por conceptos y de la explicación de los puntos.
--
-- Edita de verdad la puntuación de un jugador y termina lanzando una excepción,
-- así que todo se revierte. Usa a Álex Baena en la jornada 3, que es el caso que
-- disparó todo esto: 11 puntos y no se veía de dónde salían.
--
--   PASA  -> termina con el error 'TEST OK: los 6 casos pasaron'
--   FALLA -> termina con un error que empieza por 'FALLO C<n>'

do $$
declare
  v_ext int; v_antes numeric; v_r jsonb; v_tipo text; v_mal int;
begin
  select jl.ext_id, p.puntos into v_ext, v_antes
    from falm.puntuacion p
    join falm.jornada_lfp j on j.id = p.jornada_lfp_id and j.numero = 3
    join falm.activo a on a.id = p.activo_id and a.tipo='JUGADOR'
    join falm.jugador_lfp jl on jl.id = a.jugador_lfp_id
   where jl.nombre ilike '%baena%';

  if v_ext is null then raise exception 'FALLO C0: no se encontro a Baena'; end if;
  if v_antes <> 11 then raise exception 'FALLO C0: Baena tenia % y no 11', v_antes; end if;

  -- C1: quitarle un gol deja 8 (victoria 2 + 1 gol de medio 3 + 3 estrellas)
  v_r := falm.editar_desglose(v_ext, 3, '{"goles": 1}'::jsonb);
  if (v_r->>'puntos')::numeric <> 8 then
    raise exception 'FALLO C1: quedo en % y se esperaba 8', v_r->>'puntos';
  end if;

  -- C2: la fila queda marcada como MANUAL, para que la ingesta no la pise
  select p.tipo_insercion::text into v_tipo
    from falm.puntuacion p
    join falm.jornada_lfp j on j.id = p.jornada_lfp_id and j.numero = 3
    join falm.activo a on a.id = p.activo_id
    join falm.jugador_lfp jl on jl.id = a.jugador_lfp_id
   where jl.ext_id = v_ext;
  if v_tipo <> 'MANUAL' then raise exception 'FALLO C2: quedo como %', v_tipo; end if;

  -- C3: lo que no se manda se conserva (las estrellas siguen siendo 3)
  v_r := falm.editar_desglose(v_ext, 3, '{"minutos": 90}'::jsonb);
  if (v_r->'desglose'->>'estrellas')::numeric <> 3 then
    raise exception 'FALLO C3: se perdieron las estrellas: %', v_r->'desglose';
  end if;

  -- C4: la explicacion suma exactamente el total
  if (v_r->'explicacion'->>'total')::numeric <> (v_r->>'puntos')::numeric then
    raise exception 'FALLO C4: la explicacion suma % y el total es %',
      v_r->'explicacion'->>'total', v_r->>'puntos';
  end if;

  -- C5: un medio no cobra por porteria a cero por mucho que se marque
  v_r := falm.editar_desglose(v_ext, 3, '{"imbatido": true, "minutos": 90}'::jsonb);
  if (v_r->>'puntos')::numeric <> 8 then
    raise exception 'FALLO C5: al marcar imbatido a un medio subio a %', v_r->>'puntos';
  end if;

  -- C6: en toda la temporada, la explicacion cuadra con el total guardado
  select count(*) into v_mal
    from falm.puntuacion p
    join falm.activo a on a.id = p.activo_id and a.tipo='JUGADOR'
    join falm.jugador_lfp jl on jl.id = a.jugador_lfp_id
   where p.puntos <> (falm.desglose_puntos(jl.posicion, p.desglose)->>'total')::numeric;
  if v_mal > 0 then
    raise exception 'FALLO C6: % filas donde la explicacion no cuadra con el total', v_mal;
  end if;

  raise exception 'TEST OK: los 6 casos pasaron';
end $$;
