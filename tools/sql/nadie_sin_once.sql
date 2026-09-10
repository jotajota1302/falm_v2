-- Que nadie se quede sin once, ni siquiera en la primera jornada.
--
-- Como estaba: una hora antes del cierre, falm.tareas_previas_jornada llama a
-- heredar_alineaciones, que copia a quien no ha subido once su alineacion de la
-- jornada anterior. En la jornada 1 no hay jornada anterior, asi que el equipo
-- que no alinee se queda SIN ALINEACION y saca 0. Hoy es el caso de uno de los
-- diez. La funcion generar_alineacion_defecto ya existia -pone el mejor once
-- posible por precio- pero no la llamaba nadie.
--
-- Y de paso, tres agujeros de la herencia que en la jornada 1 no se ven pero
-- pican a partir de la 2:
--
--   1. NO COPIABA 'lineas'. Un suplente solo entra por una linea que tenga
--      marcada (falm.once_resuelto), asi que una alineacion heredada tenia el
--      banquillo entero muerto: no relevaba a nadie.
--   2. No miraba la PLANTILLA de hoy. Desde la jornada 3 hay fichajes: se
--      heredaria un once con jugadores que ya no son del equipo.
--   3. Si al filtrar bloqueados el once se quedaba en 10, lo dejaba asi. Ahora
--      se tapa el hueco con el mejor de esa misma linea que quede libre, que
--      respeta la formacion; y si aun asi no salen 11, once de oficio.
--
-- Lo de tapar el hueco no es un adorno: en la jornada 2 hay 82 activos
-- bloqueados -es la jornada entre semana y varios partidos caen fuera de
-- plazo-, asi que casi cualquier once heredado llega cojo. Tirar el once entero
-- del manager por dos bajas seria peor que respetarle los nueve que valen.
--
-- Se anota de donde sale cada alineacion (origen), que es lo que hay que poder
-- contestar cuando alguien pregunte por que jugo ese once y no el suyo.

alter table falm.alineacion
  add column if not exists origen text not null default 'MANAGER';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'alineacion_origen_ck') then
    alter table falm.alineacion add constraint alineacion_origen_ck
      check (origen in ('MANAGER', 'HEREDADA', 'DE_OFICIO'));
  end if;
end $$;

comment on column falm.alineacion.origen is
  'Quien puso este once: MANAGER (lo subio el equipo), HEREDADA (copia de la '
  'jornada anterior) o DE_OFICIO (lo genero la casa al cerrar, mejor once por precio).';

-- ---------------------------------------------------------------------------
-- El once de oficio. Igual que antes -4-4-2 con los mas caros de cada linea y
-- un suplente por linea- pero ahora devuelve cuantos titulares ha podido
-- colocar, que es lo unico que permite saber si ha salido un once legal.
--
-- Ojo: al soltarla y volver a crearla, Postgres le devuelve el EXECUTE a PUBLIC
-- que trae de fabrica. Por eso se revoca otra vez al final; esta funcion BORRA
-- la alineacion del equipo que le pasen (ver revocar_funciones_internas.sql).
-- ---------------------------------------------------------------------------
drop function if exists falm.generar_alineacion_defecto(uuid, uuid);

