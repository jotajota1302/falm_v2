-- Calendario de LaLiga 2026/27: partidos, fechas de jornada y cierre de alineaciones.
-- Aplicado el 2026-09-03 (migraciones calendario_lfp_partidos_y_fechas +
-- cierre_jornada_ignora_partidos_adelantados + cierre_jornada_mediana_discreta).
--
-- Fuente: football-data.org, contrastada contra el calendario de futbolfantasy:
-- las 38 jornadas coinciden partido a partido (380) y los 30 resultados ya jugados
-- coinciden en marcador. La numeracion de jornada es la misma que usa /laliga/puntos/2027/N.
--
-- Ojo: LaLiga solo publica horarios con 2-3 semanas de antelacion. Los partidos aun sin
-- hora llegan como 00:00 UTC y quedan con horario_confirmado = false; basta con relanzar
-- falm.refrescar_calendario_fd('<token>') cada semana para ir fijandolos.

create table if not exists falm.partido_lfp (
  id                 uuid primary key default gen_random_uuid(),
  ext_id             integer not null unique,          -- id del partido en football-data
  jornada_lfp_id     uuid references falm.jornada_lfp(id) on delete cascade,
  numero_jornada     integer not null,
  local_id           uuid not null references falm.equipo_lfp(id),
  visitante_id       uuid not null references falm.equipo_lfp(id),
  fecha              timestamptz not null,
  horario_confirmado boolean not null default false,
  estado             text,
  goles_local        integer,
  goles_visitante    integer,
  actualizado_en     timestamptz not null default now()
);

create index if not exists partido_lfp_jornada_ix on falm.partido_lfp (numero_jornada);
create index if not exists partido_lfp_fecha_ix   on falm.partido_lfp (fecha);

alter table falm.partido_lfp enable row level security;
drop policy if exists sel_auth on falm.partido_lfp;
create policy sel_auth on falm.partido_lfp for select to authenticated using (true);
drop policy if exists wr_admin on falm.partido_lfp;
create policy wr_admin on falm.partido_lfp for all to authenticated using (falm.es_admin());

alter table falm.jornada_lfp add column if not exists fecha_inicio timestamptz;
alter table falm.jornada_lfp add column if not exists fecha_fin    timestamptz;

create or replace function falm.refrescar_calendario_fd(p_token text, p_season integer default 2026)
returns jsonb
language plpgsql
as $function$
-- Descarga el calendario de football-data a falm.partido_lfp y recalcula:
--   jornada_lfp.fecha_inicio / fecha_fin  = primer y ultimo partido de la jornada
--   jornada_falm.fecha_cierre             = primer partido del BLOQUE PRINCIPAL
-- El bloque principal descarta adelantados y aplazados (mas de 4 dias de la mediana):
-- la jornada 6 de 2026/27 tiene un partido el 03/09 y el resto el 15-17/09, y sin este
-- filtro falm.jornada_objetivo_actual() apuntaba a la jornada 6 estando en juego la 4.
declare
  v_api  jsonb;
  v_part int;
  v_jor  int;
  v_cie  int;
begin
  set local statement_timeout to '120s';
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '30000');

  v_api := (extensions.http(('GET',
      'https://api.football-data.org/v4/competitions/PD/matches?season=' || p_season,
      array[extensions.http_header('X-Auth-Token', p_token)],
      null, null)::extensions.http_request)).content::jsonb;

  if v_api->'matches' is null then
    raise exception 'football-data no devolvio partidos: %', left(v_api::text, 200);
  end if;

  with m as (select jsonb_array_elements(v_api->'matches') p),
  datos as (
    select (p->>'id')::int                                   as ext_id,
           (p->>'matchday')::int                             as numero,
           (p->'homeTeam'->>'id')::int                       as local_ext,
           (p->'awayTeam'->>'id')::int                       as visit_ext,
           (p->>'utcDate')::timestamptz                      as fecha,
           p->>'status'                                      as estado,
           nullif(p->'score'->'fullTime'->>'home','')::int   as gl,
           nullif(p->'score'->'fullTime'->>'away','')::int   as gv
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
     and c.cierre is not null;
  get diagnostics v_cie = row_count;

  return jsonb_build_object('fuente','football-data','partidos',v_part,
    'jornadas_fechadas',v_jor,'jornadas_falm_actualizadas',v_cie,
    'sin_horario',(select count(*) from falm.partido_lfp where not horario_confirmado));
end $function$;

-- Carga / refresco:
--   select falm.refrescar_calendario_fd('<token de football-data.org>');
