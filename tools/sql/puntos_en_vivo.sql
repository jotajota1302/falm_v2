-- Los puntos, segun van acabando los partidos, y no tres dias despues.
--
-- Como estaba: falm.procesar_jornada_auto espera a que TERMINE la jornada
-- entera (ultimo partido + 3 h) para leer futbolfantasy. La jornada 1 va del
-- viernes 21:00 al lunes 21:00, asi que la app se pasaba el fin de semana
-- entero a cero aunque el sabado ya hubiera medio once puntuado.
--
-- Como queda: una tarea nueva cada cuarto de hora que, mientras la jornada esta
-- en juego, mete los puntos de los partidos que YA han acabado. La clasificacion y
-- los premios NO se tocan hasta el cierre: durante el fin de semana se ve el
-- marcador de cada enfrentamiento, no la tabla movida a medias.
--
-- Dos frenos, porque la tarea se despierta muchas veces y casi ninguna tiene
-- trabajo. Una pasada en vacio son 0,13 s y cero red; lo que hay que cuidar son
-- las dos llamadas de fuera:
--
--   1. A football-data se le pregunta SOLO por un partido que ya deberia haber
--      acabado -empezo hace mas de 2 h- y del que todavia no tenemos resultado.
--      Preguntar mientras se juega no servia de nada: el marcador provisional no
--      se usa, porque a un jugador no se le puntua hasta que la prensa publica
--      su nota. Medido sobre el calendario real de la jornada 5, eso baja de
--      130 llamadas por jornada a 10, una por partido.
--   2. A futbolfantasy se le lee SOLO si hay un partido acabado hace mas de
--      media hora del que no hay ni una puntuacion. La prensa tarda un rato en
--      publicarse, asi que preguntar nada mas acabar el partido era descargarse
--      5 MB para nada; la tarea lo reintenta sola hasta que aparece y en cuanto
--      esta deja de leer.
--
-- La marca de "esta jornada ya esta cerrada" pasa a ser una columna. Antes era
-- "no tiene ninguna puntuacion", y eso deja de servir en cuanto se puntua en
-- vivo: procesar_jornada_auto habria dado la jornada por hecha en el primer
-- partido y no habria recalculado nunca la clasificacion.

alter table falm.jornada_lfp add column if not exists procesada_en timestamptz;

comment on column falm.jornada_lfp.procesada_en is
  'Cuando se cerro la jornada: puntuaciones definitivas, clasificacion y premios '
  'recalculados. Mientras es null la jornada puede seguir puntuandose en vivo.';

-- Las que ya estaban puntuadas antes de existir la columna (LaLiga 1 a 4, que
-- se cargaron a mano por estadistica) quedan marcadas para que el cron no las
-- vuelva a mirar.
update falm.jornada_lfp jl
   set procesada_en = now()
 where procesada_en is null
   and exists (select 1 from falm.puntuacion p where p.jornada_lfp_id = jl.id);

-- ---------------------------------------------------------------------------
-- De paso, un fallo que picaba justo al releer una jornada: la guardia de
-- MANUAL estaba del reves.
--
--     if p_sobreescribir or v_existente = 'MANUAL' then update
--
-- Es decir: una puntuacion corregida a mano era la unica que se machacaba
-- siempre, incluso sin pedir sobreescribir. Tenia que ser al reves, que es lo
-- que ya hacia falm.sincronizar_porterias con las porterias: lo que se ha
-- tocado a mano manda sobre lo que dice la prensa.
--
-- Importa ahora porque al puntuar en vivo se lee la misma jornada muchas veces.
-- ---------------------------------------------------------------------------
create or replace function falm.upsert_puntuacion(p_activo uuid, p_jornada_lfp uuid,
  p_puntos numeric, p_desglose jsonb, p_tipo falm.insercion, p_sobreescribir boolean default false)
