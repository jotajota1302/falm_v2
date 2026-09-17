-- Dos cosas del 2026-09-17, la noche antes de que cerrara la J3.
--
-- 1. LA DOBLE PASA DE LA J3 A LA J4. Se movio a la 3 el dia 15 (ver
--    mover_doble_de_j2_a_j3.sql) y se decide que la doble tiene que caer
--    DESPUES del parón: la J3 cerraba al dia siguiente y no daba tiempo a
--    fichar ni a preparar dos onces. La J4 cierra el 9 de octubre.
--
--    Se mueve la misma ronda de cinco cruces. Comprobado que ninguno coincide
--    con los de la J4, asi que nadie repite rival: en la J4 cada equipo juega
--    dos partidos distintos. Se borran los dos onces ya mandados a esos cruces
--    (CHANATIBORG y TEAM GOURMET), que tendran que mandarlos para la J4.
--
-- 2. UNA JORNADA CON UN PARTIDO APLAZADO NO SE CIERRA. El Levante - Athletic de
--    la jornada 6 de LaLiga -nuestra J2- esta aplazado, y se decide esperar a
--    que se juegue. Eso obliga a dos cambios en procesar_jornada_auto:
--
--      * fuera la salida de emergencia de los 3 dias cuando falta un partido
--        POR JUGAR. La de "faltan puntuaciones de la prensa" se queda: ahi lo
--        que falla es el scrape, no el partido.
--      * se procesa la primera jornada LISTA, no la pendiente mas antigua.
--        Antes, la J2 esperando habria bloqueado el cierre de la J3 y de todas
--        las siguientes.
--
--    Mientras espera, esa jornada no cuenta en la clasificacion
--    (falm.jornada_cuenta ya lo hacia asi), asi que la tabla no se mueve hasta
--    que se juegue. Los jugadores de un partido aplazado no cuentan como "no
--    jugo" y no abren hueco al suplente: decidido dejarlo asi.

begin;

delete from falm.alineacion
 where enfrentamiento_id in ('4cf6c044-63b7-4f56-876d-898dab5d7f51', '4bdce7d6-242f-4c5a-9ac2-82708edb6c66',
                             '2dd9875e-d482-4563-a025-8bdf6b898271', 'f6360ee0-64d3-4361-9dc9-dcc4e1227698',
                             '70d19968-24c7-4509-86b7-f5d0d9927273');

update falm.enfrentamiento
   set jornada_falm_id = (select jf.id from falm.jornada_falm jf
                            join falm.competicion c on c.id = jf.competicion_id and c.tipo = 'LIGA'
                            join falm.temporada t on t.id = c.temporada_id and t.activa
                           where jf.numero = 4)
 where id in ('4cf6c044-63b7-4f56-876d-898dab5d7f51', '4bdce7d6-242f-4c5a-9ac2-82708edb6c66',
              '2dd9875e-d482-4563-a025-8bdf6b898271', 'f6360ee0-64d3-4361-9dc9-dcc4e1227698',
              '70d19968-24c7-4509-86b7-f5d0d9927273');

commit;

-- El cuerpo nuevo de falm.procesar_jornada_auto() esta aplicado en la base
-- (migracion jornada_espera_al_aplazado_sin_bloquear_las_siguientes). Lo que
-- cambia respecto a cerrar_jornada_solo_con_todo.sql:
--
--   * el refresco del calendario va primero, que un aplazado cambia de fecha;
--   * la seleccion exige `not exists (partido con estado <> 'FINISHED')` y coge
--     la primera jornada que cumple, no la mas antigua pendiente;
--   * desaparece la rama "faltan resultados" con su escape de 3 dias, y en su
--     lugar se devuelve 'esperando partidos por jugar' con el detalle de que
--     jornada y cuantos partidos faltan, para verlo en Admin.
