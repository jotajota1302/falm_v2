-- El acta del reparto semanal: que pidio cada uno, que se llevo y por que.
--
-- Pedido el 2026-09-16: al aplicar el reparto tiene que salir en Inicio una
-- nota de prensa para todos, y en Fichajes un historico por jornada. No basta
-- con "X ficha a Y": hay que ver lo que habia pedido cada equipo y como se
-- resolvieron los jugadores que pidio mas de uno, con el criterio a la vista.
--
-- No guarda nada nuevo: la peticion ya sabe quien pidio, con que prioridades,
-- que se llevo y a quien solto. El desempate se reconstruye con los mismos
-- datos que usa el reparto -haber fichado la semana anterior, puntos de
-- clasificacion y puntos a favor-, asi que el acta y el reparto no pueden
-- contarse cosas distintas.

begin;

create or replace function falm.acta_fichajes(p_ventana date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'falm'
as $function$
declare v_ventana date; v_out jsonb;
begin
  select coalesce(p_ventana, max(ventana)) into v_ventana
    from falm.peticion_fichaje
   where estado = 'PROCESADA' and fecha_procesamiento is not null
     and coalesce(observaciones, '') not like 'Sustituida%';

  if v_ventana is null then
    return jsonb_build_object('ventana', null, 'equipos', '[]'::jsonb, 'disputas', '[]'::jsonb);
  end if;

  with p as (
    select pf.id, pf.equipo_falm_id, pf.activo_fichado_id, pf.activo_baja_id,
           pf.observaciones, pf.fecha_procesamiento, pf.jornada_objetivo_id,
           ef.nombre as equipo, ef.puntos_clasif, ef.puntos_totales,
           exists (select 1 from falm.peticion_fichaje pa
                    where pa.equipo_falm_id = pf.equipo_falm_id
                      and pa.ventana = v_ventana - 7
                      and pa.activo_fichado_id is not null) as ficho_antes
      from falm.peticion_fichaje pf
      join falm.equipo_falm ef on ef.id = pf.equipo_falm_id
     where pf.ventana = v_ventana and pf.estado = 'PROCESADA'
       and coalesce(pf.observaciones, '') not like 'Sustituida%'
  ),
  eq as (
    select jsonb_agg(jsonb_build_object(
             'equipo', p.equipo,
             'ficho', p.activo_fichado_id is not null,
             'ficha', case when p.activo_fichado_id is not null then to_jsonb(fa) end,
             'baja',  case when p.activo_fichado_id is not null and p.activo_baja_id is not null then to_jsonb(ba) end,
             'pidio', (select jsonb_agg(jsonb_build_object(
                                'prioridad', o.prioridad, 'nombre', na.nombre, 'club', na.club,
                                'suyo', o.activo_id = p.activo_fichado_id) order by o.prioridad)
                         from falm.peticion_fichaje_opcion o
                         cross join lateral falm._nombre_activo(o.activo_id) na
                        where o.peticion_id = p.id),
             'motivo', p.observaciones)
           order by (p.activo_fichado_id is null), p.equipo) as j
      from p
      left join lateral falm._nombre_activo(p.activo_fichado_id) fa on p.activo_fichado_id is not null
      left join lateral falm._nombre_activo(p.activo_baja_id) ba on p.activo_baja_id is not null
  ),
  -- Los jugadores que pidio mas de un equipo: son los que hay que explicar.
  disputados as (
    select o.activo_id
      from p join falm.peticion_fichaje_opcion o on o.peticion_id = p.id
     group by o.activo_id having count(distinct p.equipo_falm_id) > 1
  ),
  dj as (
    select jsonb_agg(jsonb_build_object(
             'jugador', na.nombre, 'club', na.club,
             'se_lo_lleva', (select p3.equipo from p p3 where p3.activo_fichado_id = d.activo_id limit 1),
             'lo_pidieron', (select jsonb_agg(jsonb_build_object(
                                 'equipo', p2.equipo, 'prioridad', o2.prioridad,
                                 'se_lo_lleva', p2.activo_fichado_id = d.activo_id,
                                 'ficho_semana_previa', p2.ficho_antes,
                                 'puntos', p2.puntos_clasif, 'favor', p2.puntos_totales)
                                 order by o2.prioridad, p2.ficho_antes, p2.puntos_clasif, p2.puntos_totales)
                               from p p2
                               join falm.peticion_fichaje_opcion o2
                                 on o2.peticion_id = p2.id and o2.activo_id = d.activo_id))
           order by na.nombre) as j
      from disputados d
      cross join lateral falm._nombre_activo(d.activo_id) na
  )
  select jsonb_build_object(
    'ventana', v_ventana,
    'jornada', (select jf.numero from p join falm.jornada_falm jf on jf.id = p.jornada_objetivo_id limit 1),
    'fecha', (select max(p.fecha_procesamiento) from p),
    'peticiones', (select count(*) from p),
    'fichajes', (select count(*) from p where p.activo_fichado_id is not null),
    'equipos', coalesce((select j from eq), '[]'::jsonb),
    'disputas', coalesce((select j from dj), '[]'::jsonb))
  into v_out;

  return v_out;
end $function$;

-- Las semanas ya repartidas, para el historico de Fichajes.
create or replace function falm.ventanas_fichajes(p_limite integer default 20)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'falm'
as $function$
  select coalesce(jsonb_agg(x order by x.ventana desc), '[]'::jsonb) from (
    select p.ventana,
           max(jf.numero) as jornada,
           max(p.fecha_procesamiento) as fecha,
           count(*) filter (where p.activo_fichado_id is not null) as fichajes,
           count(*) as peticiones
      from falm.peticion_fichaje p
      left join falm.jornada_falm jf on jf.id = p.jornada_objetivo_id
     where p.estado = 'PROCESADA' and p.fecha_procesamiento is not null
       and coalesce(p.observaciones, '') not like 'Sustituida%'
     group by p.ventana
     order by p.ventana desc
     limit greatest(p_limite, 1)) x;
$function$;

revoke all on function falm.acta_fichajes(date) from public;
revoke all on function falm.ventanas_fichajes(integer) from public;
grant execute on function falm.acta_fichajes(date) to authenticated;
grant execute on function falm.ventanas_fichajes(integer) to authenticated;

commit;
