-- Respaldos del schema falm dentro de la propia base.
--
-- Por que hace falta: el proyecto esta en el plan free de Supabase, y el plan
-- free NO tiene copias de seguridad automaticas (los backups diarios son de
-- Pro). O sea que hasta ahora no habia de donde tirar si alguien borraba algo.
--
-- Que hace: falm.respaldo_crear() copia las 29 tablas de falm a un schema
-- nuevo, bk_falm_<fecha>_<etiqueta>. Ocupa poco (el schema entero son unos
-- 4 MB) y se hace en un segundo, asi que se puede lanzar antes de cualquier
-- operacion gorda: el draft, regenerar el calendario, una carga masiva.
--
-- Que NO cubre: esto vive dentro de la misma base de datos. Protege de un
-- borrado por error, no de perder el proyecto de Supabase. Para eso hace falta
-- un volcado a fichero fuera, con pg_dump --schema=falm.
--
-- Los schemas bk_falm_* no estan expuestos en PostgREST y se les revoca todo a
-- anon y authenticated: son copias sin RLS, y cualquiera con la clave publica
-- podria leerlas enteras si algun dia se expusieran por descuido.

-- ---------------------------------------------------------------------------
-- Las tablas de falm ordenadas para poder insertarlas sin romper claves
-- ajenas: primero las que no dependen de nadie. Si hubiera un ciclo, lo que
-- quede se devuelve al final tal cual.
-- ---------------------------------------------------------------------------
create or replace function falm.tablas_orden_fk()
returns text[]
language plpgsql
stable
security definer
set search_path to 'public', 'falm'
as $function$
declare
  v_pendientes text[];
  v_listas text[] := '{}';
  v_t text;
  v_avance boolean;
begin
  select array_agg(c.relname order by c.relname) into v_pendientes
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'falm' and c.relkind = 'r';

  loop
    exit when coalesce(array_length(v_pendientes, 1), 0) = 0;
    v_avance := false;
    foreach v_t in array v_pendientes loop
      if not exists (
        select 1
          from pg_constraint k
          join pg_class ref on ref.oid = k.confrelid
          join pg_namespace rn on rn.oid = ref.relnamespace
         where k.contype = 'f'
           and k.conrelid = format('falm.%I', v_t)::regclass
           and rn.nspname = 'falm'
           and ref.relname <> v_t
           and not (ref.relname = any(v_listas))
      ) then
        v_listas := v_listas || v_t;
        v_pendientes := array_remove(v_pendientes, v_t);
        v_avance := true;
      end if;
    end loop;
    if not v_avance then
      v_listas := v_listas || v_pendientes;   -- ciclo: van al final
      exit;
    end if;
  end loop;

  return v_listas;
end $function$;

-- ---------------------------------------------------------------------------
-- Que tablas caen si se vacia una: ella y todo lo que la referencia, en
-- cadena. Hace falta porque "truncate x cascade" tambien vacia sus
-- dependientes, y entonces hay que reponerlas todas del mismo respaldo o el
-- resultado queda a medias.
-- ---------------------------------------------------------------------------
create or replace function falm.tablas_dependientes(p_tabla text)
returns text[]
language plpgsql
stable
security definer
set search_path to 'public', 'falm'
as $function$
declare
  v_set text[] := array[p_tabla];
  v_nuevas text[];
begin
  loop
    select coalesce(array_agg(distinct ref.relname), '{}')
      into v_nuevas
      from pg_constraint k
      join pg_class ref on ref.oid = k.conrelid
      join pg_namespace rn on rn.oid = ref.relnamespace
      join pg_class t on t.oid = k.confrelid
      join pg_namespace tn on tn.oid = t.relnamespace
     where k.contype = 'f' and rn.nspname = 'falm' and tn.nspname = 'falm'
       and t.relname = any(v_set)
       and not (ref.relname = any(v_set));
    exit when coalesce(array_length(v_nuevas, 1), 0) = 0;
    v_set := v_set || v_nuevas;
  end loop;
  return v_set;
end $function$;

-- ---------------------------------------------------------------------------
-- Crear un respaldo. La etiqueta es para acordarse de por que se hizo:
--   select falm.respaldo_crear('antes-del-draft');
-- ---------------------------------------------------------------------------
create or replace function falm.respaldo_crear(p_etiqueta text default 'manual')
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'falm'
as $function$
declare
  v_schema text;
  v_base text;
  v_etiq text;
  v_i int := 1;
  v_t text;
  v_n int := 0;
  v_filas bigint := 0;
  v_c bigint;
