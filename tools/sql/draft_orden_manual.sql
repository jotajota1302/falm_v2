-- Orden del draft elegido a mano.
--
-- El sorteo se hace físicamente en directo (bolas), así que el admin necesita
-- meter el orden en que van saliendo los equipos en vez de que lo sortee la BD.
-- Se mantiene el sorteo aleatorio como opción: draft_crear sin p_orden se
-- comporta igual que antes.
--
-- Se sustituye la firma de 3 argumentos por una de 4 (el cuarto con default)
-- para que las llamadas existentes de 3 sigan resolviendo aquí y no a una
-- sobrecarga antigua.

-- Generación de la serpiente a partir de un orden dado. Interna: la usan
-- draft_crear y draft_reordenar para no duplicar la lógica de rondas.
create or replace function falm.draft_generar_orden(
  p_draft uuid, p_orden uuid[], p_rondas integer
) returns void
language plpgsql
security definer
set search_path to 'public', 'falm'
as $function$
declare v_n int := coalesce(array_length(p_orden, 1), 0);
begin
  if v_n = 0 then raise exception 'El orden está vacío'; end if;

  delete from falm.draft_orden where draft_id = p_draft;

  insert into falm.draft_orden(draft_id, equipo_falm_id, ronda, posicion_en_ronda, orden_global)
  select p_draft,
         case when r % 2 = 1 then p_orden[p] else p_orden[v_n - p + 1] end,
         r, p, (r - 1) * v_n + p
  from generate_series(1, p_rondas) r, generate_series(1, v_n) p;
end $function$;

-- Valida que un orden sea una permutación exacta de los equipos de la temporada.
create or replace function falm.draft_validar_orden(p_temporada uuid, p_orden uuid[])
returns void
language plpgsql
security definer
set search_path to 'public', 'falm'
as $function$
declare v_equipos int;
begin
  select count(*) into v_equipos from falm.equipo_falm where temporada_id = p_temporada;

  if coalesce(array_length(p_orden, 1), 0) <> v_equipos then
    raise exception 'El orden debe tener los % equipos de la temporada (recibidos %)',
      v_equipos, coalesce(array_length(p_orden, 1), 0);
  end if;

  if exists (select 1 from unnest(p_orden) x group by x having count(*) > 1) then
    raise exception 'Hay equipos repetidos en el orden';
  end if;

  if exists (
    select 1 from unnest(p_orden) x
     where not exists (select 1 from falm.equipo_falm e
                        where e.id = x and e.temporada_id = p_temporada)
  ) then
    raise exception 'Hay equipos en el orden que no son de esta temporada';
  end if;
end $function$;

drop function if exists falm.draft_crear(uuid, text, integer);

create or replace function falm.draft_crear(
  p_temporada uuid,
  p_nombre text,
  p_rondas integer default 23,
  p_orden uuid[] default null
) returns uuid
language plpgsql
security definer
set search_path to 'public', 'falm'
as $function$
declare v_id uuid; v_orden uuid[];
begin
  if exists (select 1 from falm.draft
              where temporada_id = p_temporada and estado in ('CREADO','EN_CURSO','COMPLETADO')) then
    raise exception 'Ya hay un draft activo (no consolidado) en esta temporada';
  end if;

  if p_orden is null then
    -- Sin orden dado: sorteo aleatorio, como siempre.
    select array_agg(id order by random()) into v_orden
      from falm.equipo_falm where temporada_id = p_temporada;
  else
    perform falm.draft_validar_orden(p_temporada, p_orden);
    v_orden := p_orden;
  end if;

  if coalesce(array_length(v_orden, 1), 0) = 0 then
    raise exception 'La temporada no tiene equipos';
  end if;

  insert into falm.draft(temporada_id, nombre, total_rondas, estado)
    values (p_temporada, p_nombre, p_rondas, 'CREADO') returning id into v_id;

  perform falm.draft_generar_orden(v_id, v_orden, p_rondas);
  return v_id;
end $function$;

-- Rehacer el orden de un draft ya creado, mientras no se haya elegido a nadie.
-- Para cuando el admin se equivoca metiendo el sorteo.
create or replace function falm.draft_reordenar(p_draft uuid, p_orden uuid[])
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'falm'
as $function$
declare v_temporada uuid; v_rondas int; v_estado falm.draft_estado; v_picks int;
begin
  if auth.uid() is not null and not falm.es_gestor() then
    raise exception 'Solo un administrador puede rehacer el orden';
  end if;

  select temporada_id, total_rondas, estado
    into v_temporada, v_rondas, v_estado
    from falm.draft where id = p_draft;
  if v_temporada is null then raise exception 'Draft no encontrado'; end if;
  if v_estado not in ('CREADO','EN_CURSO') then
    raise exception 'El draft no está en curso';
  end if;

  select count(*) into v_picks from falm.draft_pick where draft_id = p_draft;
  if v_picks > 0 then
    raise exception 'Ya hay % picks: no se puede cambiar el orden', v_picks;
  end if;

  perform falm.draft_validar_orden(v_temporada, p_orden);
  perform falm.draft_generar_orden(p_draft, p_orden, v_rondas);
  update falm.draft set estado = 'CREADO' where id = p_draft and estado = 'EN_CURSO';
  return falm.draft_estado(p_draft);
end $function$;

grant execute on function falm.draft_crear(uuid, text, integer, uuid[]) to authenticated;
grant execute on function falm.draft_reordenar(uuid, uuid[]) to authenticated;
