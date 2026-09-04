-- Las asistencias no se estaban guardando.
--
-- Cómo estaba: parsear_jornada_ff sí las lee del HTML de futbolfantasy
-- (data-tooltip="Asistencia") y las devuelve en su columna `asistencias`, pero
-- ahí se acababa el viaje:
--
--   * ingestar_jornada_ff montaba la lista de eventos con GOL, GOL_DE_PENALTI,
--     GOL_EN_PROPIA, ROJA, PENALTI_FALLADO y PENALTI_PARADO, y no usaba esa
--     columna;
--   * construir_desglose, que es quien arma el jsonb que se guarda, no tenía la
--     clave 'asistencias'.
--
-- Resultado: de las 1002 puntuaciones cargadas, ninguna tenía siquiera el campo,
-- y la ficha del jugador, Estadísticas y Mi plantilla —que sí lo leen— enseñaban
-- un 0 fijo a todo el mundo.
--
-- Cómo queda: se guardan como dato informativo. calcular_puntos NO se toca: en
-- FALM una asistencia no suma, así que ninguna puntuación ni la clasificación
-- cambian. Aplicado el 2026-09-04 (migración guardar_asistencias_en_el_desglose).

-- ---------------------------------------------------------------------------
-- 1. El desglose recoge las asistencias que lleguen en los eventos.
--    (definición completa en la migración; aquí, la línea que se añadió)
-- ---------------------------------------------------------------------------
--   'asistencias', (select count(*) from unnest(p_eventos) e where e = 'ASISTENCIA'),

-- ---------------------------------------------------------------------------
-- 2. La ingesta pasa las que ya venían del parser.
-- ---------------------------------------------------------------------------
--   union all select 'ASISTENCIA' from generate_series(1, coalesce(m.asistencias, 0))

-- ---------------------------------------------------------------------------
-- 3. Las jornadas ya cargadas: se rellena solo el campo, sin reingestar.
--
-- Reingestar habría recalculado los puntos de tres jornadas ya buenas para
-- añadir un dato que no puntúa. En vez de eso se vuelve a leer el HTML y se
-- escribe únicamente desglose->asistencias, casando igual que la ingesta
-- (por slug de futbolfantasy y, si no, por nombre dentro del club).
-- ---------------------------------------------------------------------------
do $$
declare v_j int; v_n int; v_anio int;
begin
  select coalesce(anio_scrape, anio_inicio + 1) into v_anio
    from falm.temporada where activa;

  for v_j in select numero from falm.jornada_lfp jl
              join falm.temporada t on t.id = jl.temporada_id and t.activa
             where exists (select 1 from falm.puntuacion p where p.jornada_lfp_id = jl.id)
             order by numero
  loop
    with p as (select * from falm.parsear_jornada_ff(v_anio, v_j) where jugo),
    pf as (select p.*, falm._equipo_lfp_por_nombre(p.equipo) eq from p),
    cand as (
      select pf.*, a.id activo_id,
        case when pf.slug is not null and jl.slug_ff = pf.slug then 0 else 1 end prio,
        length(coalesce(jl.nombre_busqueda, jl.nombre)) len
      from pf
      join falm.jugador_lfp jl
        on (pf.slug is not null and jl.slug_ff = pf.slug)
        or (jl.equipo_lfp_id = pf.eq and falm._casa_nombre(jl.nombre, jl.nombre_busqueda, pf.jugador))
      join falm.activo a on a.jugador_lfp_id = jl.id and a.tipo = 'JUGADOR'
    ),
    m as (select distinct on (equipo, jugador) * from cand order by equipo, jugador, prio, len)
    update falm.puntuacion pn
       set desglose = jsonb_set(pn.desglose, '{asistencias}', to_jsonb(coalesce(m.asistencias, 0)))
      from m, falm.jornada_lfp j, falm.temporada t
     where t.activa and j.temporada_id = t.id and j.numero = v_j
       and pn.jornada_lfp_id = j.id and pn.activo_id = m.activo_id;
    get diagnostics v_n = row_count;
    raise notice 'jornada %: % filas', v_j, v_n;
  end loop;

  -- las que no casaron y las porterías: el campo existe y vale 0
  update falm.puntuacion set desglose = jsonb_set(desglose, '{asistencias}', '0'::jsonb)
   where not (desglose ? 'asistencias');
end $$;

-- ---------------------------------------------------------------------------
-- Comprobación. Tras aplicarlo: J1 17, J2 14 y J3 26 asistencias, y el campo
-- presente en las 1002 filas.
--
--   select jl.numero, count(*) filas,
--          count(*) filter (where p.desglose ? 'asistencias') con_campo,
--          sum(coalesce((p.desglose->>'asistencias')::int,0)) asistencias
--     from falm.puntuacion p
--     join falm.jornada_lfp jl on jl.id = p.jornada_lfp_id
--    group by 1 order by 1;
-- ---------------------------------------------------------------------------
