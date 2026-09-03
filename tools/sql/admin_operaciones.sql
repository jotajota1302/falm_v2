-- Panel de admin: estado de las tareas automaticas y cierre de RLS en equipo_falm.

-- El comando de un cron puede llevar credenciales (por ejemplo un token de API),
-- asi que esto no sale del panel de administracion.
create or replace function falm.estado_crons()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'falm', 'cron'
as $function$
declare v_r jsonb;
begin
  if not falm.puede_gestionar() then
    raise exception 'Solo un administrador puede ver las tareas programadas';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', j.jobid, 'nombre', j.jobname, 'horario', j.schedule,
           'comando', j.command, 'activo', j.active,
           'ultima', u.start_time, 'estado', u.status,
           'mensaje', left(coalesce(u.return_message, ''), 200)
         ) order by j.jobid), '[]'::jsonb)
    into v_r
  from cron.job j
  left join lateral (
    select d.start_time, d.status, d.return_message
    from cron.job_run_details d
    where d.jobid = j.jobid
    order by d.start_time desc limit 1
  ) u on true;
  return v_r;
end $function$;

revoke execute on function falm.estado_crons() from public;
grant execute on function falm.estado_crons() to authenticated;

-- equipo_falm: solo escribe el admin.
--
-- La politica wr_dueno permitia a cada manager hacer UPDATE sobre su propia
-- fila. Como RLS no filtra por columna y el GRANT es de tabla completa, eso
-- incluia presupuesto, puntos_clasif, victorias y beneficio: cualquiera podia
-- falsear su clasificacion desde la consola del navegador.
drop policy if exists wr_dueno on falm.equipo_falm;
drop policy if exists wr_equipo_admin on falm.equipo_falm;
create policy wr_equipo_admin on falm.equipo_falm for update to authenticated
  using (falm.es_admin())
  with check (falm.es_admin());
