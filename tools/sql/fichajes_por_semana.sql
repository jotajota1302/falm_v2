-- El fichaje pasa a ser SEMANAL, no de la jornada.
--
-- Como estaba: la peticion colgaba de una jornada y se repartia 12 h antes de
-- su cierre. Con un calendario irregular eso daba ventanas de horas -la jornada
-- 1 acababa el viernes y la 2 cerraba el martes- y ademas la pantalla ni
-- siquiera apuntaba a la jornada que tocaba: `jornadaActualLiga()` devolvia
-- `js[0]`, o sea SIEMPRE la jornada 1, con un comentario que ponia "demo". Como
-- la 1 tiene el mercado cerrado, Fichajes llevaba desde el principio diciendo
-- "el mercado esta cerrado en la jornada 1" pasara lo que pasara.
--
-- Como queda: el mercado esta abierto toda la semana y se reparte el **martes a
-- las 23:59** (Madrid). Lo pedido va a la **primera jornada que se cierre
-- despues de ese martes**, asi que una jornada entre semana que se juegue antes
-- no recibe fichajes: simplemente no le toca ninguna ventana. Y en un paron,
-- varios martes seguidos apuntan a la misma jornada y son fichajes distintos.
--
-- Por eso la unidad pasa a ser la SEMANA (`peticion_fichaje.ventana`): con la
-- jornada como unidad, la regla "un fichaje por equipo y jornada" habria dejado
-- fichar solo en el primero de los tres martes del paron.
--
-- Y como las diez plantillas estan a 23 de 23 desde el draft, sin baja no cabe
-- nadie: la peticion lleva ahora `activo_baja_id` y el cambio se hace de golpe,
-- solo si el fichaje entra. Quien sale lo elige el manager.
--
-- El cron va en UTC: `5 0 * * 3` es el miercoles 00:05 UTC, siempre despues del
-- martes 23:59 de Madrid tanto en verano como en invierno.

begin;

alter table falm.peticion_fichaje add column if not exists ventana date;
-- Con defecto a proposito: mientras la web publicada sea la vieja, manda la
-- peticion sin decir la semana y sin esto saltaria un not-null en produccion.
alter table falm.peticion_fichaje
  alter column ventana set default (falm.cierre_fichajes(now()) at time zone 'Europe/Madrid')::date;
alter table falm.peticion_fichaje add column if not exists activo_baja_id uuid references falm.activo(id);
create index if not exists peticion_fichaje_ventana_idx
  on falm.peticion_fichaje (ventana, equipo_falm_id);

-- El martes 23:59 (Madrid) en el que se procesara lo que se pida ahora. Si hoy
-- es martes y aun no han dado las 23:59, es hoy.
create or replace function falm.cierre_fichajes(p_desde timestamptz default now())
returns timestamptz
language plpgsql
stable
as $function$
declare v_local timestamp; v_mar timestamp;
begin
  v_local := p_desde at time zone 'Europe/Madrid';
  v_mar := date_trunc('day', v_local)
           + (((2 - extract(isodow from v_local)::int) + 7) % 7) * interval '1 day'
           + interval '23 hours 59 minutes';
  if v_mar < v_local then
    v_mar := v_mar + interval '7 days';
  end if;
  return v_mar at time zone 'Europe/Madrid';
end $function$;

-- Hasta cuando se puede pedir y a que jornada ira a parar.
create or replace function falm.ventana_fichajes(p_desde timestamptz default now())
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'falm'
as $function$
declare v_cierre timestamptz; v_temp uuid; r record;
begin
  v_cierre := falm.cierre_fichajes(p_desde);
  select id into v_temp from falm.temporada where activa order by created_at desc limit 1;

  select jf.id, jf.numero, jf.fecha_cierre, jf.admite_fichajes into r
    from falm.jornada_falm jf
    join falm.competicion c on c.id = jf.competicion_id and c.tipo = 'LIGA'
   where c.temporada_id = v_temp and jf.fecha_cierre > v_cierre
   order by jf.fecha_cierre asc limit 1;

  return jsonb_build_object(
    'ventana', (v_cierre at time zone 'Europe/Madrid')::date,
    'cierre', v_cierre,
    'jornada_id', r.id, 'jornada_numero', r.numero,
    'jornada_cierra', r.fecha_cierre,
    'admite_fichajes', coalesce(r.admite_fichajes, false));
end $function$;

revoke all on function falm.ventana_fichajes(timestamptz) from public;
grant execute on function falm.ventana_fichajes(timestamptz) to authenticated;

