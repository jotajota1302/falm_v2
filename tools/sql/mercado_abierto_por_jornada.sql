-- Cada jornada dice si admite fichajes.
-- Aplicado el 2026-09-08.
--
-- Hasta ahora nada impedia pedir un fichaje en una jornada sin mercado: la
-- pantalla estaba abierta desde el primer dia y el gestor solo se enteraba
-- si miraba. En la jornada 1, que no tenia mercado, se colaron cuatro
-- peticiones de un equipo y hubo que rechazarlas a mano.
--
-- La fecha de apertura no estaba escrita en ninguna parte: vivia en la cabeza
-- del gestor. Ahora es una columna de la jornada, asi que se puede abrir y
-- cerrar el mercado jornada a jornada desde Admin sin tocar codigo -util
-- tambien para un parón o para cerrar una jornada suelta-.
--
-- Se protege en la base y no solo en la pantalla, porque la pantalla se puede
-- saltar: la tabla peticion_fichaje la escribe el propio equipo via RLS.

alter table falm.jornada_falm
  add column if not exists admite_fichajes boolean not null default true;

comment on column falm.jornada_falm.admite_fichajes is
  'Si esta jornada admite peticiones de fichaje. Lo cierra un trigger, no solo la pantalla.';

-- El arranque de la liga 2026-27: las dos primeras sin mercado. La 1 se jugo
-- el 11/09 y la 2 el 15/09; el mercado abre con la 3, que cierra el 18/09.
update falm.jornada_falm jf
   set admite_fichajes = false
  from falm.competicion c
 where c.id = jf.competicion_id
   and c.tipo = 'LIGA'
   and c.temporada_id = (select id from falm.temporada where activa)
   and jf.numero in (1, 2);

-- ---------------------------------------------------------------------------
-- La puerta: una peticion a una jornada cerrada no entra.
--
-- Es un trigger y no un check porque el motivo tiene que poder explicarse: el
-- equipo ve el mensaje en su pantalla, y "viola la restriccion tal" no dice
-- nada. El gestor sigue pudiendo meter una a mano si hace falta.
-- ---------------------------------------------------------------------------
create or replace function falm.peticion_solo_con_mercado()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'falm'
as $function$
declare v_abre boolean; v_num int;
begin
  if falm.puede_gestionar() then
    return new;
  end if;

  select jf.admite_fichajes, jf.numero into v_abre, v_num
    from falm.jornada_falm jf where jf.id = new.jornada_objetivo_id;

  if v_abre is false then
    raise exception 'La jornada % no admite fichajes: el mercado todavia no esta abierto.', v_num
      using errcode = 'check_violation';
  end if;
  return new;
end $function$;

drop trigger if exists peticion_solo_con_mercado on falm.peticion_fichaje;
create trigger peticion_solo_con_mercado
  before insert on falm.peticion_fichaje
  for each row execute function falm.peticion_solo_con_mercado();

-- ---------------------------------------------------------------------------
-- Y el reparto tampoco reparte en una jornada cerrada.
--
-- Con el trigger puesto no deberia haber peticiones ahi, pero puede haberlas
-- de antes de esta migracion, o metidas por el gestor. Se cierran diciendo
-- por que, en vez de concederlas.
-- ---------------------------------------------------------------------------
create or replace function falm.procesar_fichajes(p_jornada uuid)
returns integer
language plpgsql
security definer
set search_path to 'public', 'falm'
as $function$
declare
  v_temporada uuid; v_num int; v_comp uuid; v_prioridad int; v_abre boolean;
  r_activo record; r_sol record; v_precio numeric; v_fichados int := 0;
  v_club uuid; v_limite int;
  c_max_plantilla constant int := 23;
