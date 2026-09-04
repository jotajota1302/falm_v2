-- Ver y editar de que se componen los puntos de un jugador en una jornada.
--
-- Antes, en Admin - Puntuaciones solo se veian goles, asistencias y el total, y
-- solo se podia editar el total. Dos problemas:
--
--   1. No habia forma de saber por que alguien tenia 11 puntos. (Baena, jornada
--      3: victoria +2, dos goles de medio +6, tres estrellas +3.)
--   2. Editar el total lo dejaba desacoplado del desglose: el numero decia una
--      cosa y el detalle otra, para siempre.
--
-- Ahora se editan los conceptos (goles, estrellas, minutos, penaltis...) y el
-- total lo recalcula falm.calcular_puntos, que es el mismo baremo que usa la
-- ingesta automatica. Asi el numero y su explicacion no pueden separarse.

-- ---------------------------------------------------------------------------
-- De donde sale cada punto. Devuelve una linea por concepto que sume o reste.
-- Es una segunda lectura del baremo de calcular_puntos, asi que el test
-- comprueba que la suma de las lineas coincide con el total guardado.
-- ---------------------------------------------------------------------------
create or replace function falm.desglose_puntos(p_posicion falm.posicion, d jsonb)
returns jsonb
language sql
stable
as $function$
  with valor as (
    select case p_posicion when 'PORTERO' then 5 when 'DEFENSA' then 4
                           when 'MEDIO' then 3 else 2 end gol_pos,
           coalesce((d->>'goles')::int, 0) g,
           coalesce((d->>'goles_penalti')::int, 0) gp,
           coalesce((d->>'penalti_fallado')::int, 0) pf,
           coalesce((d->>'estrellas')::numeric, 0) est,
           coalesce((d->>'imbatido')::boolean, false) imb,
           coalesce((d->>'minutos')::int, 0) mins,
           coalesce((d->>'tarjetas_rojas')::int, 0) rj,
           coalesce((d->>'goles_en_propia')::int, 0) pr,
           coalesce((d->>'penalti_parado')::int, 0) pp,
           coalesce((d->>'goles_en_contra')::int, 0) gc,
           d->>'resultado' res
  ),
  lineas as (
    select 1 orden, 'Resultado del equipo' concepto,
           coalesce(res, '—') detalle,
           (case res when 'VICTORIA' then 2 when 'EMPATE' then 1 else 0 end)::numeric pts
      from valor
    union all
    select 2, 'Goles', g || ' x ' || gol_pos, (g * gol_pos)::numeric from valor where g > 0
    union all
    select 3, 'Goles de penalti', gp || ' x 2', (gp * 2)::numeric from valor where gp > 0
    union all
    select 4, 'Penaltis fallados', pf || ' x -2', (pf * -2)::numeric from valor where pf > 0
    union all
    select 5, 'Estrellas de prensa',
           case when est < 0 then 'guion' else est || ' estrella' || case when est = 1 then '' else 's' end end,
           est from valor where est <> 0
    union all
    select 6, 'Porteria a cero',
           case p_posicion when 'PORTERO' then 'portero' else 'defensa' end,
           (case p_posicion when 'PORTERO' then 2 when 'DEFENSA' then 1 else 0 end)::numeric
      from valor
     where imb and mins > 45 and p_posicion in ('PORTERO','DEFENSA')
    union all
    select 7, 'Tarjetas rojas', rj || ' x -3', (rj * -3)::numeric from valor where rj > 0
    union all
    select 8, 'Goles en propia', pr || ' x -1', (pr * -1)::numeric from valor where pr > 0
    union all
    select 9, 'Penaltis parados', pp || ' x 2', (pp * 2)::numeric
      from valor where pp > 0 and p_posicion = 'PORTERO'
    union all
    select 10, 'Goles encajados', gc || ' x -1', (gc * -1)::numeric
      from valor where p_posicion = 'PORTERO' and gc > 1 and mins > 0
  )
  select jsonb_build_object(
    'lineas', coalesce(jsonb_agg(jsonb_build_object(
                'concepto', concepto, 'detalle', detalle, 'puntos', pts) order by orden), '[]'::jsonb),
    'total', coalesce(sum(pts), 0))
  from lineas;
$function$;

