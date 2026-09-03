-- Panel de admin: estado de las tareas automáticas y cierre de un agujero de RLS.

-- ---------------------------------------------------------------------------
-- Estado de los cron, para que Operaciones diga qué está automatizado y cuándo
-- corrió por última vez, en vez de ofrecer botones a ciegas que lo duplican.
-- ---------------------------------------------------------------------------
create or replace function falm.estado_crons()
returns jsonb
language sql
security definer
set search_path to 'public', 'falm', 'cron'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', j.jobid,
           'nombre', j.jobname,
           'horario', j.schedule,
           'comando', j.command,
           'activo', j.active,
           'ultima', u.start_time,
           'estado', u.status,
           'mensaje', left(coalesce(u.return_message, ''), 200)
         ) order by j.jobid), '[]'::jsonb)
  from cron.job j
  left join lateral (
    select d.start_time, d.status, d.return_message
    from cron.job_run_details d
    where d.jobid = j.jobid
    order by d.start_time desc
    limit 1
  ) u on true;
$function$;

grant execute on function falm.estado_crons() to authenticated;

-- ---------------------------------------------------------------------------
-- equipo_falm: solo escribe el admin.
--
-- La política wr_dueno permitía a cada mánager hacer UPDATE sobre su propia
-- fila. Como RLS no filtra por columna y el GRANT es de tabla completa, eso
-- incluía presupuesto, puntos_clasif, victorias y beneficio: cualquiera podía
-- falsear su clasificación desde la consola del navegador.
--
-- El único UPDATE del frontend es el del panel de admin, y las funciones que
-- tocan la clasificación (recalcular_clasificacion, procesar_fichajes,
-- draft_consolidar) son SECURITY DEFINER y se saltan RLS, así que no se rompe
-- nada al cerrarlo.
-- ---------------------------------------------------------------------------
drop policy if exists wr_dueno on falm.equipo_falm;
create policy wr_equipo_admin on falm.equipo_falm for update to authenticated
  using (falm.es_admin())
  with check (falm.es_admin());
