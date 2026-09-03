-- Cierre de funciones SECURITY DEFINER que escriben y estaban abiertas.
--
-- Toda función de Postgres nace con EXECUTE para PUBLIC, así que no basta con
-- quitárselo a 'authenticated': hay que revocar a PUBLIC.
--
-- Ninguna de estas se llama desde el frontend, y las que se usan por dentro
-- (montar_temporada_prueba, heredar_alineaciones, los cron, draft_crear y
-- draft_reordenar) siguen funcionando porque se ejecutan en contexto
-- SECURITY DEFINER con owner postgres.
--
--   generar_liga_falm           genera jornadas + calendario de una tacada: era un
--                               camino paralelo que se saltaba las protecciones de
--                               generar_jornadas_liga y generar_calendario_liga.
--   importar_puntuaciones_pro   escribe puntuaciones, que alimentan la clasificación.
--   generar_alineacion_defecto  BORRA la alineación del equipo indicado: un mánager
--                               podía cargarse la alineación de un rival.
--   draft_generar_orden         rehacía el orden de un draft saltándose las
--                               validaciones de draft_reordenar.
--   draft_validar_orden         solo lee, pero tampoco tiene por qué estar expuesta.

revoke execute on function falm.generar_liga_falm(uuid, integer, integer, integer[]) from public, authenticated, anon;
revoke execute on function falm.importar_puntuaciones_pro(integer) from public, authenticated, anon;
revoke execute on function falm.generar_alineacion_defecto(uuid, uuid) from public, authenticated, anon;
revoke execute on function falm.draft_generar_orden(uuid, uuid[], integer) from public;
revoke execute on function falm.draft_validar_orden(uuid, uuid[]) from public;
