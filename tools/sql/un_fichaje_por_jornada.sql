-- Un fichaje por equipo y jornada, y la peticion que vale es la ultima.
-- Aplicado el 2026-09-08.
--
-- El problema, encontrado con datos reales de la jornada 1: un equipo tenia
-- CUATRO peticiones pendientes -la pantalla de Fichajes no miraba lo que ya
-- habias mandado, asi que cada "Enviar" creaba una nueva en vez de sustituir a
-- la anterior- y procesar_fichajes se las habria concedido casi todas.
--
-- La causa esta en la forma del bucle: recorre JUGADORES PEDIDOS, y por cada
-- uno busca las PETICIONES que lo piden y se lo da a la que gana el desempate.
-- Nada llevaba la cuenta de que ese equipo ya hubiera fichado en esa jornada,
-- asi que cuatro peticiones del mismo equipo pedian cuatro jugadores distintos
-- y se los llevaba todos. Simulado en solo lectura antes de tocar nada: RIVER
-- XAVALEO se habria llevado a Alex Freeman, Job Ochieng y Nathan-Dylan Saliba
-- de una tacada. Los unicos topes que lo habrian frenado eran los 23 de
-- plantilla y el cupo por club, que no es lo que protege esta regla.
--
-- Se arregla en dos sitios, a proposito:
--
--   1. Antes de repartir, las peticiones sobrantes de un mismo equipo se
--      cierran y solo sigue viva la ultima. Es lo que cualquiera espera al
--      volver a mandar el formulario: que sustituya, no que se sume.
--   2. Dentro del reparto, un equipo que ya tiene fichaje en esta jornada se
--      salta. Sobra si el paso 1 hizo su trabajo, pero es la regla de verdad
--      escrita donde se aplica, y aqui se reparten jugadores: mejor que la
--      invariante no dependa de que un update anterior saliera bien.
--
-- Lo demas de la funcion no se toca: las dos pasadas por prioridad, los tres
-- desempates y los topes de plantilla y de club siguen igual.

create or replace function falm.procesar_fichajes(p_jornada uuid)
returns integer
language plpgsql
security definer
set search_path to 'public', 'falm'
as $function$
declare
  v_temporada uuid;
  v_num       int;
  v_comp      uuid;
  v_prioridad int;
  r_activo    record;
  r_sol       record;
  v_precio    numeric;
  v_fichados  int := 0;
  v_club      uuid;
  v_limite    int;
  c_max_plantilla constant int := 23;
begin
  if not falm.puede_gestionar() then
    raise exception 'Solo un administrador puede procesar los fichajes';
  end if;

  select jf.numero, c.id, c.temporada_id
    into v_num, v_comp, v_temporada
    from falm.jornada_falm jf
    join falm.competicion c on c.id = jf.competicion_id
   where jf.id = p_jornada;

  -- (1) Una peticion viva por equipo: si mando varias, vale la ultima.
  --     El id desempata las que caen en el mismo instante, que tambien pasa:
  --     dos de las cuatro reales llevaban la misma hora y minuto, un doble
  --     clic en el boton de enviar.
  update falm.peticion_fichaje p
     set estado = 'RECHAZADA',
         fecha_procesamiento = now(),
         observaciones = 'Sustituida por una peticion posterior del mismo equipo'
   where p.jornada_objetivo_id = p_jornada
     and p.estado = 'PENDIENTE'
     and exists (
       select 1 from falm.peticion_fichaje q
        where q.jornada_objetivo_id = p.jornada_objetivo_id
          and q.equipo_falm_id = p.equipo_falm_id
          and q.estado = 'PENDIENTE'
          and (q.fecha_creacion, q.id) > (p.fecha_creacion, p.id));

  for v_prioridad in 1..2 loop
    for r_activo in
      select distinct o.activo_id
        from falm.peticion_fichaje p
        join falm.peticion_fichaje_opcion o on o.peticion_id = p.id and o.prioridad = v_prioridad
       where p.jornada_objetivo_id = p_jornada
         and p.estado = 'PENDIENTE'
         and p.activo_fichado_id is null
    loop
      if exists (select 1 from falm.plantilla
                  where activo_id = r_activo.activo_id
                    and temporada_id = v_temporada and fecha_baja is null) then
        continue;
      end if;

      select precio_mercado into v_precio from falm.activo where id = r_activo.activo_id;
      v_club := falm.club_de_activo(r_activo.activo_id);
      select limite_plantilla into v_limite from falm.equipo_lfp where id = v_club;

      for r_sol in
        select p.id as peticion_id, p.equipo_falm_id
          from falm.peticion_fichaje p
          join falm.peticion_fichaje_opcion o
            on o.peticion_id = p.id and o.prioridad = v_prioridad and o.activo_id = r_activo.activo_id
         where p.jornada_objetivo_id = p_jornada
           and p.estado = 'PENDIENTE'
           and p.activo_fichado_id is null
         order by
           (exists (select 1 from falm.peticion_fichaje pa
                      join falm.jornada_falm ja on ja.id = pa.jornada_objetivo_id
                     where pa.equipo_falm_id = p.equipo_falm_id
                       and ja.competicion_id = v_comp
                       and ja.numero = v_num - 1
                       and pa.activo_fichado_id is not null)),
           coalesce((select vc.puntos_clasificacion from falm.v_clasificacion vc
                      where vc.equipo_falm_id = p.equipo_falm_id and vc.competicion_id = v_comp), 0) asc,
           coalesce((select vc.puntos_favor from falm.v_clasificacion vc
                      where vc.equipo_falm_id = p.equipo_falm_id and vc.competicion_id = v_comp), 0) asc
      loop
        -- (2) Uno por equipo y jornada. Es la regla del mercado, y es lo que
        --     faltaba: sin esto, cada peticion suelta se cobraba su jugador.
        if exists (select 1 from falm.peticion_fichaje pf
                    where pf.jornada_objetivo_id = p_jornada
                      and pf.equipo_falm_id = r_sol.equipo_falm_id
                      and pf.activo_fichado_id is not null) then
          continue;
        end if;

        -- Plantilla llena: este solicitante no puede, prueba el siguiente.
        if (select count(*) from falm.plantilla
             where equipo_falm_id = r_sol.equipo_falm_id
               and temporada_id = v_temporada and fecha_baja is null) >= c_max_plantilla then
          continue;
        end if;

        -- Cupo de ese club agotado: idem.
        if v_club is not null and (
             select count(*) from falm.plantilla pl
              where pl.equipo_falm_id = r_sol.equipo_falm_id
                and pl.temporada_id = v_temporada and pl.fecha_baja is null
                and falm.club_de_activo(pl.activo_id) = v_club) >= v_limite then
          continue;
        end if;

        insert into falm.plantilla (temporada_id, equipo_falm_id, activo_id, precio, fecha_fichaje)
        values (v_temporada, r_sol.equipo_falm_id, r_activo.activo_id, v_precio, now());

        update falm.peticion_fichaje set activo_fichado_id = r_activo.activo_id
         where id = r_sol.peticion_id;

        v_fichados := v_fichados + 1;
        exit;
      end loop;
    end loop;
  end loop;

  update falm.peticion_fichaje
     set estado = 'PROCESADA',
         fecha_procesamiento = now(),
         observaciones = case when activo_fichado_id is not null
                              then 'Fichaje realizado'
                              else 'No se pudo realizar ningún fichaje (sin opción disponible, plantilla llena o cupo de club agotado)' end
   where jornada_objetivo_id = p_jornada and estado = 'PENDIENTE';

  return v_fichados;
end $function$;
