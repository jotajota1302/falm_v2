-- Correcciones puntuales del draft, para la quedada en directo.
--
-- draft_pick_deshacer (en draft_pick_v2.sql) solo quita el ultimo pick, asi que
-- arreglar un error de hace cinco turnos obligaba a deshacer todo lo posterior.
-- Estas dos funciones trabajan sobre un pick concreto:
--
--   draft_pick_corregir  cambia el jugador de ese pick, sin tocar el equipo ni
--                        el turno. Para cuando se dicta mal un nombre.
--   draft_pick_anular    borra ese pick y reabre su turno. Para cuando el pick
--                        era de otro equipo o directamente sobra.
--
-- Ambas son solo de administrador y solo mientras el draft no este consolidado:
-- despues los jugadores ya estan en las plantillas y el arreglo es un traspaso.
--
-- Ojo con anular un pick del medio: el turno vuelve a quedar abierto y, como el
-- turno en curso es el primero sin completar, el tablero retrocede hasta ahi.
-- Ese equipo vuelve a elegir y luego se sigue por donde iba. Es lo que se busca,
-- pero conviene cantarlo en voz alta antes de pulsar.

create or replace function falm.draft_pick_corregir(p_pick uuid, p_activo uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'falm'
as $function$
declare
  v_pick falm.draft_pick;
  v_estado falm.draft_estado;
  v_equipo text;
  v_club uuid;
  v_club_nombre text;
  v_limite int;
  v_tiene int;
  v_es_porteria boolean;
  v_porterias int;
  v_restantes int;
begin
  if not falm.puede_gestionar() then
    raise exception 'Solo un administrador puede corregir un pick';
  end if;

  select * into v_pick from falm.draft_pick where id = p_pick for update;
  if v_pick.id is null then raise exception 'Pick no encontrado'; end if;

  select estado into v_estado from falm.draft where id = v_pick.draft_id;
  if v_estado = 'CONSOLIDADO' then
    raise exception 'El draft ya esta consolidado: eso ya no es una correccion, es un traspaso';
  end if;

  if v_pick.activo_id = p_activo then
    raise exception 'Ese pick ya es de ese jugador';
  end if;

  select nombre into v_equipo from falm.equipo_falm where id = v_pick.equipo_falm_id;

  if exists (select 1 from falm.draft_pick
              where draft_id = v_pick.draft_id and activo_id = p_activo) then
    raise exception 'Ese activo ya fue elegido en este draft';
  end if;
  if not exists (select 1 from falm.v_activo_libre where activo_id = p_activo) then
    raise exception 'Ese activo no esta disponible';
  end if;

  -- Tope por club, sin contar el pick que estamos corrigiendo: si le cambias el
  -- tercer madridista por otro madridista, sigue teniendo tres, no cuatro.
  v_club := falm.club_de_activo(p_activo);
  if v_club is not null then
    select nombre, limite_plantilla into v_club_nombre, v_limite
      from falm.equipo_lfp where id = v_club;
    select count(*) into v_tiene
      from falm.draft_pick dp
     where dp.draft_id = v_pick.draft_id
       and dp.equipo_falm_id = v_pick.equipo_falm_id
       and dp.id <> p_pick
       and falm.club_de_activo(dp.activo_id) = v_club;
    if v_tiene >= v_limite then
      raise exception '% ya tiene % de % y el maximo por ese club es %',
        v_equipo, v_tiene, v_club_nombre, v_limite;
    end if;
  end if;

  -- Minimo de 2 porterias, contando como quedaria el equipo tras el cambio:
  -- quitarle una porteria a quien ya no tiene turnos de sobra lo deja colgado.
  select (a.tipo = 'DEFENSA') into v_es_porteria from falm.activo a where a.id = p_activo;
  select count(*) into v_porterias
    from falm.draft_pick dp join falm.activo a on a.id = dp.activo_id
   where dp.draft_id = v_pick.draft_id
     and dp.equipo_falm_id = v_pick.equipo_falm_id
     and dp.id <> p_pick
     and a.tipo = 'DEFENSA';
  if v_es_porteria then v_porterias := v_porterias + 1; end if;
  select count(*) into v_restantes
    from falm.draft_orden
   where draft_id = v_pick.draft_id
     and equipo_falm_id = v_pick.equipo_falm_id
     and not completado;
  if v_porterias + v_restantes < 2 then
    raise exception 'Con ese cambio % se queda en % porterias y solo le quedan % turnos: no llegaria a 2',
      v_equipo, v_porterias, v_restantes;
  end if;

  update falm.draft_pick set activo_id = p_activo where id = p_pick;
  return falm.draft_estado(v_pick.draft_id);
end $function$;

create or replace function falm.draft_pick_anular(p_pick uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'falm'
as $function$
declare
  v_pick falm.draft_pick;
  v_estado falm.draft_estado;
begin
  if not falm.puede_gestionar() then
    raise exception 'Solo un administrador puede anular un pick';
  end if;

  select * into v_pick from falm.draft_pick where id = p_pick for update;
  if v_pick.id is null then raise exception 'Pick no encontrado'; end if;

  select estado into v_estado from falm.draft where id = v_pick.draft_id;
  if v_estado = 'CONSOLIDADO' then
    raise exception 'El draft ya esta consolidado: para deshacer un fichaje hace falta un traspaso';
  end if;

  delete from falm.draft_pick where id = p_pick;
  update falm.draft_orden set completado = false
   where draft_id = v_pick.draft_id and orden_global = v_pick.orden_seleccion;
  update falm.draft set estado = 'EN_CURSO'
   where id = v_pick.draft_id and estado = 'COMPLETADO';
  return falm.draft_estado(v_pick.draft_id);
end $function$;

grant execute on function falm.draft_pick_corregir(uuid, uuid) to authenticated;
grant execute on function falm.draft_pick_anular(uuid) to authenticated;
revoke execute on function falm.draft_pick_corregir(uuid, uuid) from public, anon;
revoke execute on function falm.draft_pick_anular(uuid) from public, anon;