returns text
language plpgsql
as $function$
declare v_existente falm.insercion;
begin
  select tipo_insercion into v_existente
    from falm.puntuacion
   where activo_id = p_activo and jornada_lfp_id = p_jornada_lfp;

  if not found then
    insert into falm.puntuacion (activo_id, jornada_lfp_id, puntos, desglose, tipo_insercion)
    values (p_activo, p_jornada_lfp, p_puntos, p_desglose, p_tipo);
    return 'INSERTADO';
  end if;

  -- Lo corregido a mano no lo pisa la prensa. Para eso esta el boton de forzar
  -- de Admin - Puntuaciones, que escribe MANUAL directamente.
  if p_sobreescribir and v_existente <> 'MANUAL' then
    update falm.puntuacion
       set puntos = p_puntos, desglose = p_desglose, tipo_insercion = p_tipo, updated_at = now()
     where activo_id = p_activo and jornada_lfp_id = p_jornada_lfp;
    return 'ACTUALIZADO';
  end if;

  return 'OMITIDO';
end $function$;

-- ---------------------------------------------------------------------------
-- La tarea en vivo.
-- ---------------------------------------------------------------------------
create or replace function falm.puntuar_en_vivo()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'falm'
as $function$
declare
  v_temp uuid; v_anio int; v_ref jsonb; v_ing jsonb;
  v_en_juego int; v_por_leer int; v_hechas jsonb := '[]'::jsonb; r record;
begin
  if not falm.puede_gestionar() then
    raise exception 'Solo un administrador puede puntuar en vivo';
  end if;

  select id, coalesce(anio_scrape, anio_inicio + 1) into v_temp, v_anio
    from falm.temporada where activa order by created_at desc limit 1;
  if v_temp is null then
    return jsonb_build_object('motivo', 'no hay temporada activa');
  end if;

  -- Puede haber mas de una jornada abierta a la vez: la 6 de esta temporada
  -- tiene un partido adelantado al 3 de septiembre y no cierra hasta el 17, asi
  -- que convive con la 5 entera. Se miran todas, de la mas vieja a la mas nueva.
  -- drop antes de crear, como en ingestar_jornada_ff: si en la misma sesion se
  -- llama dos veces, la temporal de la primera sigue viva hasta el commit.
  drop table if exists _vivo;
  create temp table _vivo on commit drop as
    select jl.id, jl.numero
      from falm.jornada_lfp jl
      join falm.mapeo_jornada mj on mj.jornada_lfp_id = jl.id
      join falm.jornada_falm jf on jf.id = mj.jornada_falm_id
      join falm.competicion c on c.id = jf.competicion_id and c.tipo = 'LIGA'
     where jl.temporada_id = v_temp
       and jl.procesada_en is null
       and jl.fecha_inicio is not null
       and jl.fecha_inicio <= now()
     order by jl.numero;

  if not exists (select 1 from _vivo) then
    return jsonb_build_object('motivo', 'no hay ninguna jornada en juego');
  end if;

  -- 1. Marcadores, UNA vez por pasada: la llamada trae la temporada entera, asi
  --    que no tiene sentido repetirla por jornada.
  --
  --    La condicion es "ya deberia haber acabado y no tengo su resultado", no
  --    "se esta jugando": asi se pregunta una vez por partido y se deja de
  --    preguntar en cuanto llega el marcador, sin poder saltarselo. Las 12 h son
  --    el freno para un aplazado, que si no tendria a la tarea preguntando por
  --    el toda la semana; de ese se encarga el cierre.
  select count(*) into v_en_juego
    from falm.partido_lfp pl
    join _vivo v on v.id = pl.jornada_lfp_id
   where pl.goles_local is null
     and pl.fecha <= now() - interval '2 hours'
     and pl.fecha > now() - interval '12 hours';

  if v_en_juego > 0 then
    begin
      v_ref := falm.refrescar_calendario_fd();
    exception when others then
      v_ref := jsonb_build_object('error', left(SQLERRM, 120));
    end;
  end if;

  -- 2. Por cada jornada abierta, los partidos acabados de los que no hay ni una
  --    puntuacion. La media hora de margen es porque la prensa no se publica
  --    con el pitido final: sin ella, la primera lectura de cada partido se
  --    bajaba 5 MB para encontrar la tabla vacia.
  for r in select id, numero from _vivo order by numero loop
    select count(*) into v_por_leer
      from falm.partido_lfp pl
     where pl.jornada_lfp_id = r.id
       and pl.goles_local is not null
       and pl.fecha <= now() - interval '2 hours 30 minutes'
       and not exists (
         select 1 from falm.puntuacion pu
         join falm.activo a on a.id = pu.activo_id and a.tipo = 'JUGADOR'
         join falm.jugador_lfp j2 on j2.id = a.jugador_lfp_id
         where pu.jornada_lfp_id = r.id
           and j2.equipo_lfp_id in (pl.local_id, pl.visitante_id));

    if v_por_leer = 0 then
      continue;
    end if;

    -- Sin sobreescribir: lo ya leido se queda como esta y solo entran los que
    -- faltan. La lectura buena, la que puede corregir, es la del cierre.
    begin
      v_ing := falm.ingestar_jornada_ff(v_anio, r.numero, v_temp, false);
      v_hechas := v_hechas || jsonb_build_object('jornada', r.numero,
        'partidos_por_leer', v_por_leer, 'casados', v_ing->'casados',
        'ingestados', v_ing->'ingestados');
    exception when others then
      v_hechas := v_hechas || jsonb_build_object('jornada', r.numero,
        'partidos_por_leer', v_por_leer, 'error', left(SQLERRM, 160));
    end;
  end loop;

  return jsonb_build_object(
    'abiertas', (select jsonb_agg(numero order by numero) from _vivo),
    'por_marcador', v_en_juego, 'leidas', v_hechas, 'refresco', v_ref);
