-- Tope de jugadores por club y fin del juego con dinero (2026-09-03).
--
-- Reglas de esta temporada:
--   * La plantilla es de 23 jugadores. El presupuesto deja de controlarse.
--   * Máximo 2 jugadores del Real Madrid, Barcelona o Atlético.
--   * Máximo 3 de cualquier otro club.
--   * La portería de un club cuenta como uno de los suyos.
--
-- Se modela como un límite por club (columna en equipo_lfp) y no como una lista
-- de excepciones en el código, para poder ajustarlo con un update.
--
-- Las funciones draft_pick, procesar_fichajes y draft_consolidar se reescribieron
-- para aplicar esto; están en las migraciones `cupo_club_y_sin_presupuesto` y
-- `procesar_fichajes_sin_presupuesto`. Resumen de lo que cambió en ellas:
--   draft_pick          rechaza el pick si el equipo ya tiene el cupo de ese club.
--   procesar_fichajes   ya no mira ni descuenta presupuesto; el límite es tener
--                       menos de 23 jugadores y hueco en el cupo del club.
--   draft_consolidar    ya no descuenta presupuesto al pasar los picks a plantilla.

alter table falm.equipo_lfp
  add column if not exists limite_plantilla int not null default 3;

update falm.equipo_lfp set limite_plantilla = 2 where tla in ('RMA', 'FCB', 'ATL');

-- Club al que pertenece un activo: el del jugador, o el propio club si es una
-- portería (los activos tipo DEFENSA cuelgan directamente de equipo_lfp).
create or replace function falm.club_de_activo(p_activo uuid)
returns uuid
language sql
stable
security definer
set search_path to 'public', 'falm'
as $function$
  select coalesce(a.equipo_lfp_id, j.equipo_lfp_id)
  from falm.activo a
  left join falm.jugador_lfp j on j.id = a.jugador_lfp_id
  where a.id = p_activo;
$function$;

revoke execute on function falm.club_de_activo(uuid) from public;
grant execute on function falm.club_de_activo(uuid) to authenticated;

-- El catálogo expone club_id y limite_club para que el tablero avise del tope
-- antes de que el servidor rechace el pick.
-- Las columnas nuevas van al final: create or replace view no permite meterlas
-- en medio (error 42P16).
create or replace view falm.v_activo_libre as
 SELECT a.id AS activo_id,
    a.tipo,
        CASE
            WHEN a.tipo = 'DEFENSA'::falm.activo_tipo THEN 'PORTERO'::text
            ELSE jl.posicion::text
        END AS posicion,
        CASE
            WHEN a.tipo = 'DEFENSA'::falm.activo_tipo THEN 'Portería '::text || COALESCE(el.nombre, ''::text)
            ELSE TRIM(BOTH FROM (COALESCE(jl.nombre, ''::text) || ' '::text) || COALESCE(jl.apellido, ''::text))
        END AS nombre,
    COALESCE(el.nombre, elj.nombre) AS club,
    COALESCE(el.escudo, elj.escudo) AS escudo,
        CASE
            WHEN a.tipo = 'DEFENSA'::falm.activo_tipo THEN NULL::text
            ELSE jl.foto
        END AS foto,
    jl.ext_id,
    a.precio_mercado,
    t.id AS temporada_id,
    COALESCE(a.equipo_lfp_id, jl.equipo_lfp_id) AS club_id,
    COALESCE(el.limite_plantilla, elj.limite_plantilla) AS limite_club
   FROM falm.activo a
     CROSS JOIN falm.temporada t
     LEFT JOIN falm.jugador_lfp jl ON jl.id = a.jugador_lfp_id
     LEFT JOIN falm.equipo_lfp el ON el.id = a.equipo_lfp_id
     LEFT JOIN falm.equipo_lfp elj ON elj.id = jl.equipo_lfp_id
  WHERE t.activa
    AND NOT (a.tipo = 'JUGADOR'::falm.activo_tipo AND jl.posicion = 'PORTERO'::falm.posicion)
    AND (a.tipo = 'DEFENSA'::falm.activo_tipo OR jl.primer_equipo)
    AND NOT (EXISTS ( SELECT 1
           FROM falm.plantilla p
          WHERE p.activo_id = a.id AND p.temporada_id = t.id AND p.fecha_baja IS NULL));