begin
  if not falm.puede_gestionar() then
    raise exception 'Solo un administrador puede crear un respaldo';
  end if;

  v_etiq := regexp_replace(lower(coalesce(nullif(trim(p_etiqueta), ''), 'manual')),
                           '[^a-z0-9]+', '_', 'g');
  v_etiq := trim(both '_' from v_etiq);
  v_base := left('bk_falm_' || to_char(now() at time zone 'Europe/Madrid', 'YYYYMMDD_HH24MISS')
                 || '_' || v_etiq, 60);

  -- Dos respaldos en el mismo segundo (restaurar hace uno automatico) no deben
  -- chocar: se busca el primer nombre libre.
  v_schema := v_base;
  while exists (select 1 from pg_namespace where nspname = v_schema) loop
    v_i := v_i + 1;
    v_schema := v_base || '_' || v_i;
  end loop;

  execute format('create schema %I', v_schema);
  execute format('revoke all on schema %I from public, anon, authenticated', v_schema);

  foreach v_t in array falm.tablas_orden_fk() loop
    execute format('create table %I.%I as table falm.%I', v_schema, v_t, v_t);
    execute format('select count(*) from %I.%I', v_schema, v_t) into v_c;
    v_n := v_n + 1;
    v_filas := v_filas + v_c;
  end loop;

  execute format('revoke all on all tables in schema %I from public, anon, authenticated', v_schema);
  execute format('comment on schema %I is %L', v_schema,
    'Respaldo de falm ' || to_char(now() at time zone 'Europe/Madrid', 'YYYY-MM-DD HH24:MI')
    || ' (' || v_etiq || ')');

  return jsonb_build_object(
    'schema', v_schema,
    'tablas', v_n,
    'filas', v_filas,
    'tamano', (select pg_size_pretty(coalesce(sum(pg_total_relation_size(c.oid)), 0))
                 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                where n.nspname = v_schema and c.relkind = 'r')
  );
end $function$;

-- ---------------------------------------------------------------------------
-- Que respaldos hay, del mas reciente al mas viejo.
-- ---------------------------------------------------------------------------
create or replace function falm.respaldos()
returns table(schema text, descripcion text, tablas int, filas bigint, tamano text)
language plpgsql
stable
security definer
set search_path to 'public', 'falm'
as $function$
begin
  if not falm.puede_gestionar() then
    raise exception 'Solo un administrador puede ver los respaldos';
  end if;

  return query
  select n.nspname::text,
         coalesce(obj_description(n.oid, 'pg_namespace'), '')::text,
         count(c.oid)::int,
         coalesce(sum(c.reltuples)::bigint, 0),
         pg_size_pretty(coalesce(sum(pg_total_relation_size(c.oid)), 0))
    from pg_namespace n
    left join pg_class c on c.relnamespace = n.oid and c.relkind = 'r'
   where n.nspname like 'bk\_falm\_%'
   group by n.nspname, n.oid
   order by n.nspname desc;
end $function$;

