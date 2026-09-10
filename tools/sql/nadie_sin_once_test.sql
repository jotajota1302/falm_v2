-- Casos de "que nadie se quede sin once". Se revierte solo: termina lanzando
-- una excepcion a proposito, asi que Postgres deshace las alineaciones que crea.
-- Pasa si el error empieza por 'TEST OK'; falla si empieza por 'FALLO'.
--
-- El caso 2 se prueba sobre la jornada 2 a proposito: es la de entre semana y
-- tiene 82 activos bloqueados, asi que casi cualquier once heredado llega cojo.
-- Es justo el caso que antes dejaba alineaciones de diez.

-- Ayuda del test: dice que linea no cuadra con la formacion, o null si cuadran
-- todas. Se deja creada porque el test la usa dos veces; no la llama nadie mas.
create or replace function falm._lineas_mal(p_ali uuid, p_form text)
returns text
language sql
stable
set search_path to 'public', 'falm'
as $function$
  with pide as (
    select 'PORTERO' as pos, 1 as n
    union all select 'DEFENSA',   split_part(p_form, '-', 1)::int
    union all select 'MEDIO',     split_part(p_form, '-', 2)::int
    union all select 'DELANTERO', split_part(p_form, '-', 3)::int
  ),
  hay as (
    select case when a.tipo = 'DEFENSA' then 'PORTERO' else jl.posicion::text end as pos, count(*) n
      from falm.alineacion_activo aa
      join falm.activo a on a.id = aa.activo_id
      left join falm.jugador_lfp jl on jl.id = a.jugador_lfp_id
     where aa.alineacion_id = p_ali and aa.rol = 'TITULAR'
     group by 1
  )
  select string_agg(format('%s pide %s y hay %s', pide.pos, pide.n, coalesce(hay.n, 0)), ', ')
    from pide left join hay on hay.pos = pide.pos
   where pide.n <> coalesce(hay.n, 0);
$function$;

do $test$
declare
  v_j1 uuid; v_j2 uuid; v_comp uuid;
  v_sin uuid; v_sin_nombre text; v_con uuid; v_con_nombre text;
  v_ali uuid; v_tit int; v_sup int; v_sup_lineas int; v_origen text; v_form text;
  v_puestas int; v_victima uuid; v_mal text;
  v_fallos text[] := array[]::text[];
