-- Quitar EXECUTE a lo que la aplicacion no llama nunca.
-- Aplicado el 2026-09-09, despues de arreglar falm.puede_gestionar().
--
-- LO QUE NO SE PUEDE HACER, y conviene dejarlo escrito para no volver a
-- intentarlo: en Supabase todo el que inicia sesion es el mismo rol de base de
-- datos, 'authenticated'. No hay un rol distinto para el gestor: el admin usa
-- el panel desde el navegador con ese mismo rol. Asi que quitarle EXECUTE a
-- 'authenticated' sobre draft_reiniciar, respaldo_borrar, procesar_fichajes y
-- companyia no anade una segunda capa: rompe el panel de administracion.
-- La comprobacion dentro de la funcion -falm.puede_gestionar()- no es una capa
-- de refuerzo, es LA capa. Ver puede_gestionar_de_verdad.sql.
--
-- Lo que si tiene sentido cerrar es lo que la aplicacion no llama desde ningun
-- sitio: si nadie la invoca desde el navegador, no hay razon para que el
-- navegador pueda invocarla.
--
--   editar_puntos             no se usa; el panel edita por editar_desglose
--   respaldo_restaurar        restaurar un respaldo encima de la temporada
--   respaldo_purgar           la rotacion de los diarios, cosa del cron
--   peticion_solo_con_mercado funcion de trigger; no se llama a mano jamas,
--                             y ademas tenia EXECUTE hasta para 'anon'
--
-- Comprobado antes de tocar: ninguna aparece en el frontend, ni por rpc()
-- directo ni por el ejecutar() generico de admin.service ni en la lista de
-- operaciones de Admin.

-- Ojo: 'from authenticated, anon' NO basta. Postgres concede EXECUTE a PUBLIC
-- por defecto al crear una funcion, y anon y authenticated heredan de ahi; sin
-- quitarselo a public, has_function_privilege sigue diciendo que si.

revoke execute on function falm.editar_puntos(integer, integer, numeric)
  from public, authenticated, anon;
revoke execute on function falm.respaldo_restaurar(text, text, boolean)
  from public, authenticated, anon;
revoke execute on function falm.respaldo_purgar(integer)
  from public, authenticated, anon;
revoke execute on function falm.peticion_solo_con_mercado()
  from public, authenticated, anon;

-- Esta si la llama el panel, asi que 'authenticated' se queda; lo que no pinta
-- nada es que pueda llamarla alguien sin haber entrado.
revoke execute on function falm.refrescar_estados_jugadores() from public, anon;
grant  execute on function falm.refrescar_estados_jugadores() to authenticated;