end $function$;

grant execute on function falm.puntuar_en_vivo() to authenticated;
revoke execute on function falm.puntuar_en_vivo() from public, anon;

-- ---------------------------------------------------------------------------
-- El cierre de la jornada, con la marca nueva.
--
-- Dos cambios respecto a la version anterior:
--   - "pendiente" ya no es "no tiene puntuaciones" sino "no esta marcada como
--     procesada", que es lo unico compatible con puntuar en vivo.
--   - la lectura de cierre SI sobreescribe: es la definitiva, y para entonces
--     la prensa ya no cambia. Lo corregido a mano se respeta igual, que es lo
--     que arregla upsert_puntuacion aqui arriba.
-- ---------------------------------------------------------------------------
create or replace function falm.procesar_jornada_auto()
returns jsonb
language plpgsql
as $function$
declare
  v_temp uuid; v_anio int; v_jornada int; v_fin timestamptz; v_jl uuid;
  v_total int; v_con_marcador int; v_refresco jsonb; v_res jsonb;
begin
  select id, coalesce(anio_scrape, anio_inicio + 1) into v_temp, v_anio
    from falm.temporada where activa order by created_at desc limit 1;
  if v_temp is null or v_anio is null then
    return jsonb_build_object('procesada', null, 'motivo', 'sin temporada/año');
  end if;

  select jl.id, jl.numero, jl.fecha_fin into v_jl, v_jornada, v_fin
  from falm.jornada_lfp jl
  join falm.mapeo_jornada mj on mj.jornada_lfp_id = jl.id
  join falm.jornada_falm jf on jf.id = mj.jornada_falm_id
  join falm.competicion c on c.id = jf.competicion_id and c.tipo = 'LIGA'
  where jl.temporada_id = v_temp
    and jl.fecha_fin is not null
    and jl.fecha_fin + interval '3 hours' <= now()
    and jl.procesada_en is null
  order by jl.numero asc
  limit 1;

  if v_jornada is null then
    return jsonb_build_object('procesada', null, 'motivo', 'nada pendiente');
  end if;

  begin
    v_refresco := falm.refrescar_calendario_fd();
  exception when others then
    v_refresco := jsonb_build_object('error', left(SQLERRM, 120));
  end;

  select count(*), count(*) filter (where goles_local is not null)
    into v_total, v_con_marcador
  from falm.partido_lfp where numero_jornada = v_jornada;

  if v_con_marcador < v_total and v_fin + interval '3 days' > now() then
    return jsonb_build_object('procesada', null, 'motivo', 'faltan resultados',
      'jornada', v_jornada, 'con_marcador', v_con_marcador, 'partidos', v_total,
      'refresco', v_refresco);
  end if;

  v_res := falm.procesar_jornada_completa(v_anio, v_jornada, v_temp, true);
  update falm.jornada_lfp set procesada_en = now() where id = v_jl;

  return v_res || jsonb_build_object('refresco', v_refresco);