begin
  select id into v_comp from falm.competicion where tipo = 'LIGA'
    and temporada_id = (select id from falm.temporada where activa);
  select id into v_j1 from falm.jornada_falm where competicion_id = v_comp and numero = 1;
  select id into v_j2 from falm.jornada_falm where competicion_id = v_comp and numero = 2;

  -- ------------------------------------------------------------------
  -- 1. Jornada 1, equipo sin once y sin jornada anterior: once de oficio.
  --    Antes se quedaba sin alineacion y sacaba 0.
  -- ------------------------------------------------------------------
  select ef.id, ef.nombre into v_sin, v_sin_nombre
    from falm.equipo_falm ef
   where not exists (select 1 from falm.alineacion a
                      where a.equipo_falm_id = ef.id and a.jornada_falm_id = v_j1)
   limit 1;

  if v_sin is null then
    -- Si ya han alineado los diez, se le quita el once a uno para poder probar.
    select ef.id, ef.nombre into v_sin, v_sin_nombre from falm.equipo_falm ef limit 1;
    delete from falm.alineacion where equipo_falm_id = v_sin and jornada_falm_id = v_j1;
  end if;

  v_puestas := falm.heredar_alineaciones(v_j1);

  select a.id, a.origen into v_ali, v_origen
    from falm.alineacion a where a.equipo_falm_id = v_sin and a.jornada_falm_id = v_j1;

  if v_ali is null then
    v_fallos := v_fallos || format('1: %s sigue sin alineacion', v_sin_nombre);
  else
    select count(*) filter (where rol = 'TITULAR'),
           count(*) filter (where rol <> 'TITULAR'),
           count(*) filter (where rol <> 'TITULAR' and coalesce(array_length(lineas,1),0) > 0)
      into v_tit, v_sup, v_sup_lineas
      from falm.alineacion_activo where alineacion_id = v_ali;

    if v_tit <> 11 then
      v_fallos := v_fallos || format('1: el once de oficio tiene %s titulares', v_tit);
    end if;
    if v_origen <> 'DE_OFICIO' then
      v_fallos := v_fallos || format('1: origen %s en vez de DE_OFICIO', v_origen);
    end if;
    if v_sup = 0 then
      v_fallos := v_fallos || '1: el once de oficio se queda sin banquillo';
    elsif v_sup_lineas <> v_sup then
      v_fallos := v_fallos || format('1: %s de %s suplentes sin linea marcada', v_sup - v_sup_lineas, v_sup);
    end if;
  end if;

  -- ------------------------------------------------------------------
  -- 2. Jornada 2: se hereda la 1 CON las lineas del banquillo -antes se
  --    copiaban rol y orden pero no lineas, y el banquillo no relevaba a
  --    nadie- y con los huecos de los bloqueados tapados, sin cambiar la
  --    formacion.
  -- ------------------------------------------------------------------
  select ef.id, ef.nombre into v_con, v_con_nombre
    from falm.equipo_falm ef
    join falm.alineacion a on a.equipo_falm_id = ef.id and a.jornada_falm_id = v_j1
    join falm.alineacion_activo aa on aa.alineacion_id = a.id
   where aa.rol <> 'TITULAR' and coalesce(array_length(aa.lineas,1),0) > 0
     and a.origen = 'MANAGER'
   limit 1;

  if v_con is null then
    v_fallos := v_fallos || '2: no hay ningun once de manager con banquillo marcado para probar la herencia';
  else
    delete from falm.alineacion where jornada_falm_id = v_j2;
    perform falm.heredar_alineaciones(v_j2);

    select a.id, a.origen, a.formacion::text into v_ali, v_origen, v_form
      from falm.alineacion a where a.equipo_falm_id = v_con and a.jornada_falm_id = v_j2;

    select count(*) filter (where rol = 'TITULAR'),
           count(*) filter (where rol <> 'TITULAR'),
           count(*) filter (where rol <> 'TITULAR' and coalesce(array_length(lineas,1),0) > 0)
      into v_tit, v_sup, v_sup_lineas
      from falm.alineacion_activo where alineacion_id = v_ali;

    if v_origen <> 'HEREDADA' then
      v_fallos := v_fallos || format('2: %s deberia heredar y pone %s', v_con_nombre, v_origen);
    end if;
    if v_tit <> 11 then
      v_fallos := v_fallos || format('2: la heredada tiene %s titulares', v_tit);
    end if;
    if v_sup_lineas <> v_sup then
      v_fallos := v_fallos || format('2: la herencia pierde las lineas de %s suplentes', v_sup - v_sup_lineas);
    end if;

    -- Y el once tapado sigue siendo legal: cada linea, la que pide la formacion.
    v_mal := falm._lineas_mal(v_ali, v_form);
    if v_mal is not null then
      v_fallos := v_fallos || format('2: la formacion %s deja de cuadrar (%s)', v_form, v_mal);
    end if;
  end if;

  -- ------------------------------------------------------------------
  -- 3. Un titular que ya no esta en la plantilla no se hereda, pero tampoco
  --    deja el hueco: entra otro de su misma linea y el once sigue siendo del
  --    manager en todo lo demas.
  -- ------------------------------------------------------------------
  if v_con is not null then
    select aa.activo_id into v_victima
      from falm.alineacion a
      join falm.alineacion_activo aa on aa.alineacion_id = a.id and aa.rol = 'TITULAR'
     where a.equipo_falm_id = v_con and a.jornada_falm_id = v_j1
     limit 1;

    update falm.plantilla set fecha_baja = now()
     where equipo_falm_id = v_con and activo_id = v_victima and fecha_baja is null;

    delete from falm.alineacion where jornada_falm_id = v_j2;
    perform falm.heredar_alineaciones(v_j2);

    select a.id, a.origen, a.formacion::text into v_ali, v_origen, v_form
      from falm.alineacion a where a.equipo_falm_id = v_con and a.jornada_falm_id = v_j2;
    select count(*) filter (where rol = 'TITULAR') into v_tit
      from falm.alineacion_activo where alineacion_id = v_ali;

    if v_tit <> 11 then
      v_fallos := v_fallos || format('3: se hereda un once de %s titulares', v_tit);
    end if;
    if exists (select 1 from falm.alineacion_activo where alineacion_id = v_ali and activo_id = v_victima) then
      v_fallos := v_fallos || '3: alinea a uno que ya no es del equipo';
    end if;
    v_mal := falm._lineas_mal(v_ali, v_form);
    if v_mal is not null then
      v_fallos := v_fallos || format('3: la formacion %s deja de cuadrar (%s)', v_form, v_mal);
    end if;
  end if;

  if array_length(v_fallos, 1) > 0 then
    raise exception 'FALLO: %', array_to_string(v_fallos, ' | ');
  end if;
  raise exception 'TEST OK: 3 casos (% sin once -> de oficio con 11; % hereda con banquillo vivo y huecos tapados; traspasado -> le entra otro de su linea). heredar puso % alineaciones en la jornada 1',
    v_sin_nombre, v_con_nombre, v_puestas;
end $test$;

