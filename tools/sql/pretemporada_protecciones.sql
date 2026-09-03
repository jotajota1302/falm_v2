-- Protecciones de la pretemporada.
--
-- El panel de admin tiene botones que, pulsados por segunda vez a mitad de
-- temporada, hacían daño de verdad:
--
--   generar_calendario_liga  borraba TODOS los enfrentamientos de la liga y los
--                            regeneraba con order by random(), llevándose por
--                            delante los resultados ya jugados.
--   generar_jornadas_liga    con un rango distinto añadía jornadas sin borrar
--                            las viejas, dejando la temporada incoherente.
--   crear_temporada          creaba temporadas duplicadas con el mismo nombre.
--
-- La regla que manda: si la liga ya tiene resultados o alineaciones, no se
-- regenera nada. Ni forzando. Eso es historia de la liga y se rehace a mano y a
-- conciencia, no con un clic.
--
-- Las protecciones viven en la base y no en la pantalla, para que no se puedan
-- saltar desde la consola del navegador.

-- ---------------------------------------------------------------------------
-- Estado de la pretemporada, para que el panel pueda decir qué hay hecho.
-- ---------------------------------------------------------------------------
create or replace function falm.estado_pretemporada(p_temporada uuid)
returns jsonb
language sql
security definer
set search_path to 'public', 'falm'
as $function$
  with liga as (
    select id from falm.competicion where temporada_id = p_temporada and tipo = 'LIGA'
  ),
  jor as (
    select jf.id, jf.numero from falm.jornada_falm jf, liga where jf.competicion_id = liga.id
  ),
  mapa as (
    select min(jl.numero) desde, max(jl.numero) hasta
    from falm.mapeo_jornada m
    join jor on jor.id = m.jornada_falm_id
    join falm.jornada_lfp jl on jl.id = m.jornada_lfp_id
  ),
  enf as (
    select count(*) total,
           count(*) filter (where e.puntos_local is not null or e.puntos_visitante is not null) con_puntos
    from falm.enfrentamiento e where e.jornada_falm_id in (select id from jor)
  ),
  ali as (
    select count(distinct al.jornada_falm_id) jornadas
    from falm.alineacion al where al.jornada_falm_id in (select id from jor)
  )
  select jsonb_build_object(
    'equipos',        (select count(*) from falm.equipo_falm where temporada_id = p_temporada),
    'jornadas',       (select count(*) from jor),
    'lfp_desde',      (select desde from mapa),
    'lfp_hasta',      (select hasta from mapa),
    'enfrentamientos',(select total from enf),
    'jugados',        (select con_puntos from enf),
    'con_alineacion', (select jornadas from ali),
    'bloqueado',      (select con_puntos from enf) > 0 or (select jornadas from ali) > 0
  );
$function$;

-- ---------------------------------------------------------------------------
-- crear_temporada: sin duplicados de nombre.
-- ---------------------------------------------------------------------------
create or replace function falm.crear_temporada(p_nombre text, p_anio integer)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'falm'
as $function$
declare v_id uuid;
begin
  if exists (select 1 from falm.temporada where lower(nombre) = lower(trim(p_nombre))) then
    raise exception 'Ya existe una temporada llamada "%"', trim(p_nombre);
  end if;

  insert into falm.temporada(nombre, anio_inicio, activa)
    values (trim(p_nombre), p_anio, false) returning id into v_id;
  insert into falm.competicion(temporada_id, tipo, nombre) values
    (v_id, 'LIGA', 'Liga FALM'),
    (v_id, 'CHAMPIONS', 'Champions FALM'),
    (v_id, 'CLAUSURA', 'Clausura FALM');
  return v_id;
end $function$;

-- ---------------------------------------------------------------------------
-- generar_jornadas_liga: idempotente con el mismo rango, y con otro rango
-- exige forzar. Nunca si la liga ya tiene resultados o alineaciones.
-- ---------------------------------------------------------------------------
drop function if exists falm.generar_jornadas_liga(uuid, integer, integer);

