-- Fichajes y herencia de alineaciones: de hora fija a relativas al cierre de la jornada.
-- Aplicado el 2026-09-03.
--
-- Antes habia dos crons clavados al martes por la noche, que era cuando cerraba la jornada
-- en la temporada de prueba:
--     falm-procesar-fichajes   59 22 * * 2
--     heredar-alineaciones      5 23 * * 2
-- Con el calendario real la jornada cierra cuando arranca su primer partido: casi siempre
-- viernes o sabado, pero la jornada 2 cierra el martes 15/09 a las 19:00 y la 29 el
-- miercoles 21/04. Con hora fija, esos dos crons habrian corrido DESPUES del cierre: los
-- fichajes se resolverian tarde y quien no hubiese puesto once se quedaria sin heredar.
--
-- Ahora una sola tarea corre cada hora (cron falm-tareas-jornada, '10 * * * *') y decide
-- por el tiempo que falta para el cierre de la jornada objetivo:
--     fichajes  -> cuando faltan 12 h o menos
--     herencia  -> cuando falta  1 h o menos
-- Cada cosa se hace UNA sola vez por jornada; queda anotada en jornada_falm. Verificado:
-- en una segunda pasada con los mismos margenes ya no repite ninguna de las dos.

alter table falm.jornada_falm add column if not exists fichajes_procesados_en    timestamptz;
alter table falm.jornada_falm add column if not exists alineaciones_heredadas_en timestamptz;

create or replace function falm.tareas_previas_jornada(
  p_margen_fichajes interval default '12 hours',
  p_margen_herencia interval default '1 hour'
) returns jsonb
language plpgsql
as $function$
declare
  v_jor uuid; v_num int; v_cierre timestamptz; v_falta interval;
  v_fichados int; v_heredadas int;
  v_res jsonb := '{}'::jsonb;
begin
  v_jor := falm.jornada_objetivo_actual();
  if v_jor is null then
    return jsonb_build_object('jornada', null, 'motivo', 'no hay jornada objetivo');
  end if;

  select numero, fecha_cierre into v_num, v_cierre from falm.jornada_falm where id = v_jor;
  if v_cierre is null then
    return jsonb_build_object('jornada', v_num, 'motivo', 'la jornada no tiene fecha de cierre');
  end if;
  v_falta := v_cierre - now();

  if v_falta <= p_margen_fichajes
     and (select fichajes_procesados_en from falm.jornada_falm where id = v_jor) is null then
    v_fichados := falm.procesar_fichajes(v_jor);
    update falm.jornada_falm set fichajes_procesados_en = now() where id = v_jor;
    v_res := v_res || jsonb_build_object('fichajes', v_fichados);
  end if;

  if v_falta <= p_margen_herencia
     and (select alineaciones_heredadas_en from falm.jornada_falm where id = v_jor) is null then
    v_heredadas := falm.heredar_alineaciones(v_jor);
    update falm.jornada_falm set alineaciones_heredadas_en = now() where id = v_jor;
    v_res := v_res || jsonb_build_object('alineaciones_heredadas', v_heredadas);
  end if;

  return v_res || jsonb_build_object('jornada', v_num,
    'cierra_en', to_char(v_cierre at time zone 'Europe/Madrid','DD/MM HH24:MI'),
    'falta_horas', round(extract(epoch from v_falta)/3600));
end $function$;

-- Cambio de crons aplicado:
--   select cron.unschedule('falm-procesar-fichajes');
--   select cron.unschedule('heredar-alineaciones');
--   select cron.schedule('falm-tareas-jornada', '10 * * * *',
--                        'select falm.tareas_previas_jornada()');
--
-- Crons vivos despues del cambio:
--   falm-expirar-ofertas   0 * * * *      select falm.expirar_ofertas();
--   falm-procesar-jornada  0 7 * * 1,2    select falm.procesar_jornada_auto()
--   falm-tareas-jornada    10 * * * *     select falm.tareas_previas_jornada()
