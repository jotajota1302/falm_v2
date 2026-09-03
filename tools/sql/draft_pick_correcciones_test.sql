-- Verificación de draft_pick_corregir y draft_pick_anular.
--
-- Trabaja sobre el draft en curso de verdad, pero termina lanzando una
-- excepción a propósito, así que todo se revierte: ni los picks ni los turnos
-- ni los límites por club quedan tocados. Repetible.
--
--   PASA  -> termina con el error 'TEST OK: los 8 casos pasaron'
--   FALLA -> termina con un error que empieza por 'FALLO C<n>'
--
-- Solo necesita un draft sin consolidar con al menos un pick. Los picks extra
-- que hacen falta se los monta el propio test en turnos libres.

do $$
declare
  v_draft uuid;
  v_pick falm.draft_pick;
  v_dsp falm.draft_pick;
  v_eq uuid;
  v_libre uuid;
  v_club uuid;
  v_cl_a uuid;
  v_cl_b uuid;
  v_port uuid;
  v_ajeno uuid;
  v_turno int;
  v_ronda int;
  v_n int;
begin
  select id into v_draft from falm.draft
   where estado in ('CREADO','EN_CURSO','COMPLETADO')
   order by created_at desc limit 1;
  if v_draft is null then raise exception 'FALLO C0: no hay ningún draft sin consolidar'; end if;

  select * into v_pick from falm.draft_pick
   where draft_id = v_draft order by orden_seleccion limit 1;
  if v_pick.id is null then raise exception 'FALLO C0: el draft no tiene ni un pick'; end if;
  v_eq := v_pick.equipo_falm_id;

  select l.activo_id into v_libre
    from falm.v_activo_libre l join falm.activo a on a.id = l.activo_id
   where a.tipo <> 'DEFENSA'
     and not exists (select 1 from falm.draft_pick p
                      where p.draft_id = v_draft and p.activo_id = l.activo_id)
   limit 1;
  if v_libre is null then raise exception 'FALLO C0: no hay jugadores de campo libres'; end if;

  -- C1: corregir cambia el jugador y no toca nada más
  perform falm.draft_pick_corregir(v_pick.id, v_libre);
  select * into v_dsp from falm.draft_pick where id = v_pick.id;
  if v_dsp.activo_id <> v_libre then
    raise exception 'FALLO C1: no cambió el jugador';
  end if;
  if v_dsp.equipo_falm_id <> v_pick.equipo_falm_id
     or v_dsp.ronda <> v_pick.ronda
     or v_dsp.orden_seleccion <> v_pick.orden_seleccion then
    raise exception 'FALLO C1: cambió el equipo, la ronda o el turno';
  end if;
  if exists (select 1 from falm.draft_orden
              where draft_id = v_draft and orden_global = v_pick.orden_seleccion
                and not completado) then
    raise exception 'FALLO C1: reabrió el turno, y corregir no debe mover el turno';
  end if;

  -- C2: no se puede corregir hacia un jugador que ya tiene otro
  -- (me monto un pick ajeno en el siguiente turno libre para no depender de
  --  cuántos picks lleve el draft de verdad)
  select o.orden_global, o.ronda into v_turno, v_ronda
    from falm.draft_orden o
   where o.draft_id = v_draft and not o.completado
   order by o.orden_global limit 1;
  select l.activo_id into v_ajeno
    from falm.v_activo_libre l join falm.activo a on a.id = l.activo_id
   where a.tipo <> 'DEFENSA' and l.activo_id <> v_libre
     and not exists (select 1 from falm.draft_pick p
                      where p.draft_id = v_draft and p.activo_id = l.activo_id)
   limit 1;
  insert into falm.draft_pick(draft_id, activo_id, equipo_falm_id, ronda, orden_seleccion)
    values (v_draft, v_ajeno, v_eq, v_ronda, v_turno);
  update falm.draft_orden set completado = true
   where draft_id = v_draft and orden_global = v_turno;

  begin
    perform falm.draft_pick_corregir(v_pick.id, v_ajeno);
    raise exception 'FALLO C2: aceptó un jugador que ya estaba elegido';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
    if position('ya fue elegido' in sqlerrm) = 0 then
      raise exception 'FALLO C2: error inesperado: %', sqlerrm;
    end if;
  end;

  -- C3: corregir al mismo jugador que ya tenía
  begin
    perform falm.draft_pick_corregir(v_pick.id, v_libre);
    raise exception 'FALLO C3: aceptó corregir al mismo jugador';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
    if position('ya es de ese jugador' in sqlerrm) = 0 then
      raise exception 'FALLO C3: error inesperado: %', sqlerrm;
    end if;
  end;

  -- C4: el tope por club se respeta al corregir.
  -- Busco un club con dos activos libres (A y B), le pongo límite 1 y le doy al
  -- equipo el A en el pick ajeno. Corregir el pick hacia B debe rechazarse.
  select falm.club_de_activo(v_ajeno) into v_club;
  if v_club is not null then
    select l.activo_id into v_cl_a
      from falm.v_activo_libre l
     where falm.club_de_activo(l.activo_id) = v_club
       and not exists (select 1 from falm.draft_pick p
                        where p.draft_id = v_draft and p.activo_id = l.activo_id)
     limit 1;
    if v_cl_a is not null then
      update falm.equipo_lfp set limite_plantilla = 1 where id = v_club;
      begin
        perform falm.draft_pick_corregir(v_pick.id, v_cl_a);
        raise exception 'FALLO C4: se saltó el tope por club';
      exception when others then
        if sqlerrm like 'FALLO%' then raise; end if;
        if position('maximo por ese club' in sqlerrm) = 0 then
          raise exception 'FALLO C4: error inesperado: %', sqlerrm;
        end if;
      end;

      -- C5: pero el pick que se corrige no se cuenta a sí mismo. Dejo al equipo
      -- con un solo activo de ese club, y ese activo es justo el que corrijo:
      -- cambiarlo por otro del mismo club deja el total igual, así que pasa.
      delete from falm.draft_pick where draft_id = v_draft and activo_id = v_ajeno;
      update falm.draft_orden set completado = false
       where draft_id = v_draft and orden_global = v_turno;
      perform falm.draft_pick_corregir(v_pick.id, v_cl_a);
      select l.activo_id into v_cl_b
        from falm.v_activo_libre l
       where falm.club_de_activo(l.activo_id) = v_club and l.activo_id <> v_cl_a
         and not exists (select 1 from falm.draft_pick p
                          where p.draft_id = v_draft and p.activo_id = l.activo_id)
       limit 1;
      if v_cl_b is not null then
        perform falm.draft_pick_corregir(v_pick.id, v_cl_b);
        select activo_id into v_cl_a from falm.draft_pick where id = v_pick.id;
        if v_cl_a <> v_cl_b then
          raise exception 'FALLO C5: contó el propio pick dentro del tope de su club';
        end if;
      end if;
    end if;
  end if;

  -- C6: no se puede dejar a un equipo sin margen para las 2 porterías.
  -- Le doy al pick una portería, cierro todos sus turnos y trato de cambiarla
  -- por un jugador de campo.
  select l.activo_id into v_port
    from falm.v_activo_libre l join falm.activo a on a.id = l.activo_id
   where a.tipo = 'DEFENSA'
     and not exists (select 1 from falm.draft_pick p
                      where p.draft_id = v_draft and p.activo_id = l.activo_id)
   limit 1;
  if v_port is null then raise exception 'FALLO C0: no hay porterías libres'; end if;
  perform falm.draft_pick_corregir(v_pick.id, v_port);
  update falm.draft_orden set completado = true
   where draft_id = v_draft and equipo_falm_id = v_eq and not completado;
  begin
    perform falm.draft_pick_corregir(v_pick.id, v_libre);
    raise exception 'FALLO C6: dejó al equipo sin poder llegar a 2 porterías';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
    if position('no llegaria a 2' in sqlerrm) = 0 then
      raise exception 'FALLO C6: error inesperado: %', sqlerrm;
    end if;
  end;

  -- C7: anular borra el pick y reabre su turno
  perform falm.draft_pick_anular(v_pick.id);
  if exists (select 1 from falm.draft_pick where id = v_pick.id) then
    raise exception 'FALLO C7: el pick sigue ahí';
  end if;
  select count(*) into v_n from falm.draft_orden
   where draft_id = v_draft and orden_global = v_pick.orden_seleccion and not completado;
  if v_n <> 1 then
    raise exception 'FALLO C7: no reabrió el turno %', v_pick.orden_seleccion;
  end if;

  -- C8: anular algo que no existe
  begin
    perform falm.draft_pick_anular(gen_random_uuid());
    raise exception 'FALLO C8: anuló un pick inexistente';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
    if position('Pick no encontrado' in sqlerrm) = 0 then
      raise exception 'FALLO C8: error inesperado: %', sqlerrm;
    end if;
  end;

  raise exception 'TEST OK: los 8 casos pasaron';
end $$;
