-- Casos de "las ofertas de intercambio se pueden crear y caducan solas".
-- Se revierte solo: termina lanzando una excepcion a proposito.
-- Pasa si el error empieza por 'TEST OK'; falla si empieza por 'FALLO'.
--
-- El caso 1 es el que estaba roto: sin default en fecha_expiracion, el insert
-- que hace la app moria con un not-null y no se podia ofertar nada.

do $test$
declare
  v_a uuid; v_b uuid; v_of uuid; v_exp timestamptz; v_dias numeric;
  v_fallos text[] := array[]::text[];
begin
  select id into v_a from falm.equipo_falm order by nombre limit 1;
  select id into v_b from falm.equipo_falm order by nombre desc limit 1;

  -- 1. El alta tal y como la hace la app: sin fecha_expiracion.
  insert into falm.oferta_intercambio (equipo_oferente_id, equipo_receptor_id, estado, comentario)
  values (v_a, v_b, 'PENDIENTE', 'test') returning id, fecha_expiracion into v_of, v_exp;

  if v_exp is null then
    v_fallos := v_fallos || '1: la oferta se crea sin fecha de caducidad';
  else
    v_dias := round(extract(epoch from (v_exp - now())) / 86400);
    if v_dias <> 7 then
      v_fallos := v_fallos || format('1: caduca a los %s dias en vez de 7', v_dias);
    end if;
  end if;

  -- 2. Una oferta caducada no se puede aceptar, corra el cron cuando corra.
  --    Esta es la regla de verdad; el estado EXPIRADA es solo la etiqueta.
  update falm.oferta_intercambio set fecha_expiracion = now() - interval '1 hour' where id = v_of;
  begin
    perform falm.oferta_responder(v_of, 'ACEPTADA');
    v_fallos := v_fallos || '2: deja aceptar una oferta caducada';
  exception when others then
    if SQLERRM not like '%caducado%' then
      v_fallos := v_fallos || format('2: falla por otra cosa (%s)', left(SQLERRM, 80));
    end if;
  end;

  -- 3. Pero si se puede rechazar: hay que poder quitarse de encima una muerta.
  begin
    perform falm.oferta_responder(v_of, 'RECHAZADA');
  exception when others then
    v_fallos := v_fallos || format('3: no deja rechazar una caducada (%s)', left(SQLERRM, 80));
  end;

  -- 4. Y expirar_ofertas la repinta, que es para lo unico que sirve el cron.
  update falm.oferta_intercambio set estado = 'PENDIENTE' where id = v_of;
  perform falm.expirar_ofertas();
  if (select estado::text from falm.oferta_intercambio where id = v_of) <> 'EXPIRADA' then
    v_fallos := v_fallos || '4: el cron no marca como EXPIRADA una ya vencida';
  end if;

  if array_length(v_fallos, 1) > 0 then
    raise exception 'FALLO: %', array_to_string(v_fallos, ' | ');
  end if;
  raise exception 'TEST OK: 4 casos (se crea y caduca a 7 dias; caducada no se acepta; si se rechaza; el cron la repinta)';
end $test$;