-- ---------------------------------------------------------------------------
-- Borrar un respaldo concreto. Solo acepta nombres bk_falm_*, para que un dedo
-- torcido no se lleve por delante el schema falm de verdad.
-- ---------------------------------------------------------------------------
create or replace function falm.respaldo_borrar(p_schema text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'falm'
as $function$
begin
  if not falm.puede_gestionar() then
    raise exception 'Solo un administrador puede borrar un respaldo';
  end if;
  if p_schema !~ '^bk_falm_[a-z0-9_]+$' then
    raise exception 'Eso no es un respaldo: %', p_schema;
  end if;
  if not exists (select 1 from pg_namespace where nspname = p_schema) then
    raise exception 'No existe el respaldo %', p_schema;
  end if;

  execute format('drop schema %I cascade', p_schema);
  return jsonb_build_object('borrado', p_schema);
end $function$;

-- ---------------------------------------------------------------------------
-- Dejar solo los N respaldos mas recientes. Lo llama el cron diario.
-- ---------------------------------------------------------------------------
create or replace function falm.respaldo_purgar(p_conservar int default 7)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'falm'
as $function$
declare
  v_s text;
  v_borrados text[] := '{}';
begin
  if not falm.puede_gestionar() then
    raise exception 'Solo un administrador puede purgar respaldos';
  end if;
  if p_conservar < 1 then
    raise exception 'Hay que conservar al menos un respaldo';
  end if;

  for v_s in
    select nspname from pg_namespace
     where nspname like 'bk\_falm\_%'
     order by nspname desc
     offset p_conservar
  loop
    execute format('drop schema %I cascade', v_s);
    v_borrados := v_borrados || v_s;
  end loop;

  return jsonb_build_object('borrados', v_borrados,
                            'quedan', (select count(*) from pg_namespace
                                        where nspname like 'bk\_falm\_%'));
end $function$;

-- ---------------------------------------------------------------------------
-- Restaurar. Dos modos:
--   una tabla:  falm.respaldo_restaurar('bk_falm_...', 'enfrentamiento', true)
--   todo:       falm.respaldo_restaurar('bk_falm_...', null, true)
--
-- Hay que pasar p_confirmar := true a proposito: esto machaca datos vivos.
-- Antes de tocar nada se hace un respaldo automatico del estado actual, para
-- poder deshacer la restauracion si resulta que el respaldo elegido no era el
-- que se creia. Solo se copian las columnas que existen en los dos lados, asi
-- que un respaldo de antes de un cambio de esquema sigue sirviendo.
-- ---------------------------------------------------------------------------
create or replace function falm.respaldo_restaurar(p_schema text,
                                                   p_tabla text default null,
                                                   p_confirmar boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'falm'
as $function$
declare
  v_orden text[];
  v_afectadas text[];
  v_t text;
  v_cols text;
  v_previo jsonb;
  v_lista text[] := '{}';
  v_saltadas text[] := '{}';
  v_filas bigint := 0;
  v_c bigint;
begin
  if not falm.puede_gestionar() then
    raise exception 'Solo un administrador puede restaurar un respaldo';
  end if;
  if p_schema !~ '^bk_falm_[a-z0-9_]+$' then
    raise exception 'Eso no es un respaldo: %', p_schema;
  end if;
  if not exists (select 1 from pg_namespace where nspname = p_schema) then
    raise exception 'No existe el respaldo %', p_schema;
  end if;
  if not p_confirmar then
    raise exception 'Restaurar machaca los datos actuales: hay que llamarlo con p_confirmar := true';
  end if;

  -- Red debajo de la red: si el respaldo elegido no era el bueno, aqui queda
  -- el estado de justo antes de restaurar.
  v_previo := falm.respaldo_crear('antes_de_restaurar');

  if p_tabla is not null then
    if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = p_schema and c.relname = p_tabla and c.relkind = 'r') then
      raise exception 'El respaldo % no tiene la tabla %', p_schema, p_tabla;
    end if;
    -- La tabla y todo lo que cuelga de ella: el cascade las vacia igualmente,
    -- asi que se reponen todas y el resultado queda coherente.
    v_afectadas := falm.tablas_dependientes(p_tabla);
    v_orden := array(select t from unnest(falm.tablas_orden_fk()) as t
                      where t = any(v_afectadas));
  else
    v_orden := falm.tablas_orden_fk();
  end if;

  -- Vaciar de una sola vez: asi da igual el orden de las claves ajenas.
  execute (select 'truncate ' || string_agg(format('falm.%I', t), ', ') || ' cascade'
             from unnest(v_orden) as t);

  foreach v_t in array v_orden loop
    if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = p_schema and c.relname = v_t and c.relkind = 'r') then
      v_saltadas := v_saltadas || v_t;    -- tabla nueva, el respaldo es anterior
      continue;
    end if;

    select string_agg(quote_ident(b.column_name), ', ' order by a.ordinal_position)
      into v_cols
      from information_schema.columns a
      join information_schema.columns b
        on b.table_schema = p_schema and b.table_name = v_t and b.column_name = a.column_name
     where a.table_schema = 'falm' and a.table_name = v_t;

    if v_cols is null then
      v_saltadas := v_saltadas || v_t;
      continue;
    end if;

    execute format('insert into falm.%I (%s) select %s from %I.%I',
                   v_t, v_cols, v_cols, p_schema, v_t);
    get diagnostics v_c = row_count;
    v_lista := v_lista || v_t;
    v_filas := v_filas + v_c;
  end loop;

  return jsonb_build_object(
    'restaurado_de', p_schema,
    'tablas', v_lista,
    'saltadas', v_saltadas,
    'filas', v_filas,
    'respaldo_previo', v_previo->>'schema'
  );
end $function$;

-- ---------------------------------------------------------------------------
-- Permisos. La guardia esta dentro de cada funcion (puede_gestionar), pero el
-- orden de la casa es que anon no vea ni la firma.
-- ---------------------------------------------------------------------------
grant execute on function falm.respaldo_crear(text) to authenticated;
grant execute on function falm.respaldos() to authenticated;
grant execute on function falm.respaldo_borrar(text) to authenticated;
grant execute on function falm.respaldo_purgar(int) to authenticated;
grant execute on function falm.respaldo_restaurar(text, text, boolean) to authenticated;

revoke execute on function falm.respaldo_crear(text) from public, anon;
revoke execute on function falm.respaldos() from public, anon;
revoke execute on function falm.respaldo_borrar(text) from public, anon;
revoke execute on function falm.respaldo_purgar(int) from public, anon;
revoke execute on function falm.respaldo_restaurar(text, text, boolean) from public, anon;
revoke execute on function falm.tablas_orden_fk() from public, anon, authenticated;
revoke execute on function falm.tablas_dependientes(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Respaldo diario a las 04:15 (hora del servidor, UTC), conservando 7 dias.
-- Siete copias son unos 28 MB: el plan free da 500 MB y ahora se usan 36.
-- ---------------------------------------------------------------------------
select cron.unschedule('falm-respaldo-diario')
 where exists (select 1 from cron.job where jobname = 'falm-respaldo-diario');

select cron.schedule('falm-respaldo-diario', '15 4 * * *',
  $cron$select falm.respaldo_crear('diario'); select falm.respaldo_purgar(7);$cron$);