begin
  if not falm.puede_gestionar() then
    raise exception 'Solo un administrador puede procesar los fichajes';
  end if;

  select jf.numero, jf.admite_fichajes, c.id, c.temporada_id
    into v_num, v_abre, v_comp, v_temporada
    from falm.jornada_falm jf join falm.competicion c on c.id = jf.competicion_id
   where jf.id = p_jornada;

  -- Jornada sin mercado: no se reparte nada y lo que hubiera queda explicado.
  if v_abre is false then
    update falm.peticion_fichaje
       set estado = 'RECHAZADA', fecha_procesamiento = now(),
           observaciones = format('La jornada %s no admitia fichajes.', v_num)
     where jornada_objetivo_id = p_jornada and estado = 'PENDIENTE';
    return 0;
  end if;

  -- Una peticion viva por equipo: si mando varias, vale la ultima. El id
  -- desempata las que caen en el mismo instante, que tambien pasa: un doble
  -- clic en Enviar deja dos con la misma hora y minuto.
  update falm.peticion_fichaje p
     set estado = 'RECHAZADA', fecha_procesamiento = now(),
         observaciones = 'Sustituida por una peticion posterior del mismo equipo'
   where p.jornada_objetivo_id = p_jornada and p.estado = 'PENDIENTE'
     and exists (select 1 from falm.peticion_fichaje q
                  where q.jornada_objetivo_id = p.jornada_objetivo_id
                    and q.equipo_falm_id = p.equipo_falm_id and q.estado = 'PENDIENTE'
                    and (q.fecha_creacion, q.id) > (p.fecha_creacion, p.id));

  for v_prioridad in 1..2 loop
    for r_activo in
      select distinct o.activo_id from falm.peticion_fichaje p
        join falm.peticion_fichaje_opcion o on o.peticion_id = p.id and o.prioridad = v_prioridad
       where p.jornada_objetivo_id = p_jornada and p.estado = 'PENDIENTE' and p.activo_fichado_id is null
    loop
      if exists (select 1 from falm.plantilla where activo_id = r_activo.activo_id
                   and temporada_id = v_temporada and fecha_baja is null) then continue; end if;

      select precio_mercado into v_precio from falm.activo where id = r_activo.activo_id;
      v_club := falm.club_de_activo(r_activo.activo_id);
      select limite_plantilla into v_limite from falm.equipo_lfp where id = v_club;

      for r_sol in
        select p.id as peticion_id, p.equipo_falm_id from falm.peticion_fichaje p
          join falm.peticion_fichaje_opcion o
            on o.peticion_id = p.id and o.prioridad = v_prioridad and o.activo_id = r_activo.activo_id
         where p.jornada_objetivo_id = p_jornada and p.estado = 'PENDIENTE' and p.activo_fichado_id is null
         order by
           (exists (select 1 from falm.peticion_fichaje pa
                      join falm.jornada_falm ja on ja.id = pa.jornada_objetivo_id
                     where pa.equipo_falm_id = p.equipo_falm_id and ja.competicion_id = v_comp
                       and ja.numero = v_num - 1 and pa.activo_fichado_id is not null)),
           coalesce((select vc.puntos_clasificacion from falm.v_clasificacion vc
                      where vc.equipo_falm_id = p.equipo_falm_id and vc.competicion_id = v_comp), 0) asc,
           coalesce((select vc.puntos_favor from falm.v_clasificacion vc
                      where vc.equipo_falm_id = p.equipo_falm_id and vc.competicion_id = v_comp), 0) asc
      loop
        -- Uno por equipo y jornada. Es la regla del mercado, y es lo que
        -- faltaba: sin esto cada peticion suelta se cobraba su jugador.
        if exists (select 1 from falm.peticion_fichaje pf
                    where pf.jornada_objetivo_id = p_jornada
                      and pf.equipo_falm_id = r_sol.equipo_falm_id
                      and pf.activo_fichado_id is not null) then continue; end if;

        if (select count(*) from falm.plantilla where equipo_falm_id = r_sol.equipo_falm_id
              and temporada_id = v_temporada and fecha_baja is null) >= c_max_plantilla then continue; end if;

        if v_club is not null and (
             select count(*) from falm.plantilla pl where pl.equipo_falm_id = r_sol.equipo_falm_id
               and pl.temporada_id = v_temporada and pl.fecha_baja is null
               and falm.club_de_activo(pl.activo_id) = v_club) >= v_limite then continue; end if;

        insert into falm.plantilla (temporada_id, equipo_falm_id, activo_id, precio, fecha_fichaje)
        values (v_temporada, r_sol.equipo_falm_id, r_activo.activo_id, v_precio, now());
        update falm.peticion_fichaje set activo_fichado_id = r_activo.activo_id where id = r_sol.peticion_id;
        v_fichados := v_fichados + 1;
        exit;
      end loop;
    end loop;
  end loop;

  update falm.peticion_fichaje
     set estado = 'PROCESADA', fecha_procesamiento = now(),
         observaciones = case when activo_fichado_id is not null then 'Fichaje realizado'
                              else 'No se pudo realizar ningún fichaje (sin opción disponible, plantilla llena o cupo de club agotado)' end
   where jornada_objetivo_id = p_jornada and estado = 'PENDIENTE';

  return v_fichados;
end $function$;

-- Abrir y cerrar el mercado de una jornada, para el panel de Admin.
create or replace function falm.mercado_jornada(p_jornada uuid, p_abierto boolean)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'falm'
as $function$
begin
  if not falm.puede_gestionar() then
    raise exception 'Solo un administrador puede abrir o cerrar el mercado';
  end if;
  update falm.jornada_falm set admite_fichajes = p_abierto where id = p_jornada;
  return p_abierto;
end $function$;

grant execute on function falm.mercado_jornada(uuid, boolean) to authenticated;
revoke execute on function falm.mercado_jornada(uuid, boolean) from public, anon;
