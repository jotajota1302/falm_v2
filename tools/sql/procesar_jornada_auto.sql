-- Puntuacion automatica: de hora fija a "cuando la jornada ha terminado de verdad".
-- Aplicado el 2026-09-03. Sustituye tambien a la version de falm.refrescar_calendario_fd
-- que hay en tools/sql/calendario_lfp.sql (esta lee el token de Vault).
--
-- Antes: cron lunes y martes a las 7:00 -> falm.procesar_jornada_auto(), que buscaba la
-- jornada cuya jornada FALM ya hubiese CERRADO. Con el calendario real hay jornadas que
-- acaban en jueves (la 2 termina el 17/09) y no se puntuarian hasta el lunes siguiente.
--
-- Ahora: cron cada hora ('25 * * * *'). Se procesa la jornada mas antigua que ya termino
-- (ultimo partido + 3 h) y no tiene puntuaciones. Antes de puntuar refresca los marcadores
-- desde football-data, y solo cuando hay algo pendiente, para no gastar cuota de la API.
-- Si falta algun resultado (partido aplazado) espera, y pasados 3 dias puntua con lo que
-- haya para no dejar la liga colgada.
--
-- El token de football-data esta en Supabase Vault como 'football_data_token', no en el
-- codigo. Se creo asi:
--   select vault.create_secret('<token>', 'football_data_token',
--                              'Token de football-data.org (calendario y marcadores)');

create or replace function falm.refrescar_calendario_fd(p_token text default null, p_season integer default 2026)
returns jsonb
language plpgsql
as $function$
declare v_api jsonb; v_tok text; v_part int; v_jor int; v_cie int; v_blo int;
begin
  set local statement_timeout to '120s';
  v_tok := coalesce(p_token, (select decrypted_secret from vault.decrypted_secrets
                               where name = 'football_data_token'));
  if v_tok is null then
    raise exception 'No hay token de football-data: pasalo por parametro o guardalo en Vault como football_data_token';
  end if;

  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '30000');
  v_api := (extensions.http(('GET',
      'https://api.football-data.org/v4/competitions/PD/matches?season=' || p_season,
      array[extensions.http_header('X-Auth-Token', v_tok)],
      null, null)::extensions.http_request)).content::jsonb;

  if v_api->'matches' is null then
    raise exception 'football-data no devolvio partidos: %', left(v_api::text, 200);
  end if;

  with m as (select jsonb_array_elements(v_api->'matches') p),
  datos as (
    select (p->>'id')::int as ext_id, (p->>'matchday')::int as numero,
           (p->'homeTeam'->>'id')::int as local_ext, (p->'awayTeam'->>'id')::int as visit_ext,
           (p->>'utcDate')::timestamptz as fecha, p->>'status' as estado,
           nullif(p->'score'->'fullTime'->>'home','')::int as gl,
           nullif(p->'score'->'fullTime'->>'away','')::int as gv
    from m
  )
  insert into falm.partido_lfp
    (ext_id, jornada_lfp_id, numero_jornada, local_id, visitante_id, fecha,
     horario_confirmado, estado, goles_local, goles_visitante, actualizado_en)
  select d.ext_id,
         (select jl.id from falm.jornada_lfp jl
            join falm.temporada t on t.id = jl.temporada_id and t.activa
           where jl.numero = d.numero),
         d.numero, el.id, ev.id, d.fecha,
         to_char(d.fecha at time zone 'UTC', 'HH24:MI') <> '00:00',
         d.estado, d.gl, d.gv, now()
  from datos d
  join falm.equipo_lfp el on el.ext_id = d.local_ext
  join falm.equipo_lfp ev on ev.ext_id = d.visit_ext
  on conflict (ext_id) do update set
    jornada_lfp_id = excluded.jornada_lfp_id, numero_jornada = excluded.numero_jornada,
    local_id = excluded.local_id, visitante_id = excluded.visitante_id,
    fecha = excluded.fecha, horario_confirmado = excluded.horario_confirmado,
    estado = excluded.estado, goles_local = excluded.goles_local,
    goles_visitante = excluded.goles_visitante, actualizado_en = now();
  get diagnostics v_part = row_count;

  update falm.jornada_lfp jl
     set fecha_inicio = x.ini, fecha_fin = x.fin
    from (select numero_jornada, min(fecha) ini, max(fecha) fin
            from falm.partido_lfp group by numero_jornada) x
   where jl.numero = x.numero_jornada
     and jl.temporada_id = (select id from falm.temporada where activa);
  get diagnostics v_jor = row_count;

  update falm.jornada_falm jf
     set fecha_cierre = c.cierre
    from falm.mapeo_jornada mj
    join falm.jornada_lfp jl on jl.id = mj.jornada_lfp_id
    join (
      select p.numero_jornada,
             min(p.fecha) filter (
               where abs(extract(epoch from (p.fecha - med.mediana))) <= 4 * 86400
             ) as cierre
        from falm.partido_lfp p
        join (select numero_jornada,
                     percentile_disc(0.5) within group (order by fecha) as mediana
                from falm.partido_lfp group by numero_jornada) med
          on med.numero_jornada = p.numero_jornada
       group by p.numero_jornada
    ) c on c.numero_jornada = jl.numero
   where mj.jornada_falm_id = jf.id
     and c.cierre is not null
     and jf.fecha_cierre is distinct from c.cierre;
  get diagnostics v_cie = row_count;

  v_blo := falm.recalcular_bloqueos();

  return jsonb_build_object('fuente','football-data','partidos',v_part,
    'jornadas_fechadas',v_jor,'jornadas_falm_actualizadas',v_cie,'equipos_bloqueados',v_blo,
    'sin_horario',(select count(*) from falm.partido_lfp where not horario_confirmado));