create function falm.generar_alineacion_defecto(p_equipo uuid, p_jornada uuid)
returns integer
language plpgsql
security definer
set search_path to 'public', 'falm'
as $function$
declare v_ali uuid; v_tit int;
begin
  delete from falm.alineacion where equipo_falm_id = p_equipo and jornada_falm_id = p_jornada;
  insert into falm.alineacion(equipo_falm_id, jornada_falm_id, formacion, origen)
    values (p_equipo, p_jornada, '4-4-2', 'DE_OFICIO') returning id into v_ali;

  insert into falm.alineacion_activo(alineacion_id, activo_id, rol, lineas, orden)
  select v_ali, activo_id,
    (case when es_titular then 'TITULAR' else 'SUPLENTE' end)::falm.rol_alineacion,
    case when es_titular then null else array[linea] end,
    row_number() over (order by es_titular desc, pos, rn)
  from (
    select activo_id, pos, rn,
      (case
        when pos='PORTERO'  and rn=1 then true
        when pos='DEFENSA'  and rn<=4 then true
        when pos='MEDIO'    and rn<=4 then true
        when pos='DELANTERO' and rn<=2 then true
        else false end) as es_titular,
      (pos in ('DEFENSA','MEDIO','DELANTERO')
        and ((pos='DEFENSA' and rn=5) or (pos='MEDIO' and rn=5) or (pos='DELANTERO' and rn=3))) as es_suplente,
      pos as linea
    from (
      select p.activo_id,
        case when a.tipo='DEFENSA' then 'PORTERO' else jl.posicion::text end as pos,
        row_number() over (partition by (case when a.tipo='DEFENSA' then 'PORTERO' else jl.posicion::text end)
          order by a.precio_mercado desc) rn
      from falm.plantilla p
      join falm.activo a on a.id=p.activo_id
      left join falm.jugador_lfp jl on jl.id=a.jugador_lfp_id
      where p.equipo_falm_id=p_equipo and p.fecha_baja is null
        -- fuera los bloqueados de esta jornada
        and p.activo_id not in (
          select ne.activo_id from falm.activos_no_editables(p_jornada) ne where ne.motivo = 'BLOQUEADO')
    ) s
  ) r
  where es_titular or es_suplente;

  select count(*) into v_tit
    from falm.alineacion_activo where alineacion_id = v_ali and rol = 'TITULAR';
  return v_tit;
end $function$;

revoke execute on function falm.generar_alineacion_defecto(uuid, uuid) from public, authenticated, anon;

-- ---------------------------------------------------------------------------
-- Tapar los huecos de un once, linea a linea y sin tocar la formacion: por cada
-- plaza que falte entra el mas caro de esa misma linea que quede libre. Es lo
-- que salva una alineacion heredada a la que se le han caido uno o dos por
-- bloqueo o por traspaso. Devuelve cuantos ha metido.
-- ---------------------------------------------------------------------------
create or replace function falm.completar_once(p_ali uuid)
returns integer
language plpgsql
security definer
set search_path to 'public', 'falm'
as $function$
declare
  v_eq uuid; v_jor uuid; v_form text; v_orden int; v_n int; v_tit int; h record;
begin
  select equipo_falm_id, jornada_falm_id, formacion::text
    into v_eq, v_jor, v_form
    from falm.alineacion where id = p_ali;
  if v_eq is null then return 0; end if;

  select coalesce(max(orden), 0) into v_orden
    from falm.alineacion_activo where alineacion_id = p_ali;

  for h in
    with pide as (
      select 'PORTERO' as pos, 1 as n
      union all select 'DEFENSA',   split_part(v_form, '-', 1)::int
      union all select 'MEDIO',     split_part(v_form, '-', 2)::int
      union all select 'DELANTERO', split_part(v_form, '-', 3)::int
    ),
    hay as (
      select case when a.tipo = 'DEFENSA' then 'PORTERO' else jl.posicion::text end as pos,
             count(*) as n
        from falm.alineacion_activo aa
        join falm.activo a on a.id = aa.activo_id
        left join falm.jugador_lfp jl on jl.id = a.jugador_lfp_id
       where aa.alineacion_id = p_ali and aa.rol = 'TITULAR'
       group by 1
    )
    select pide.pos, pide.n - coalesce(hay.n, 0) as faltan
      from pide left join hay on hay.pos = pide.pos
     where pide.n - coalesce(hay.n, 0) > 0
  loop
    insert into falm.alineacion_activo (alineacion_id, activo_id, rol, lineas, orden)
    select p_ali, c.activo_id, 'TITULAR', null, v_orden + c.rn
    from (
      select p.activo_id,
             row_number() over (order by a.precio_mercado desc) as rn
        from falm.plantilla p
        join falm.activo a on a.id = p.activo_id
        left join falm.jugador_lfp jl on jl.id = a.jugador_lfp_id
       where p.equipo_falm_id = v_eq and p.fecha_baja is null
         and (case when a.tipo = 'DEFENSA' then 'PORTERO' else jl.posicion::text end) = h.pos
         and p.activo_id not in (
           select aa.activo_id from falm.alineacion_activo aa where aa.alineacion_id = p_ali)
         and p.activo_id not in (
           select ne.activo_id from falm.activos_no_editables(v_jor) ne where ne.motivo = 'BLOQUEADO')
       limit h.faltan
    ) c;

    get diagnostics v_n = row_count;
    v_orden := v_orden + v_n;
  end loop;

  select count(*) into v_tit
    from falm.alineacion_activo where alineacion_id = p_ali and rol = 'TITULAR';
  return v_tit;
