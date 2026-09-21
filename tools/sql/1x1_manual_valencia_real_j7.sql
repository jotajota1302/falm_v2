-- El 1x1 a mano del Valencia 2 - 3 Real Sociedad (jornada 7 de LaLiga, J3 FALM).
--
-- 2026-09-21. futbolfantasy tenía ese partido con los minutos y los eventos de
-- los 31 jugadores, pero **todas las notas como "SC"** en sus cinco vistas, así
-- que la ingesta lo descartaba entero y la jornada no podía cerrarse
-- ([[jornada-sin-notas-no-cuenta]]). El usuario pasó la foto del 1x1 de Marca,
-- que es justo lo que faltaba: las estrellas.
--
-- Se carga por la puerta de siempre —`ingestar_jornada_cruda`, que arma el
-- desglose y aplica el baremo—, con:
--   * minutos y eventos: de `parsear_jornada_ff`, que ya los tenía bien;
--   * estrellas: de la foto ("s/c" = 0, como el SC de la web);
--   * marcador: 2-3 de `partido_lfp`, para el resultado y los goles encajados.
--
-- Aimar Blázquez entró en el 82' y la fuente lo daba SIN minutos, así que se le
-- ponen los 8 a mano; si no, se habría quedado fuera del reparto.
--
-- Comprobado antes de aplicar, en un ensayo deshecho: entran 32 filas, los 32
-- slugs casan con su jugador y su activo, y la J3 pasa a contar. Los puntos que
-- salen cuadran con el baremo: Sucic y Barrenetxea 7 (victoria + gol + 2
-- estrellas), Carlos Soler 6 (el penalti son 2), Beitia 2 (la propia resta 1),
-- Óskarsson 0 (la roja resta 3) y Dimitrievski -2 (tres goles encajados).
--
-- Después: `recalcular_clasificacion` y `procesar_jornada_auto`, que releyó los
-- otros nueve partidos (285 filas, sin cambios) y cerró la jornada. La relectura
-- NO pisa esto: los clubes sin ninguna estrella se descartan antes de armar el
-- payload, así que estas 32 filas se quedan como están.

do $carga$
declare v_lfp uuid; v_payload jsonb; v_n int;
begin
  select id into v_lfp from falm.jornada_lfp where numero = 7;

  create temp table _ff2 on commit drop as
    select * from falm.parsear_jornada_ff(2027, 7) where equipo in ('Valencia','Real Sociedad');

  create temp table _notas(slug text, estrellas int, min_manual int) on commit drop;
  insert into _notas values
   -- Valencia
   ('stole-dimitrievski',1,null),('pablo-maffeo',1,null),('pepelu',1,null),('justin-de-haas',2,null),
   ('jose-gaya',1,null),('jesus-vazquez-1',0,null),('guido-rodriguez',1,null),('harvey-elliott',1,null),
   ('aaron-ndive-mayol',2,null),('filip-ugrinic',1,null),('david-otorbi',2,null),('javi-guerra-1',1,null),
   ('arnaut-danjuma',1,null),('luis-rioja',0,null),('hugo-duro',1,null),('aimar-blazquez',2,8),
   -- Real Sociedad
   ('alex-remiro',2,null),('jon-aramburu',1,null),('luken-beitia',1,null),('jon-martin',1,null),
   ('sergio-gomez',1,null),('aihen-munoz',1,null),('job-ochieng',1,null),('ander-barrenetxea',2,null),
   ('jon-gorrotxategi',1,null),('yangel-herrera',1,null),('carlos-soler',2,null),('goncalo-guedes',1,null),
   ('luka-sucic',2,null),('arsen-zakharyan',1,null),('mikel-oyarzabal',1,null),('orri-steinn-skarsson',1,null);

  select jsonb_agg(jsonb_build_object(
      'activo_id', a.id,
      'eventos', (select coalesce(jsonb_agg(x),'[]'::jsonb) from (
          select 'GOL' x from generate_series(1, coalesce(f.goles,0))
          union all select 'GOL_DE_PENALTI' from generate_series(1, coalesce(f.goles_penalti,0))
          union all select 'GOL_EN_PROPIA' from generate_series(1, coalesce(f.gol_propia,0))
          union all select 'ROJA' from generate_series(1, coalesce(f.roja,0))
          union all select 'PENALTI_FALLADO' from generate_series(1, coalesce(f.pen_fallado,0))
          union all select 'PENALTI_PARADO' from generate_series(1, coalesce(f.pen_parado,0))
          union all select 'ASISTENCIA' from generate_series(1, coalesce(f.asistencias,0))) t),
      'minutos', coalesce(f.minutos, n.min_manual),
      'estrellas', n.estrellas::text,
      'goles_equipo', case when e.nombre = 'Valencia' then 2 else 3 end,
      'goles_rival',  case when e.nombre = 'Valencia' then 3 else 2 end))
    into v_payload
    from _notas n
    join falm.jugador_lfp jl on jl.slug_ff = n.slug
    join falm.equipo_lfp e on e.id = jl.equipo_lfp_id
    join falm.activo a on a.jugador_lfp_id = jl.id and a.tipo = 'JUGADOR'
    left join _ff2 f on f.slug = n.slug;

  v_n := falm.ingestar_jornada_cruda(v_lfp, v_payload, true);
  if v_n <> 32 then raise exception 'esperaba 32 y han entrado %', v_n; end if;
end $carga$;

-- Nota aparte, vista al hacer esto: `falm.v_clasificacion` (y la
-- `v_enfrentamiento_resultado` de la que cuelga) es de la etapa anterior y da
-- por jugada cualquier jornada que tenga alguna puntuación — incluida la J2,
-- que espera al aplazado. No la usa nadie: la pantalla lee el resumen que
-- `recalcular_clasificacion` deja en `equipo_falm`. Si algún día se vuelve a
-- ella, hay que pasarla por `falm.jornada_cuenta`.