create or replace function falm.generar_jornadas_liga(
  p_temporada uuid,
  p_lfp_desde integer,
  p_lfp_hasta integer,
  p_forzar boolean default false
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'falm'
as $function$
declare
  v_liga uuid; v_n int; v_est jsonb;
  v_jornadas int; v_desde int; v_hasta int;
begin
  select id into v_liga from falm.competicion where temporada_id = p_temporada and tipo = 'LIGA';
  if v_liga is null then raise exception 'La temporada no tiene competición LIGA'; end if;
  if p_lfp_hasta < p_lfp_desde then raise exception 'El rango de jornadas LFP está al revés'; end if;
  v_n := p_lfp_hasta - p_lfp_desde + 1;

  v_est := falm.estado_pretemporada(p_temporada);
  v_jornadas := (v_est->>'jornadas')::int;
  v_desde := (v_est->>'lfp_desde')::int;
  v_hasta := (v_est->>'lfp_hasta')::int;

  if v_jornadas > 0 then
    -- Mismo rango: no hay nada que hacer.
    if v_desde = p_lfp_desde and v_hasta = p_lfp_hasta and v_jornadas = v_n then
      return jsonb_build_object('ya_estaba', true, 'jornadas_falm', v_jornadas,
        'rango_lfp', v_desde || '-' || v_hasta);
    end if;

    if (v_est->>'bloqueado')::boolean then
      raise exception 'La liga ya tiene resultados o alineaciones (% jornadas jugadas): no se regeneran las jornadas',
        greatest((v_est->>'jugados')::int, (v_est->>'con_alineacion')::int);
    end if;

    if not p_forzar then
      raise exception 'Ya hay % jornadas mapeadas a LFP %-%. Pedías %-%: marca forzar para rehacerlas',
        v_jornadas, v_desde, v_hasta, p_lfp_desde, p_lfp_hasta;
    end if;

    -- Forzando y sin datos jugados: se rehace limpio, no se mezcla.
    delete from falm.enfrentamiento
     where jornada_falm_id in (select id from falm.jornada_falm where competicion_id = v_liga);
    delete from falm.mapeo_jornada
     where jornada_falm_id in (select id from falm.jornada_falm where competicion_id = v_liga);
    delete from falm.jornada_falm where competicion_id = v_liga;
  end if;

  insert into falm.jornada_lfp(temporada_id, numero, estado)
  select p_temporada, g, 'PENDIENTE' from generate_series(p_lfp_desde, p_lfp_hasta) g
  on conflict do nothing;

  insert into falm.jornada_falm(competicion_id, numero)
  select v_liga, k from generate_series(1, v_n) k
  on conflict do nothing;

  insert into falm.mapeo_jornada(jornada_falm_id, jornada_lfp_id)
  select jf.id, jl.id
  from falm.jornada_falm jf
  join falm.jornada_lfp jl
    on jl.temporada_id = p_temporada and jl.numero = p_lfp_desde + jf.numero - 1
  where jf.competicion_id = v_liga
  on conflict do nothing;

  return jsonb_build_object('jornadas_falm', v_n, 'jornadas_lfp', v_n,
    'rango_lfp', p_lfp_desde || '-' || p_lfp_hasta, 'rehecho', p_forzar);
end $function$;

-- ---------------------------------------------------------------------------
-- generar_calendario_liga: el botón que borraba la liga. Ahora exige forzar si
-- ya hay calendario, y se niega en redondo si hay resultados o alineaciones.
-- ---------------------------------------------------------------------------
drop function if exists falm.generar_calendario_liga(uuid);

create or replace function falm.generar_calendario_liga(
  p_temporada uuid,
  p_forzar boolean default false
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'falm'
as $function$
declare
  v_liga uuid; w uuid[]; n int; n2 int; js uuid[]; k int; i int; tmp uuid;
  v_local uuid; v_visit uuid; v_count int := 0; v_swap boolean; v_est jsonb;
begin
  select id into v_liga from falm.competicion where temporada_id = p_temporada and tipo = 'LIGA';
  if v_liga is null then raise exception 'La temporada no tiene competición LIGA'; end if;

  v_est := falm.estado_pretemporada(p_temporada);

  -- Bloqueo duro: con resultados o alineaciones no se regenera ni forzando.
  if (v_est->>'bloqueado')::boolean then
    raise exception 'La liga ya está en marcha (% enfrentamientos con resultado, % jornadas con alineación): el calendario no se regenera',
      (v_est->>'jugados')::int, (v_est->>'con_alineacion')::int;
  end if;

  if (v_est->>'enfrentamientos')::int > 0 and not p_forzar then
    raise exception 'Ya hay un calendario con % enfrentamientos. Marca forzar para volver a sortearlo',
      (v_est->>'enfrentamientos')::int;
  end if;

  select array_agg(id order by random()) into w
    from falm.equipo_falm where temporada_id = p_temporada;
  n := coalesce(array_length(w, 1), 0);
  if n < 2 or n % 2 <> 0 then raise exception 'Se necesitan equipos en número par (hay %)', n; end if;
  n2 := n / 2;
  select array_agg(id order by numero) into js
    from falm.jornada_falm where competicion_id = v_liga;
  if coalesce(array_length(js, 1), 0) = 0 then
    raise exception 'No hay jornadas: genera primero las jornadas y el mapeo';
  end if;

  delete from falm.enfrentamiento where jornada_falm_id = any(js);

  for k in 1 .. coalesce(array_length(js, 1), 0) loop
    v_swap := (k % 2 = 0); -- alterna localía por jornada
    for i in 1 .. n2 loop
      v_local := w[i]; v_visit := w[n - i + 1];
      if v_swap then tmp := v_local; v_local := v_visit; v_visit := tmp; end if;
      insert into falm.enfrentamiento(jornada_falm_id, equipo_local_id, equipo_visitante_id)
        values (js[k], v_local, v_visit);
      v_count := v_count + 1;
    end loop;
    -- rotar: fijo w[1], el resto gira (último pasa a la posición 2)
    tmp := w[n];
    for i in reverse n .. 3 loop w[i] := w[i-1]; end loop;
    w[2] := tmp;
  end loop;

  return jsonb_build_object('jornadas', array_length(js, 1), 'enfrentamientos', v_count,
    'rehecho', p_forzar);
end $function$;

grant execute on function falm.estado_pretemporada(uuid) to authenticated;
grant execute on function falm.crear_temporada(text, integer) to authenticated;
grant execute on function falm.generar_jornadas_liga(uuid, integer, integer, boolean) to authenticated;
grant execute on function falm.generar_calendario_liga(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- activar_temporada en dos pasos.
--
-- Existe el índice único parcial uq_temporada_activa (activa where activa), así
-- que el 'update set activa = (id = p_temporada)' de una sola sentencia podía
-- violarlo según el orden en que Postgres tocara las filas: si activaba la
-- nueva antes de desactivar la anterior, había dos activas a la vez y fallaba.
-- Con una sola temporada nunca dio la cara; con dos, es un fallo intermitente.
-- ---------------------------------------------------------------------------
create or replace function falm.activar_temporada(p_temporada uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'falm'
as $function$
begin
  if not exists (select 1 from falm.temporada where id = p_temporada) then
    raise exception 'Temporada no encontrada';
  end if;
  update falm.temporada set activa = false where activa and id <> p_temporada;
  update falm.temporada set activa = true  where id = p_temporada and not activa;
end $function$;

-- ---------------------------------------------------------------------------
-- Edición puntual: cuando la liga ya está en marcha no se regenera nada, pero
-- sí se puede corregir un cruce concreto o remapear una jornada suelta.
-- ---------------------------------------------------------------------------

-- Cambia los equipos de un enfrentamiento. Para dar la vuelta a la localía,
-- se llama con local y visitante intercambiados.
create or replace function falm.enfrentamiento_editar(
  p_enfrentamiento uuid,
  p_local uuid,
  p_visitante uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'falm'
as $function$
declare v_jor uuid; v_temp uuid;
begin
  if auth.uid() is not null and not falm.es_gestor() then
    raise exception 'Solo un administrador puede editar el calendario';
  end if;
  if p_local = p_visitante then raise exception 'Un equipo no puede jugar contra sí mismo'; end if;

  select e.jornada_falm_id into v_jor
    from falm.enfrentamiento e where e.id = p_enfrentamiento;
  if v_jor is null then raise exception 'Enfrentamiento no encontrado'; end if;

  select c.temporada_id into v_temp
    from falm.jornada_falm jf join falm.competicion c on c.id = jf.competicion_id
   where jf.id = v_jor;

  -- Esa jornada concreta no puede estar jugada.
  if exists (select 1 from falm.enfrentamiento e
              where e.jornada_falm_id = v_jor
                and (e.puntos_local is not null or e.puntos_visitante is not null)) then
    raise exception 'Esa jornada ya tiene resultados: no se puede cambiar el cruce';
  end if;
  if exists (select 1 from falm.alineacion al where al.jornada_falm_id = v_jor) then
    raise exception 'Esa jornada ya tiene alineaciones: no se puede cambiar el cruce';
  end if;

  if not exists (select 1 from falm.equipo_falm where id = p_local and temporada_id = v_temp)
     or not exists (select 1 from falm.equipo_falm where id = p_visitante and temporada_id = v_temp) then
    raise exception 'Los equipos deben ser de la misma temporada';
  end if;

  -- Ningún equipo puede aparecer dos veces en la misma jornada.
  if exists (
    select 1 from falm.enfrentamiento e
     where e.jornada_falm_id = v_jor and e.id <> p_enfrentamiento
       and (e.equipo_local_id in (p_local, p_visitante)
         or e.equipo_visitante_id in (p_local, p_visitante))
  ) then
    raise exception 'Alguno de esos equipos ya juega en esa jornada';
  end if;

  update falm.enfrentamiento
     set equipo_local_id = p_local, equipo_visitante_id = p_visitante
   where id = p_enfrentamiento;

  return jsonb_build_object('editado', true, 'jornada_falm_id', v_jor);
end $function$;

-- Cambia a qué jornada de LaLiga apunta una jornada FALM, y/o su fecha de
-- cierre. Para cuando la LFP mueve partidos y hay que recolocar una jornada
-- sin tocar el resto del calendario.
create or replace function falm.jornada_editar(
  p_jornada_falm uuid,
  p_lfp_numero integer default null,
  p_fecha_cierre timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'falm'
as $function$
declare v_temp uuid; v_lfp uuid;
begin
  if auth.uid() is not null and not falm.es_gestor() then
    raise exception 'Solo un administrador puede editar las jornadas';
  end if;

  select c.temporada_id into v_temp
    from falm.jornada_falm jf join falm.competicion c on c.id = jf.competicion_id
   where jf.id = p_jornada_falm;
  if v_temp is null then raise exception 'Jornada no encontrada'; end if;

  if p_lfp_numero is not null then
    if exists (select 1 from falm.alineacion al where al.jornada_falm_id = p_jornada_falm) then
      raise exception 'Esa jornada ya tiene alineaciones: no se puede remapear';
    end if;
    select id into v_lfp from falm.jornada_lfp
     where temporada_id = v_temp and numero = p_lfp_numero;
    if v_lfp is null then
      raise exception 'La temporada no tiene la jornada LFP %', p_lfp_numero;
    end if;
    delete from falm.mapeo_jornada where jornada_falm_id = p_jornada_falm;
    insert into falm.mapeo_jornada(jornada_falm_id, jornada_lfp_id)
      values (p_jornada_falm, v_lfp);
  end if;

  if p_fecha_cierre is not null then
    update falm.jornada_falm set fecha_cierre = p_fecha_cierre where id = p_jornada_falm;
  end if;

  return jsonb_build_object('editado', true,
    'lfp', p_lfp_numero, 'fecha_cierre', p_fecha_cierre);
end $function$;

grant execute on function falm.activar_temporada(uuid) to authenticated;
grant execute on function falm.enfrentamiento_editar(uuid, uuid, uuid) to authenticated;
grant execute on function falm.jornada_editar(uuid, integer, timestamptz) to authenticated;