-- ---------------------------------------------------------------------------
-- Editar los conceptos de una puntuacion. El total se recalcula con el baremo.
-- Solo se tocan las claves que se manden: lo que no venga en p_cambios se queda
-- como estaba, para poder corregir una estrella sin reescribir el resto.
-- ---------------------------------------------------------------------------
create or replace function falm.editar_desglose(p_ext integer, p_lfp integer, p_cambios jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'falm'
as $function$
declare
  v_jlfp uuid; v_activo uuid; v_pos falm.posicion;
  v_desglose jsonb; v_puntos numeric; v_sync int := 0;
begin
  if not falm.puede_gestionar() then
    raise exception 'Solo un administrador puede editar puntuaciones';
  end if;

  select jl.id into v_jlfp from falm.jornada_lfp jl
    join falm.temporada t on t.id = jl.temporada_id and t.activa
   where jl.numero = p_lfp;
  if v_jlfp is null then raise exception 'No existe la jornada %', p_lfp; end if;

  select a.id, j.posicion into v_activo, v_pos
    from falm.activo a join falm.jugador_lfp j on j.id = a.jugador_lfp_id
   where j.ext_id = p_ext and a.tipo = 'JUGADOR' limit 1;
  if v_activo is null then raise exception 'No hay ningun jugador con ese identificador'; end if;

  select coalesce(desglose, '{}'::jsonb) into v_desglose
    from falm.puntuacion where activo_id = v_activo and jornada_lfp_id = v_jlfp;

  v_desglose := coalesce(v_desglose, '{}'::jsonb) || coalesce(p_cambios, '{}'::jsonb);
  v_puntos := falm.calcular_puntos(v_pos, v_desglose);

  insert into falm.puntuacion(activo_id, jornada_lfp_id, puntos, desglose, tipo_insercion)
  values (v_activo, v_jlfp, v_puntos, v_desglose, 'MANUAL')
  on conflict (activo_id, jornada_lfp_id)
  do update set puntos = excluded.puntos, desglose = excluded.desglose,
                tipo_insercion = 'MANUAL', updated_at = now();

  -- Si es portero, rehacer las porterias virtuales de su club, que copian sus
  -- puntos. Sin forzar: una porteria corregida a mano se respeta.
  if v_pos = 'PORTERO' then
    v_sync := falm.sincronizar_porterias(v_jlfp, false);
  end if;

  return jsonb_build_object('ok', true, 'puntos', v_puntos, 'desglose', v_desglose,
                            'porterias_sincronizadas', v_sync,
                            'explicacion', falm.desglose_puntos(v_pos, v_desglose));
end $function$;

-- ---------------------------------------------------------------------------
-- La lista de la jornada, ahora con el desglose entero y su explicacion.
-- ---------------------------------------------------------------------------
create or replace function falm.puntuaciones_jornada(p_lfp integer)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'falm'
as $function$
  with jugadores as (
    select jsonb_build_object(
      'jugador', jsonb_build_object(
        'id', jl.ext_id,
        'nombre', trim(jl.nombre || ' ' || coalesce(jl.apellido,'')),
        'equipo', el.nombre, 'escudo', el.escudo, 'foto', jl.foto,
        'posicion', jl.posicion::text),
      'esPorteria', false,
      'desdePortero', null::text,
      'puntosTotales', pn.puntos,
      'tipo', pn.tipo_insercion::text,
      'goles', coalesce((pn.desglose->>'goles')::int, 0),
      'golesPenalti', coalesce((pn.desglose->>'goles_penalti')::int, 0),
      'asistencias', coalesce((pn.desglose->>'asistencias')::int, 0),
      'estrellas', coalesce((pn.desglose->>'estrellas')::numeric, 0),
      'minutosJugados', coalesce((pn.desglose->>'minutos')::int, 0),
      'imbatido', coalesce((pn.desglose->>'imbatido')::boolean, false),
      'resultado', coalesce(pn.desglose->>'resultado', ''),
      'penaltiFallado', coalesce((pn.desglose->>'penalti_fallado')::int, 0),
      'penaltiParado', coalesce((pn.desglose->>'penalti_parado')::int, 0),
      'golesEnPropia', coalesce((pn.desglose->>'goles_en_propia')::int, 0),
      'golesEnContra', coalesce((pn.desglose->>'goles_en_contra')::int, 0),
      'tarjetasAmarillas', coalesce((pn.desglose->>'tarjetas_amarillas')::int, 0),
      'tarjetasRojas', coalesce((pn.desglose->>'tarjetas_rojas')::int, 0),
      'explicacion', falm.desglose_puntos(jl.posicion, pn.desglose)
    ) fila, pn.puntos
    from falm.puntuacion pn
    join falm.jornada_lfp jlf on jlf.id = pn.jornada_lfp_id
    join falm.temporada t on t.id = jlf.temporada_id and t.activa
    join falm.activo a on a.id = pn.activo_id and a.tipo = 'JUGADOR'
    join falm.jugador_lfp jl on jl.id = a.jugador_lfp_id
    left join falm.equipo_lfp el on el.id = jl.equipo_lfp_id
    where jlf.numero = p_lfp
  ),
  porterias as (
    select jsonb_build_object(
      'jugador', jsonb_build_object(
        'id', null,
        'nombre', 'Porteria ' || el.nombre,
        'equipo', el.nombre, 'escudo', el.escudo, 'foto', null,
        'posicion', 'PORTERO'),
      'esPorteria', true,
      'desdePortero', (
        select trim(j2.nombre || ' ' || coalesce(j2.apellido,''))
        from falm.puntuacion p2
        join falm.activo a2 on a2.id = p2.activo_id and a2.tipo = 'JUGADOR'
        join falm.jugador_lfp j2 on j2.id = a2.jugador_lfp_id
        where p2.jornada_lfp_id = pn.jornada_lfp_id
          and j2.posicion = 'PORTERO' and j2.equipo_lfp_id = el.id
        order by coalesce((p2.desglose->>'minutos')::int, 0) desc
        limit 1),
      'puntosTotales', pn.puntos,
      'tipo', pn.tipo_insercion::text,
      'goles', 0, 'golesPenalti', 0, 'asistencias', 0,
      'estrellas', coalesce((pn.desglose->>'estrellas')::numeric, 0),
      'minutosJugados', coalesce((pn.desglose->>'minutos')::int, 0),
      'imbatido', coalesce((pn.desglose->>'imbatido')::boolean, false),
      'resultado', coalesce(pn.desglose->>'resultado', ''),
      'penaltiFallado', 0,
      'penaltiParado', coalesce((pn.desglose->>'penalti_parado')::int, 0),
      'golesEnPropia', 0,
      'golesEnContra', coalesce((pn.desglose->>'goles_en_contra')::int, 0),
      'tarjetasAmarillas', 0, 'tarjetasRojas', 0,
      'explicacion', falm.desglose_puntos('PORTERO'::falm.posicion, pn.desglose)
    ) fila, pn.puntos
    from falm.puntuacion pn
    join falm.jornada_lfp jlf on jlf.id = pn.jornada_lfp_id
    join falm.temporada t on t.id = jlf.temporada_id and t.activa
    join falm.activo a on a.id = pn.activo_id and a.tipo = 'DEFENSA'
    join falm.equipo_lfp el on el.id = a.equipo_lfp_id
    where jlf.numero = p_lfp
  )
  select coalesce(jsonb_agg(fila order by puntos desc), '[]'::jsonb)
  from (select * from jugadores union all select * from porterias) todo;
$function$;

grant execute on function falm.editar_desglose(integer, integer, jsonb) to authenticated;
revoke execute on function falm.editar_desglose(integer, integer, jsonb) from public, anon;
revoke execute on function falm.desglose_puntos(falm.posicion, jsonb) from public, anon;

-- ---------------------------------------------------------------------------
-- Porterias virtuales
-- ---------------------------------------------------------------------------
-- Una porteria (activo tipo DEFENSA) no tiene estadisticas propias: copia las
-- del portero de su club que mas minutos jugo esa jornada, via
-- falm.sincronizar_porterias. Por eso:
--
--   * editar_desglose, cuando el editado es PORTERO, vuelve a sincronizar. Antes
--     no lo hacia y el club se quedaba puntuando distinto que su portero.
--     Sin forzar: una porteria corregida a mano (MANUAL) se respeta.
--   * puntuaciones_jornada devuelve tambien las porterias, marcadas con
--     esPorteria y con desdePortero (de quien copian), pero no se editan desde
--     ahi: se corrige al portero y ellas se actualizan.
--
-- Y la porteria a cero solo suma a porteros (+2) y defensas (+1), asi que la
-- casilla no se enseña a medios ni delanteros: verla ahi hacia pensar que
-- puntuaba.