end $function$;

-- ---------------------------------------------------------------------------
-- El marcador de los cinco enfrentamientos de una jornada, en vivo.
--
-- falm.enfrentamiento solo se escribe al cerrar la jornada, asi que la pantalla
-- de Partidos se pasaba el fin de semana en 0-0. Esto devuelve, por equipo, lo
-- que lleva puntuado su once ahora mismo y cuantas de las once plazas ya tienen
-- desenlace, mas si la jornada esta cerrada -entonces manda lo guardado y los
-- dos numeros coinciden-.
--
-- Sale de la misma falm.once_resuelto que el marcador de Inicio: la regla de
-- los relevos vive en un sitio y solo en uno. No es SECURITY DEFINER a
-- proposito, para que siga mandando la RLS de alineacion_activo.
-- ---------------------------------------------------------------------------
create or replace function falm.marcadores_jornada(p_jornada uuid)
returns table (equipo_falm_id uuid, puntos numeric, resueltos int, plazas int, cerrada boolean)
language plpgsql
stable
set search_path to 'public', 'falm'
as $function$
declare v_cerrada boolean;
begin
  -- En una jornada doble estan mapeadas dos jornadas LFP: cerrada cuando las dos.
  select coalesce(bool_and(jl.procesada_en is not null), false) into v_cerrada
    from falm.mapeo_jornada mj
    join falm.jornada_lfp jl on jl.id = mj.jornada_lfp_id
   where mj.jornada_falm_id = p_jornada;

  return query
  select a.equipo_falm_id,
         coalesce(sum(o.puntos) filter (where o.cuenta), 0)::numeric,
         count(*) filter (where o.rol = 'TITULAR' and (o.jugo or not o.pendiente))::int,
         count(*) filter (where o.rol = 'TITULAR')::int,
         v_cerrada
    from falm.alineacion a
    cross join lateral falm.once_resuelto(a.id) o
   where a.jornada_falm_id = p_jornada
   group by a.equipo_falm_id;
end $function$;

grant execute on function falm.marcadores_jornada(uuid) to authenticated;
revoke execute on function falm.marcadores_jornada(uuid) from public, anon;

-- Cron aplicado:
--   select cron.schedule('falm-puntos-en-vivo', '*/15 * * * *',
--                        'select falm.puntuar_en_vivo()');
--
-- Crons vivos despues del cambio:
--   falm-estados-jugadores  40 */3 * * *   refrescar_estados_jugadores()
--   falm-expirar-ofertas    0 * * * *      expirar_ofertas()
--   falm-procesar-jornada   25 */2 * * *   procesar_jornada_auto()      <- cierre
--   falm-puntos-en-vivo     */15 * * * *   puntuar_en_vivo()            <- nuevo
--   falm-respaldo-diario    15 4 * * *     respaldo_crear/purgar
--   falm-tareas-jornada     10 * * * *     tareas_previas_jornada()
