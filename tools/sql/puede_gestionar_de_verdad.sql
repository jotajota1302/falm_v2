-- falm.puede_gestionar() no guardaba nada: daba true a cualquiera.
-- Aplicado el 2026-09-08.
--
-- La funcion decia:
--
--     select coalesce(auth.role(), '') = 'service_role'
--         or current_user in ('postgres', 'supabase_admin')      <-- aqui
--         or (auth.uid() is not null and falm.es_gestor());
--
-- y es SECURITY DEFINER. Dentro de una funcion SECURITY DEFINER, current_user
-- NO es quien llama: es el dueño de la funcion, que aqui es postgres. Asi que
-- esa linea se cumplia siempre, para todo el mundo, y las otras dos daban
-- igual. Comprobado como rol 'authenticated' sin sesion: es_admin() devuelve
-- false y auth.uid() es null, pero puede_gestionar() devolvia true.
--
-- Lo que esa linea queria decir era "y tambien puede el propio Postgres",
-- para los cinco cron de pg_cron y para las migraciones. Eso es session_user,
-- que en una SECURITY DEFINER sigue siendo el rol que abrio la conexion:
--   - pg_cron          -> session_user = postgres      (los cinco jobs)
--   - editor SQL / MCP -> session_user = postgres
--   - la aplicacion    -> session_user = authenticator, y ahi si tiene que
--                         decidir es_gestor() por el perfil del usuario.
--
-- Importa porque 31 funciones de administracion tienen EXECUTE concedido a
-- 'authenticated' y su unica guarda era esta: draft_reiniciar, respaldo_borrar,
-- respaldo_restaurar, draft_consolidar, editar_puntos, procesar_fichajes,
-- crear_temporada... Cualquiera de los diez equipos, con su sesion normal,
-- podia llamarlas desde la consola del navegador.
--
-- En esta liga hay 1 ADMIN y 9 USUARIO; despues del cambio, los nueve dejan
-- de pasar y el admin sigue pasando por es_gestor().

create or replace function falm.puede_gestionar()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'falm'
as $function$
  select coalesce(auth.role(), '') = 'service_role'
      or session_user in ('postgres', 'supabase_admin')
      or (auth.uid() is not null and falm.es_gestor());
$function$;

comment on function falm.puede_gestionar() is
  'Quien puede administrar: el service_role, el propio Postgres (cron y migraciones) '
  'o un usuario con perfil GESTOR/ADMIN. session_user y no current_user: esta funcion '
  'es SECURITY DEFINER y ahi current_user es siempre su dueño.';