-- El acta de cada peticion resuelta, para el teletipo de la pantalla. No hace
-- falta guardar nada aparte: la peticion ya sabe quien pidio, que jornada, a
-- quien ficho y a quien solto.
create or replace function falm.noticias_fichajes(p_limite integer default 20)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'falm'
as $function$
  with n as (
    select p.fecha_procesamiento as fecha, p.ventana, jf.numero as jornada,
           ef.nombre as equipo,
           (p.activo_fichado_id is not null) as ficho,
           fa.nombre as ficha_nombre, fa.club as ficha_club,
           fa.foto as ficha_foto, fa.posicion as ficha_pos, fa.precio as ficha_precio,
           ba.nombre as baja_nombre, ba.club as baja_club, ba.posicion as baja_pos
      from falm.peticion_fichaje p
      join falm.equipo_falm ef on ef.id = p.equipo_falm_id
      left join falm.jornada_falm jf on jf.id = p.jornada_objetivo_id
      left join lateral (
        select case when a.tipo='DEFENSA' then 'Portería '||coalesce(el.nombre,'')
                    else trim(jl.nombre||' '||coalesce(jl.apellido,'')) end as nombre,
               coalesce(el.nombre, elj.nombre) as club,
               case when a.tipo='DEFENSA' then null else jl.foto end as foto,
               case when a.tipo='DEFENSA' then 'PORTERO' else jl.posicion::text end as posicion,
               a.precio_mercado as precio
          from falm.activo a
          left join falm.jugador_lfp jl on jl.id = a.jugador_lfp_id
          left join falm.equipo_lfp el on el.id = a.equipo_lfp_id
          left join falm.equipo_lfp elj on elj.id = jl.equipo_lfp_id
         where a.id = p.activo_fichado_id) fa on true
      left join lateral (
        select case when a.tipo='DEFENSA' then 'Portería '||coalesce(el.nombre,'')
                    else trim(jl.nombre||' '||coalesce(jl.apellido,'')) end as nombre,
               coalesce(el.nombre, elj.nombre) as club,
               case when a.tipo='DEFENSA' then 'PORTERO' else jl.posicion::text end as posicion
          from falm.activo a
          left join falm.jugador_lfp jl on jl.id = a.jugador_lfp_id
          left join falm.equipo_lfp el on el.id = a.equipo_lfp_id
          left join falm.equipo_lfp elj on elj.id = jl.equipo_lfp_id
         where a.id = p.activo_baja_id and p.activo_fichado_id is not null) ba on true
     where p.estado = 'PROCESADA' and p.fecha_procesamiento is not null
     order by p.fecha_procesamiento desc, ef.nombre
     limit greatest(p_limite, 1)
  )
  select coalesce(jsonb_agg(to_jsonb(n) order by n.fecha desc, n.equipo), '[]'::jsonb) from n;
$function$;

revoke all on function falm.noticias_fichajes(integer) from public;
grant execute on function falm.noticias_fichajes(integer) to authenticated;

-- Lo que llama el cron cada miercoles de madrugada: la ventana que acaba de
-- cerrar (el martes a las 23:59 de Madrid).
create or replace function falm.procesar_fichajes_semanales()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'falm'
as $function$
declare v_cierre timestamptz; v_ventana date; v_fichados int; v_pendientes int;
begin
  v_cierre := falm.cierre_fichajes(now());
  if v_cierre > now() then
    v_cierre := v_cierre - interval '7 days';
  end if;
  v_ventana := (v_cierre at time zone 'Europe/Madrid')::date;

  select count(*) into v_pendientes
    from falm.peticion_fichaje where ventana = v_ventana and estado = 'PENDIENTE';
  if v_pendientes = 0 then
    return jsonb_build_object('ventana', v_ventana, 'motivo', 'no habia peticiones');
  end if;

  v_fichados := falm.procesar_fichajes_semana(v_ventana);
  return jsonb_build_object('ventana', v_ventana, 'peticiones', v_pendientes, 'fichados', v_fichados);
end $function$;

revoke all on function falm.procesar_fichajes_semanales() from public;

commit;

-- El reparto de la semana. Es procesar_fichajes(uuid) pero por ventana en vez
-- de por jornada, con la baja que haya pedido cada uno. El cuerpo completo esta
-- aplicado en la base; lo que cambia respecto al anterior:
--
--   * `where p.ventana = p_ventana` en todas partes, en vez de
--     `jornada_objetivo_id = p_jornada`.
--   * la jornada se recalcula con falm.ventana_fichajes(), no se fia de lo que
--     se guardara al pedir.
--   * "un fichaje por equipo y SEMANA" (antes por jornada).
--   * el desempate mira si ficho la semana anterior (p_ventana - 7), no la
--     jornada anterior.
--   * antes de fichar: si pidio baja y ese jugador sigue en su plantilla, se le
--     da de baja y se cuenta el hueco -tanto para el tope de 23 como para el
--     cupo por club-. Sin baja valida y con la plantilla llena, no ficha.
--
-- El cron:
--   select cron.schedule('falm-fichajes-semanales', '5 0 * * 3',
--                        'select falm.procesar_fichajes_semanales()');
--
-- Y falm.tareas_previas_jornada deja de repartir fichajes: solo hereda onces.