end $function$;

revoke execute on function falm.completar_once(uuid) from public, authenticated, anon;

-- ---------------------------------------------------------------------------
-- La herencia, completa: copia la de la jornada anterior si sigue valiendo,
-- tapa lo que se haya caido, y si aun asi no hay once, uno de oficio. Devuelve
-- cuantas alineaciones ha puesto, que es lo que ensena el panel.
-- ---------------------------------------------------------------------------
create or replace function falm.heredar_alineaciones(p_jornada uuid)
returns integer
language plpgsql
as $function$
declare
  v_comp uuid; v_num int; v_ant uuid; v_nueva uuid; r record;
  v_count int := 0; v_tit int;
begin
  select competicion_id, numero into v_comp, v_num from falm.jornada_falm where id = p_jornada;

  for r in
    select e.id as equipo_id
    from falm.equipo_falm e
    join falm.competicion c on c.id = v_comp and c.temporada_id = e.temporada_id
    where not exists (select 1 from falm.alineacion a
                       where a.equipo_falm_id = e.id and a.jornada_falm_id = p_jornada)
  loop
    select a.id into v_ant
    from falm.alineacion a
    join falm.jornada_falm jf on jf.id = a.jornada_falm_id
    where a.equipo_falm_id = r.equipo_id and jf.competicion_id = v_comp and jf.numero < v_num
    order by jf.numero desc limit 1;

    v_tit := 0;

    if v_ant is not null then
      insert into falm.alineacion (equipo_falm_id, jornada_falm_id, formacion, origen)
      select r.equipo_id, p_jornada, formacion, 'HEREDADA' from falm.alineacion where id = v_ant
      returning id into v_nueva;

      insert into falm.alineacion_activo (alineacion_id, activo_id, rol, lineas, orden)
      select v_nueva, aa.activo_id, aa.rol, aa.lineas, aa.orden
      from falm.alineacion_activo aa
      where aa.alineacion_id = v_ant
        -- el que estuviese bloqueado esta jornada no se hereda
        and aa.activo_id not in (
          select ne.activo_id from falm.activos_no_editables(p_jornada) ne where ne.motivo = 'BLOQUEADO')
        -- ni el que ya no esta en la plantilla: entre jornada y jornada hay fichajes
        and exists (
          select 1 from falm.plantilla pl
           where pl.activo_id = aa.activo_id and pl.equipo_falm_id = r.equipo_id
             and pl.fecha_baja is null);

      -- Lo que se haya caido por bloqueo o por traspaso, tapado con el mejor de
      -- esa misma linea: se le respeta al manager lo que si sigue valiendo.
      v_tit := falm.completar_once(v_nueva);
    end if;

    -- Sin jornada anterior, o con un equipo que ya no da ni para once: de oficio.
    if v_tit <> 11 then
      v_tit := falm.generar_alineacion_defecto(r.equipo_id, p_jornada);
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end $function$;
