-- Motor de picks del draft. Refleja lo aplicado en la base.
--
-- draft_pick valida, por este orden:
--   1. que el draft este en curso
--   2. identidad: solo fichas por tu equipo, salvo que seas admin (asi el
--      comisario puede meter el pick de quien lo canta en voz alta)
--   3. que el activo no este ya elegido y siga disponible
--   4. el tope por club: 2 del Madrid/Barca/Atleti, 3 del resto, contando la
--      porteria de un club como uno de los suyos
--   5. el minimo de 2 porterias dentro de los turnos que quedan
--
-- El "for update" sobre el turno serializa dos peticiones simultaneas: la
-- segunda espera y se encuentra el turno ya cerrado.

create or replace function falm.draft_pick(p_draft uuid, p_activo uuid, p_equipo uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'falm'
as $function$
declare
  v_turno falm.draft_orden;
  v_estado falm.draft_estado;
  v_es_porteria boolean;
  v_porterias int;
  v_restantes int;
  v_faltan int;
  v_club uuid;
  v_club_nombre text;
  v_limite int;
  v_tiene int;
begin
  select estado into v_estado from falm.draft where id = p_draft;
  if v_estado is null then raise exception 'Draft no encontrado'; end if;
  if v_estado not in ('CREADO','EN_CURSO') then raise exception 'El draft no está en curso'; end if;

  if not (falm.puede_gestionar() or falm.es_mi_equipo(p_equipo)) then
    raise exception 'No puedes fichar en nombre de otro equipo';
  end if;

  select * into v_turno from falm.draft_orden
   where draft_id = p_draft and not completado
   order by orden_global limit 1
   for update;
  if v_turno.id is null then raise exception 'No quedan turnos'; end if;
  if v_turno.equipo_falm_id <> p_equipo then raise exception 'No es el turno de ese equipo'; end if;

  if exists (select 1 from falm.draft_pick where draft_id = p_draft and activo_id = p_activo) then
    raise exception 'Ese activo ya fue elegido en este draft';
  end if;
  if not exists (select 1 from falm.v_activo_libre where activo_id = p_activo) then
    raise exception 'Ese activo no está disponible';
  end if;

  -- Tope por club. La porteria de un club cuenta como uno de los suyos.
  v_club := falm.club_de_activo(p_activo);
  if v_club is not null then
    select nombre, limite_plantilla into v_club_nombre, v_limite
      from falm.equipo_lfp where id = v_club;
    select count(*) into v_tiene
      from falm.draft_pick dp
     where dp.draft_id = p_draft and dp.equipo_falm_id = p_equipo
       and falm.club_de_activo(dp.activo_id) = v_club;
    if v_tiene >= v_limite then
      raise exception 'Ya tienes % de % y el máximo por ese club es %',
        v_tiene, v_club_nombre, v_limite;
    end if;
  end if;

  -- Minimo de 2 porterias dentro de los turnos que quedan.
  select (a.tipo = 'DEFENSA') into v_es_porteria from falm.activo a where a.id = p_activo;
  select count(*) into v_porterias
    from falm.draft_pick dp join falm.activo a on a.id = dp.activo_id
   where dp.draft_id = p_draft and dp.equipo_falm_id = p_equipo and a.tipo = 'DEFENSA';
  select count(*) into v_restantes
    from falm.draft_orden
   where draft_id = p_draft and equipo_falm_id = p_equipo and not completado;
  v_faltan := 2 - v_porterias;
  if v_faltan > 0 and v_restantes <= v_faltan and not v_es_porteria then
    raise exception 'Te quedan % turnos y te faltan % porterías: solo puedes elegir portería',
      v_restantes, v_faltan;
  end if;

  insert into falm.draft_pick(draft_id, activo_id, equipo_falm_id, ronda, orden_seleccion)
    values (p_draft, p_activo, p_equipo, v_turno.ronda, v_turno.orden_global);
  update falm.draft_orden set completado = true where id = v_turno.id;
  update falm.draft set estado = 'EN_CURSO' where id = p_draft and estado = 'CREADO';
  if not exists (select 1 from falm.draft_orden where draft_id = p_draft and not completado) then
    update falm.draft set estado = 'COMPLETADO' where id = p_draft;
  end if;
  return falm.draft_estado(p_draft);
end $function$;

-- Deshacer el ultimo pick: en la quedada alguien dicta mal un nombre.
create or replace function falm.draft_pick_deshacer(p_draft uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'falm'
as $function$
declare
  v_estado falm.draft_estado;
  v_pick falm.draft_pick;
begin
  if not falm.puede_gestionar() then
    raise exception 'Solo un administrador puede deshacer un pick';
  end if;

  select estado into v_estado from falm.draft where id = p_draft;
  if v_estado is null then raise exception 'Draft no encontrado'; end if;
  if v_estado = 'CONSOLIDADO' then raise exception 'El draft ya está consolidado'; end if;

  select * into v_pick from falm.draft_pick
   where draft_id = p_draft order by orden_seleccion desc limit 1;
  if v_pick.id is null then raise exception 'No hay picks que deshacer'; end if;

  delete from falm.draft_pick where id = v_pick.id;
  update falm.draft_orden set completado = false
   where draft_id = p_draft and orden_global = v_pick.orden_seleccion;
  update falm.draft set estado = 'EN_CURSO' where id = p_draft and estado = 'COMPLETADO';
  return falm.draft_estado(p_draft);
end $function$;

-- Consolidar: los picks pasan a plantilla. No se descuenta presupuesto, esta
-- temporada no se juega con dinero.
create or replace function falm.draft_consolidar(p_draft uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'falm'
as $function$
declare v_estado falm.draft_estado; v_temp uuid; v_n int;
begin
  if not falm.puede_gestionar() then
    raise exception 'Solo un administrador puede consolidar el draft';
  end if;

  select estado, temporada_id into v_estado, v_temp from falm.draft where id = p_draft;
  if v_estado is null then raise exception 'Draft no encontrado'; end if;
  if v_estado <> 'COMPLETADO' then raise exception 'Solo se consolida un draft COMPLETADO'; end if;

  insert into falm.plantilla(temporada_id, equipo_falm_id, activo_id, precio, fecha_fichaje)
  select v_temp, dp.equipo_falm_id, dp.activo_id, coalesce(a.precio_mercado, 0), now()
  from falm.draft_pick dp
  join falm.activo a on a.id = dp.activo_id
  where dp.draft_id = p_draft
    and not exists (select 1 from falm.plantilla pl
                     where pl.activo_id = dp.activo_id and pl.fecha_baja is null);
  get diagnostics v_n = row_count;

  update falm.draft set estado = 'CONSOLIDADO' where id = p_draft;
  return jsonb_build_object('consolidado', true, 'altas_plantilla', v_n);
end $function$;

grant execute on function falm.draft_pick(uuid, uuid, uuid) to authenticated;
grant execute on function falm.draft_pick_deshacer(uuid) to authenticated;
grant execute on function falm.draft_consolidar(uuid) to authenticated;
