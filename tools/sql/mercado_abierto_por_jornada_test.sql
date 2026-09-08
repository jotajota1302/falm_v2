-- Casos de "una jornada cerrada no admite fichajes". Se revierte solo: termina
-- lanzando una excepcion a proposito.
-- Pasa si el error empieza por 'TEST OK'; falla si empieza por 'FALLO'.
--
-- Ojo con como esta montado: el trigger exime al gestor, y quien ejecuta esto
-- normalmente ES el gestor (session_user = postgres), asi que sin trampa el
-- insert pasaria siempre y la prueba no probaria nada. Por eso dentro de la
-- transaccion se sustituye falm.puede_gestionar() por una que dice false, para
-- hacerse pasar por un equipo normal; el rollback la devuelve a su sitio. Si
-- otra sesion la llamara mientras tanto se quedaria esperando el lock, no
-- leeria el false: falla cerrado, no abierto.

do $$
declare
  v_temp uuid; v_cerrada uuid; v_abierta uuid; v_eq uuid;
  v_msg text; v_fallos text[] := array[]::text[];
begin
  select id into v_temp from falm.temporada where activa limit 1;

  select jf.id into v_cerrada from falm.jornada_falm jf
    join falm.competicion c on c.id = jf.competicion_id
   where c.temporada_id = v_temp and c.tipo = 'LIGA' and jf.admite_fichajes = false
   order by jf.numero limit 1;

  select jf.id into v_abierta from falm.jornada_falm jf
    join falm.competicion c on c.id = jf.competicion_id
   where c.temporada_id = v_temp and c.tipo = 'LIGA' and jf.admite_fichajes
   order by jf.numero limit 1;

  select id into v_eq from falm.equipo_falm where temporada_id = v_temp limit 1;

  if v_cerrada is null or v_abierta is null or v_eq is null then
    raise exception 'FALLO: hacen falta una jornada cerrada, una abierta y un equipo';
  end if;

  -- Hacerse pasar por un equipo normal.
  execute $q$ create or replace function falm.puede_gestionar() returns boolean
              language sql stable as $x$ select false $x$ $q$;

  -- 1. En una jornada cerrada, la peticion no entra, y el motivo se entiende.
  begin
    insert into falm.peticion_fichaje (equipo_falm_id, jornada_objetivo_id, estado)
    values (v_eq, v_cerrada, 'PENDIENTE');
    v_fallos := v_fallos || '1: deja pedir en una jornada cerrada';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg not ilike '%no admite fichajes%' then
      v_fallos := v_fallos || format('1: rebota pero con otro motivo: %s', v_msg);
    end if;
  end;

  -- 2. En una jornada abierta si entra: la puerta no cierra de mas.
  begin
    insert into falm.peticion_fichaje (equipo_falm_id, jornada_objetivo_id, estado)
    values (v_eq, v_abierta, 'PENDIENTE');
  exception when others then
    get stacked diagnostics v_msg = message_text;
    v_fallos := v_fallos || format('2: no deja pedir en una jornada abierta: %s', v_msg);
  end;

  if array_length(v_fallos, 1) > 0 then
    raise exception 'FALLO: %', array_to_string(v_fallos, ' | ');
  end if;
  raise exception 'TEST OK: 2 casos (jornada cerrada rebota, jornada abierta admite)';
end $$;
