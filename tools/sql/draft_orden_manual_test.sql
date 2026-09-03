-- Verificación del orden manual del draft (draft_reordenar / draft_validar_orden).
--
-- Se ejecuta sobre el draft activo que haya, y termina lanzando una excepción a
-- propósito para revertirlo todo: el orden del draft real no se toca.
--
--   PASA  -> termina con el error 'TEST OK: los 4 casos pasaron'
--   FALLA -> termina con un error que empieza por 'FALLO C<n>'

do $$
declare
  v_d uuid;
  v_temp uuid; v_orden uuid[]; v_primero text; v_r2 text; v_ultimo text;
begin
  select id into v_temp from falm.temporada where activa limit 1;
  select id into v_d from falm.draft
   where temporada_id = v_temp and estado in ('CREADO','EN_CURSO')
   order by created_at desc limit 1;
  if v_d is null then raise exception 'FALLO C0: no hay draft activo sobre el que probar'; end if;

  select array_agg(id order by nombre) into v_orden
    from falm.equipo_falm where temporada_id = v_temp;
  select nombre into v_primero from falm.equipo_falm where id = v_orden[1];
  select nombre into v_ultimo  from falm.equipo_falm where id = v_orden[array_length(v_orden,1)];

  -- CASO 1: orden incompleto
  begin
    perform falm.draft_reordenar(v_d, v_orden[1:5]);
    raise exception 'FALLO C1: aceptó un orden incompleto';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
    if position('debe tener los' in sqlerrm) = 0 then
      raise exception 'FALLO C1: error inesperado: %', sqlerrm;
    end if;
  end;

  -- CASO 2: equipo repetido
  begin
    perform falm.draft_reordenar(v_d, v_orden[1:array_length(v_orden,1)-1] || v_orden[1]);
    raise exception 'FALLO C2: aceptó un orden con repetidos';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
    if position('repetidos' in sqlerrm) = 0 then
      raise exception 'FALLO C2: error inesperado: %', sqlerrm;
    end if;
  end;

  -- CASO 3: orden válido -> ronda 1 en ese orden, ronda 2 invertida, turnos completos
  perform falm.draft_reordenar(v_d, v_orden);
  if (select e.nombre from falm.draft_orden o join falm.equipo_falm e on e.id = o.equipo_falm_id
       where o.draft_id = v_d and o.ronda = 1 and o.posicion_en_ronda = 1) <> v_primero then
    raise exception 'FALLO C3: la ronda 1 no respeta el orden dado';
  end if;
  select e.nombre into v_r2 from falm.draft_orden o join falm.equipo_falm e on e.id = o.equipo_falm_id
   where o.draft_id = v_d and o.ronda = 2 and o.posicion_en_ronda = 1;
  if v_r2 <> v_ultimo then
    raise exception 'FALLO C3: la ronda 2 no está invertida (esperaba %, hay %)', v_ultimo, v_r2;
  end if;
  if (select count(*) from falm.draft_orden where draft_id = v_d)
     <> (select total_rondas from falm.draft where id = v_d) * array_length(v_orden,1) then
    raise exception 'FALLO C3: el número de turnos no cuadra';
  end if;

  -- CASO 4: con picks hechos, el orden queda bloqueado
  perform falm.draft_pick(v_d,
    (select activo_id from falm.v_activo_libre limit 1),
    (select equipo_falm_id from falm.draft_orden
      where draft_id = v_d and not completado order by orden_global limit 1));
  begin
    perform falm.draft_reordenar(v_d, v_orden);
    raise exception 'FALLO C4: dejó reordenar con picks hechos';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
    if position('no se puede cambiar el orden' in sqlerrm) = 0 then
      raise exception 'FALLO C4: error inesperado: %', sqlerrm;
    end if;
  end;

  raise exception 'TEST OK: los 4 casos pasaron';
end $$;
