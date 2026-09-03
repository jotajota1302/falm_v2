-- Intercambios entre equipos.
--
-- Antes esto no funcionaba: aceptar una oferta solo cambiaba el estado a
-- ACEPTADA y los jugadores se quedaban donde estaban, porque la tabla plantilla
-- solo la escribe el admin y no había ningún trigger. Además la política daba
-- ALL al oferente y al receptor, así que uno podía aceptar su propia oferta.
--
-- oferta_responder hace el traspaso de verdad, en una sola transacción, y
-- comprueba por los dos lados las reglas de la temporada: 23 jugadores como
-- tope y el cupo por club (2 en Madrid/Barça/Atleti, 3 en el resto).

create or replace function falm.oferta_responder(p_oferta uuid, p_estado text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'falm'
as $function$
declare
  o falm.oferta_intercambio;
  v_temp uuid;
  v_of int; v_so int;
  v_n_of int; v_n_so int;
  r record;
  c_max constant int := 23;
begin
  select * into o from falm.oferta_intercambio where id = p_oferta for update;
  if o.id is null then raise exception 'Oferta no encontrada'; end if;
  if o.estado <> 'PENDIENTE' then
    raise exception 'Esa oferta ya está %', lower(o.estado::text);
  end if;

  if p_estado not in ('ACEPTADA','RECHAZADA','CANCELADA') then
    raise exception 'Respuesta no válida';
  end if;

  -- Quién puede qué: el receptor acepta o rechaza, el oferente cancela.
  if p_estado in ('ACEPTADA','RECHAZADA') then
    if not (falm.puede_gestionar() or falm.es_mi_equipo(o.equipo_receptor_id)) then
      raise exception 'Solo el equipo que recibe la oferta puede aceptarla o rechazarla';
    end if;
  else
    if not (falm.puede_gestionar() or falm.es_mi_equipo(o.equipo_oferente_id)) then
      raise exception 'Solo quien hizo la oferta puede cancelarla';
    end if;
  end if;

  if p_estado <> 'ACEPTADA' then
    update falm.oferta_intercambio
       set estado = p_estado::falm.estado_oferta, fecha_respuesta = now()
     where id = p_oferta;
    return jsonb_build_object('estado', p_estado, 'movidos', 0);
  end if;

  if o.fecha_expiracion is not null and o.fecha_expiracion < now() then
    raise exception 'Esa oferta ya ha caducado';
  end if;

  select temporada_id into v_temp from falm.equipo_falm where id = o.equipo_oferente_id;

  -- Los activos tienen que seguir donde estaban cuando se hizo la oferta.
  if exists (
    select 1 from falm.oferta_activo oa
     where oa.oferta_id = p_oferta and oa.tipo = 'OFRECIDO'
       and not exists (select 1 from falm.plantilla pl
                        where pl.activo_id = oa.activo_id and pl.fecha_baja is null
                          and pl.equipo_falm_id = o.equipo_oferente_id)
  ) then raise exception 'Alguno de los jugadores ofrecidos ya no está en esa plantilla'; end if;

  if exists (
    select 1 from falm.oferta_activo oa
     where oa.oferta_id = p_oferta and oa.tipo = 'SOLICITADO'
       and not exists (select 1 from falm.plantilla pl
                        where pl.activo_id = oa.activo_id and pl.fecha_baja is null
                          and pl.equipo_falm_id = o.equipo_receptor_id)
  ) then raise exception 'Alguno de los jugadores solicitados ya no está en esa plantilla'; end if;

  select count(*) into v_of from falm.oferta_activo where oferta_id = p_oferta and tipo = 'OFRECIDO';
  select count(*) into v_so from falm.oferta_activo where oferta_id = p_oferta and tipo = 'SOLICITADO';
  if v_of = 0 and v_so = 0 then raise exception 'La oferta no tiene jugadores'; end if;

  -- Tope de plantilla tras el trueque.
  select count(*) into v_n_of from falm.plantilla
   where equipo_falm_id = o.equipo_oferente_id and temporada_id = v_temp and fecha_baja is null;
  select count(*) into v_n_so from falm.plantilla
   where equipo_falm_id = o.equipo_receptor_id and temporada_id = v_temp and fecha_baja is null;

  if v_n_of - v_of + v_so > c_max then
    raise exception 'El equipo que ofrece se quedaría con % jugadores (máximo %)',
      v_n_of - v_of + v_so, c_max;
  end if;
  if v_n_so - v_so + v_of > c_max then
    raise exception 'El equipo que recibe se quedaría con % jugadores (máximo %)',
      v_n_so - v_so + v_of, c_max;
  end if;

  -- Cupo por club tras el trueque, mirando los dos lados.
  for r in
    with mov as (
      select oa.activo_id, falm.club_de_activo(oa.activo_id) club,
             case when oa.tipo = 'OFRECIDO' then o.equipo_receptor_id else o.equipo_oferente_id end destino,
             case when oa.tipo = 'OFRECIDO' then o.equipo_oferente_id else o.equipo_receptor_id end origen
      from falm.oferta_activo oa where oa.oferta_id = p_oferta
    ),
    saldo as (
      select destino equipo, club, count(*) entran from mov group by destino, club
    )
    select s.equipo, s.club, s.entran, el.nombre club_nombre, el.limite_plantilla limite,
           (select count(*) from falm.plantilla pl
             where pl.equipo_falm_id = s.equipo and pl.temporada_id = v_temp and pl.fecha_baja is null
               and falm.club_de_activo(pl.activo_id) = s.club
               and pl.activo_id not in (select activo_id from mov where origen = s.equipo)) ya_tiene
    from saldo s join falm.equipo_lfp el on el.id = s.club
  loop
    if r.ya_tiene + r.entran > r.limite then
      raise exception '% se quedaría con % de % y el máximo por ese club es %',
        (select nombre from falm.equipo_falm where id = r.equipo),
        r.ya_tiene + r.entran, r.club_nombre, r.limite;
    end if;
  end loop;

  -- Traspaso: baja en el origen y alta en el destino, conservando el histórico.
  update falm.plantilla pl set fecha_baja = now()
    from falm.oferta_activo oa
   where oa.oferta_id = p_oferta and pl.activo_id = oa.activo_id and pl.fecha_baja is null
     and pl.equipo_falm_id = case when oa.tipo = 'OFRECIDO'
                                  then o.equipo_oferente_id else o.equipo_receptor_id end;

  insert into falm.plantilla(temporada_id, equipo_falm_id, activo_id, precio, fecha_fichaje)
  select v_temp,
         case when oa.tipo = 'OFRECIDO' then o.equipo_receptor_id else o.equipo_oferente_id end,
         oa.activo_id, coalesce(a.precio_mercado, 0), now()
  from falm.oferta_activo oa
  join falm.activo a on a.id = oa.activo_id
  where oa.oferta_id = p_oferta;

  update falm.oferta_intercambio
     set estado = 'ACEPTADA', fecha_respuesta = now()
   where id = p_oferta;

  return jsonb_build_object('estado', 'ACEPTADA', 'movidos', v_of + v_so);
end $function$;

revoke execute on function falm.oferta_responder(uuid, text) from public;
grant execute on function falm.oferta_responder(uuid, text) to authenticated;

-- El cambio de estado pasa a hacerse solo por la función: así nadie acepta su
-- propia oferta ni salta las comprobaciones con un update directo.
drop policy if exists wr_oferente on falm.oferta_intercambio;
drop policy if exists ins_oferente on falm.oferta_intercambio;
drop policy if exists upd_admin on falm.oferta_intercambio;
drop policy if exists del_oferente on falm.oferta_intercambio;
create policy ins_oferente on falm.oferta_intercambio for insert to authenticated
  with check (falm.es_mi_equipo(equipo_oferente_id) or falm.es_admin());
create policy upd_admin on falm.oferta_intercambio for update to authenticated
  using (falm.es_admin()) with check (falm.es_admin());
create policy del_oferente on falm.oferta_intercambio for delete to authenticated
  using (falm.es_mi_equipo(equipo_oferente_id) or falm.es_admin());
