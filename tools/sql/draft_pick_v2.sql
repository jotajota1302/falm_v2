-- draft_pick v2: mismo motor de turnos, con tres validaciones nuevas.
--
--  1. Identidad: solo puedes fichar por tu equipo. La versión anterior recibía
--     p_equipo como parámetro y no lo comprobaba, así que cualquier usuario
--     logueado podía fichar por el equipo al que le tocara el turno.
--  2. Disponibilidad real: el activo debe estar en v_activo_libre (eso deja
--     fuera a los porteros individuales y a los que no son de primer equipo).
--  3. Mínimo de 2 porterías dentro de los 23 turnos de cada equipo.
--
-- Y un 'for update' sobre el turno, para que dos peticiones simultáneas se
-- serialicen en vez de leer las dos el mismo turno.
--
-- auth.uid() nulo = ejecución de mantenimiento (psql/MCP): se permite.

create or replace function falm.draft_pick(p_draft uuid, p_activo uuid, p_equipo uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'falm'
as $function$
declare
  v_turno falm.draft_orden;
  v_estado falm.draft_estado;
  v_uid uuid := auth.uid();
  v_es_porteria boolean;
  v_porterias int;
  v_restantes int;
  v_faltan int;
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

-- Deshacer el último pick. En una quedada presencial alguien dicta mal un
-- nombre y hay que poder arreglarlo sin tocar la base a mano.
create or replace function falm.draft_pick_deshacer(p_draft uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'falm'
as $function$
declare
  v_uid uuid := auth.uid();
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

grant execute on function falm.draft_pick(uuid, uuid, uuid) to authenticated;
grant execute on function falm.draft_pick_deshacer(uuid) to authenticated;
