-- refrescar_calendario_fd: un partido acabado no vuelve a "por jugar". Aplicado el 2026-10-12.
--
-- A las 08:30 UTC de ese dia el listado competitions/PD/matches de football-data
-- devolvio como TIMED y sin marcador cuatro partidos ya jugados de la J8 (el endpoint
-- del partido suelto los daba bien). El upsert los machaco: sus clubes pasaron a
-- pendientes, los suplentes dejaron de entrar y el contador de lo que falta mintio
-- hasta que se relanzo el refresco.
--
-- Ahora, si el partido ya esta FINISHED y llega TIMED o SCHEDULED, se conservan el
-- estado y el marcador. Cualquier otro cambio (POSTPONED, CANCELLED, otro marcador)
-- entra como siempre. Se parchea por replace sobre la definicion viva.

do $$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('falm.refrescar_calendario_fd'::regproc);
  v_new := replace(v_def,
$a$    estado = excluded.estado, goles_local = excluded.goles_local,
    goles_visitante = excluded.goles_visitante, actualizado_en = now();$a$,
$a$    -- Un partido acabado no vuelve a "por jugar": el listado de football-data
    -- devolvio una vez como TIMED y sin marcador partidos ya jugados, y eso
    -- dejaba a sus clubes pendientes y sin relevos (2026-10-12).
    estado = case when partido_lfp.estado = 'FINISHED' and excluded.estado in ('TIMED', 'SCHEDULED')
                  then partido_lfp.estado else excluded.estado end,
    goles_local = case when partido_lfp.estado = 'FINISHED' and excluded.estado in ('TIMED', 'SCHEDULED')
                       then partido_lfp.goles_local else excluded.goles_local end,
    goles_visitante = case when partido_lfp.estado = 'FINISHED' and excluded.estado in ('TIMED', 'SCHEDULED')
                           then partido_lfp.goles_visitante else excluded.goles_visitante end,
    actualizado_en = now();$a$);
  if v_new = v_def then raise exception 'refrescar_calendario_fd no tiene la forma esperada; no se toca'; end if;
  execute v_new;
end $$;
