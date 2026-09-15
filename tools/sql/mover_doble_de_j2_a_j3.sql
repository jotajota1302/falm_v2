-- La jornada doble pasa de la 2 a la 3. Decidido el 2026-09-15, el dia que
-- cerraba la 2.
--
-- Por que: la jornada 2 va con la 6 de LaLiga, y el Real Sociedad - Celta de
-- esa jornada se jugo el 03/09, antes del draft. Sus jugadores no se pueden
-- alinear, y ademas tres envios de once se habian perdido por llevarlos. Siendo
-- doble, el problema pesaba en dos partidos por equipo.
--
-- Como: los 10 cruces de la 2 se separan de una sola forma en dos rondas en las
-- que cada equipo juega una vez. La ronda B pasa a la jornada 3; ninguno de sus
-- cruces coincide con los de la 3, asi que nadie repite rival en la misma
-- jornada.
--
--   Se queda en la 2 (ronda A)       Pasa a la 3 (ronda B)
--   BABUSIANOS - TOBAGO              BABUSIANOS - RIVER XAVALEO
--   TUCANKAMON - CHANATIBORG         CHANATIBORG - TOBAGO
--   PUSSYFISH - KALIKENOS            GOLDEN BOYS - TEAM GOURMET
--   GOLDEN BOYS - MANCHISTER         PUSSYFISH - MANCHISTER
--   TEAM GOURMET - RIVER XAVALEO     TUCANKAMON - KALIKENOS
--
-- Los onces ya mandados a la ronda B se borran (decision del usuario): se
-- hicieron para la jornada 6 de LaLiga y hay que rehacerlos para la 7. Eran 4:
-- CHANATIBORG, KALIKENOS, MANCHISTER y RIVER XAVALEO. Sus onces de la ronda A
-- siguen en la jornada 2.
--
-- No hace falta tocar nada mas: la pantalla deduce la doble de los propios
-- cruces (un equipo que sale dos veces), el premio doble lo decide
-- calcular_premios_jornada por el mismo criterio y la herencia va por partido.
-- Los UUID son los de esta temporada: no es un script reutilizable.

begin;

delete from falm.alineacion
 where enfrentamiento_id in ('4cf6c044-63b7-4f56-876d-898dab5d7f51', '4bdce7d6-242f-4c5a-9ac2-82708edb6c66',
                             '2dd9875e-d482-4563-a025-8bdf6b898271', 'f6360ee0-64d3-4361-9dc9-dcc4e1227698',
                             '70d19968-24c7-4509-86b7-f5d0d9927273');

update falm.enfrentamiento
   set jornada_falm_id = (select jf.id from falm.jornada_falm jf
                            join falm.competicion c on c.id = jf.competicion_id and c.tipo = 'LIGA'
                            join falm.temporada t on t.id = c.temporada_id and t.activa
                           where jf.numero = 3)
 where id in ('4cf6c044-63b7-4f56-876d-898dab5d7f51', '4bdce7d6-242f-4c5a-9ac2-82708edb6c66',
              '2dd9875e-d482-4563-a025-8bdf6b898271', 'f6360ee0-64d3-4361-9dc9-dcc4e1227698',
              '70d19968-24c7-4509-86b7-f5d0d9927273');

commit;
