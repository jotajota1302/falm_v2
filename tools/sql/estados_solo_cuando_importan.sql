-- Lesionados y sancionados: leerlos cuando sirven de algo.
--
-- El cron falm-estados-jugadores corria cada 3 horas, todos los dias del anio,
-- y SIEMPRE se descargaba las dos paginas de futbolfantasy sin preguntarse si
-- hacia falta. Medido el 2026-09-10: la de lesionados pesa 347 kB y la de
-- sancionados otro tanto, asi que son ~700 kB por pasada, 5,6 MB al dia y
-- **2 GB al ano** -- en junio y julio tambien, sin liga que jugar.
--
-- Para que sirve el dato: para decidir a quien alineas. Es decir, importa en
-- las horas previas al cierre de una jornada, y no a las 4 de la manana de un
-- martes ni en agosto.
--
-- Como queda: el cron sigue despertandose cada 3 horas, pero ahora pasa por
-- falm.estados_jugadores_si_hace_falta(), que lee
--   - cada pasada, si el cierre de la jornada objetivo esta a menos de 48 h;
--   - una vez al dia el resto del tiempo, para que el dato no envejezca;
--   - nunca, si no hay jornada objetivo (temporada acabada).
--
-- La funcion de siempre, falm.refrescar_estados_jugadores(), no cambia: lee
-- siempre que se la llama. Es la que hay detras del boton de Admin, y ahi la
-- gracia es justamente forzar la lectura. Por eso el filtro va en una funcion
-- aparte y no en un parametro: el boton no puede quedarse sin efecto por un
-- default mal puesto.

create or replace function falm.estados_jugadores_si_hace_falta()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'falm'
as $function$
declare v_jor uuid; v_cierre timestamptz; v_ultima timestamptz;
begin
  if not falm.puede_gestionar() then
    raise exception 'Solo un administrador puede refrescar los estados';
  end if;

  -- Sin jornada que preparar no hay a quien alinear: en verano no se lee nada.
  -- Ojo con la diferencia entre las dos cosas que pueden faltar: que no haya
  -- jornada objetivo (temporada acabada) es parar; que la haya y todavia no
  -- tenga fecha de cierre (calendario sin traer) es seguir con el repaso diario.
  v_jor := falm.jornada_objetivo_actual();
  if v_jor is null then
    return jsonb_build_object('leido', false, 'porque', 'no hay jornada objetivo');
  end if;

  select jf.fecha_cierre into v_cierre from falm.jornada_falm jf where jf.id = v_jor;
  select max(actualizado_en) into v_ultima from falm.estado_jugador;

  -- Cerca del cierre es cuando la gente esta tocando su once: cada pasada.
  if v_cierre is not null and v_cierre > now() and v_cierre - now() <= interval '48 hours' then
    return falm.refrescar_estados_jugadores()
        || jsonb_build_object('porque', 'el cierre esta a menos de 48 h');
  end if;

  -- Y aunque no haya nada cerca, un repaso al dia: si alguien entra un martes
  -- a mirar su plantilla, que no vea una lesion de la semana pasada. Las 20 h
  -- en vez de 24 son para que no se salte un dia por unos minutos de desfase.
  if v_ultima is null or now() - v_ultima >= interval '20 hours' then
    return falm.refrescar_estados_jugadores()
        || jsonb_build_object('porque', 'toca el repaso diario');
  end if;

  return jsonb_build_object('leido', false,
    'porque', 'ni hay cierre cerca ni toca el repaso diario',
    'ultima_lectura', v_ultima, 'cierra', v_cierre);
end $function$;

revoke execute on function falm.estados_jugadores_si_hace_falta() from public, anon, authenticated;

-- Cron aplicado:
--   select cron.alter_job(
--     (select jobid from cron.job where jobname = 'falm-estados-jugadores'),
--     command => 'select falm.estados_jugadores_si_hace_falta()');
