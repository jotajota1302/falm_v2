-- Leer las puntuaciones de una jornada desde el panel de administracion.
--
-- El circuito normal es automatico: el cron falm-procesar-jornada mira cada hora
-- si hay una jornada terminada (ultimo partido + 3 h) y sin puntuar, y si la hay
-- refresca marcadores, scrapea, puntua y recalcula la clasificacion. Solo mira
-- jornadas mapeadas a una jornada FALM, que esta temporada son las de LaLiga
-- 5 a 36; por eso las cuatro primeras no las procesa nunca, y esta bien asi.
--
-- Esto añade el "hazlo ahora" para cuando el cron falle o haya que releer una
-- jornada porque la prensa cambio una valoracion.
--
-- De paso se cerraron tres cosas que estaban abiertas:
--
--   1. ingestar_jornada_ff estaba concedida a authenticated SIN guardia de rol,
--      asi que cualquiera con sesion podia lanzarla (y disparar un scrape de
--      5 MB contra futbolfantasy). Ahora es SECURITY DEFINER con
--      falm.puede_gestionar().
--   2. recalcular_clasificacion (SECURITY DEFINER) tenia EXECUTE para PUBLIC y
--      su guardia usaba el patron viejo:
--          if auth.uid() is not null and not es_gestor() and ...
--      Sin sesion, auth.uid() es null, no entraba en el if y recalculaba la
--      temporada activa igual. Comprobado por HTTP con la clave publica: antes
--      respondia, ahora da 42501.
--   3. Las internas del pipeline (ingestar_jornada_cruda, ingestar_puntuaciones,
--      procesar_jornada_completa, procesar_jornada_auto, parsear_jornada_ff)
--      tenian el EXECUTE de PUBLIC que Postgres pone de fabrica.
--
-- Y el año pasa a resolverlo el servidor: es el de FIN de temporada (2027 para
-- la 2026-27) y sale de temporada.anio_scrape. Pasarlo a mano ya costo una
-- ingesta entera de la temporada anterior, con Griezmann y Carvajal incluidos.

-- ---------------------------------------------------------------------------
-- Estado de las jornadas, para el selector del panel
-- ---------------------------------------------------------------------------
create or replace function falm.estado_jornadas_lfp()
returns table(numero integer, fecha date, partidos integer, con_marcador integer,
              puntuaciones integer, en_liga_falm boolean)
language plpgsql
stable
security definer
set search_path to 'public', 'falm'
as $function$
declare v_temp uuid;
begin
  if not falm.puede_gestionar() then
    raise exception 'Solo un administrador puede ver el estado de las jornadas';
  end if;
  select id into v_temp from falm.temporada where activa order by created_at desc limit 1;

  return query
  select jl.numero,
         min(pl.fecha)::date,
         count(pl.id)::int,
         count(pl.goles_local)::int,
         (select count(*)::int from falm.puntuacion p where p.jornada_lfp_id = jl.id),
         exists (select 1 from falm.mapeo_jornada mj where mj.jornada_lfp_id = jl.id)
    from falm.jornada_lfp jl
    left join falm.partido_lfp pl on pl.jornada_lfp_id = jl.id
   where jl.temporada_id = v_temp
   group by jl.id, jl.numero
   order by jl.numero;
end $function$;

-- ---------------------------------------------------------------------------
-- La guardia de la clasificacion, con el patron de la casa: denegar salvo
-- prueba de lo contrario. Las temporadas de simulacion siguen abiertas, que la
-- app las recalcula al guardar una alineacion.
-- ---------------------------------------------------------------------------
create or replace function falm.recalcular_clasificacion_guardia(p_temp uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'falm'
as $function$
begin
  if exists (select 1 from falm.temporada where id = p_temp and activa)
     and not falm.puede_gestionar() then
    raise exception 'Solo un administrador puede recalcular la temporada activa';
  end if;
end $function$;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
grant execute on function falm.estado_jornadas_lfp() to authenticated;
revoke execute on function falm.estado_jornadas_lfp() from public, anon;

grant execute on function falm.ingestar_jornada_ff(integer, integer, uuid, boolean) to authenticated;
revoke execute on function falm.ingestar_jornada_ff(integer, integer, uuid, boolean) from public, anon;

grant execute on function falm.recalcular_clasificacion(uuid) to authenticated;
revoke execute on function falm.recalcular_clasificacion(uuid) from public, anon;

revoke execute on function falm.recalcular_clasificacion_guardia(uuid) from public, anon, authenticated;
revoke execute on function falm.ingestar_jornada_cruda(uuid, jsonb, boolean) from public, anon, authenticated;
revoke execute on function falm.ingestar_puntuaciones(uuid, jsonb, boolean) from public, anon, authenticated;
revoke execute on function falm.procesar_jornada_completa(integer, integer, uuid, boolean) from public, anon, authenticated;
revoke execute on function falm.procesar_jornada_auto() from public, anon, authenticated;
revoke execute on function falm.parsear_jornada_ff(integer, integer) from public, anon, authenticated;
revoke execute on function falm.jornadas_lfp_validas() from anon;

-- Comprobacion por HTTP con la clave publica (sin sesion): las tres tienen que
-- responder 42501 permission denied.
--
--   curl -s -X POST ".../rest/v1/rpc/ingestar_jornada_ff" \
--     -H "apikey: <anon>" -H "Content-Profile: falm" \
--     -H "Content-Type: application/json" -d '{"p_jornada":3}'