end $function$;

create or replace function falm.procesar_jornada_auto()
returns jsonb
language plpgsql
as $function$
declare
  v_temp uuid; v_anio int; v_jornada int; v_fin timestamptz;
  v_total int; v_con_marcador int; v_refresco jsonb;
begin
  select id, coalesce(anio_scrape, anio_inicio + 1) into v_temp, v_anio
    from falm.temporada where activa order by created_at desc limit 1;
  if v_temp is null or v_anio is null then
    return jsonb_build_object('procesada', null, 'motivo', 'sin temporada/año');
  end if;

  select jl.numero, jl.fecha_fin into v_jornada, v_fin
  from falm.jornada_lfp jl
  join falm.mapeo_jornada mj on mj.jornada_lfp_id = jl.id
  join falm.jornada_falm jf on jf.id = mj.jornada_falm_id
  join falm.competicion c on c.id = jf.competicion_id and c.tipo = 'LIGA'
  where jl.temporada_id = v_temp
    and jl.fecha_fin is not null
    and jl.fecha_fin + interval '3 hours' <= now()
    and not exists (select 1 from falm.puntuacion p where p.jornada_lfp_id = jl.id)
  order by jl.numero asc
  limit 1;

  if v_jornada is null then
    return jsonb_build_object('procesada', null, 'motivo', 'nada pendiente');
  end if;

  begin
    v_refresco := falm.refrescar_calendario_fd();
  exception when others then
    v_refresco := jsonb_build_object('error', left(SQLERRM, 120));
  end;

  select count(*), count(*) filter (where goles_local is not null)
    into v_total, v_con_marcador
  from falm.partido_lfp where numero_jornada = v_jornada;

  if v_con_marcador < v_total and v_fin + interval '3 days' > now() then
    return jsonb_build_object('procesada', null, 'motivo', 'faltan resultados',
      'jornada', v_jornada, 'con_marcador', v_con_marcador, 'partidos', v_total,
      'refresco', v_refresco);
  end if;

  return falm.procesar_jornada_completa(v_anio, v_jornada, v_temp, false)
         || jsonb_build_object('refresco', v_refresco);
end $function$;

-- Cron aplicado:
--   select cron.unschedule('falm-procesar-jornada');
--   select cron.schedule('falm-procesar-jornada', '25 * * * *',
--                        'select falm.procesar_jornada_auto()');
