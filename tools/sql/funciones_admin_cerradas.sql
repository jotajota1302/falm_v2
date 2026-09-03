-- Cierre de las funciones de administración.
--
-- Cómo estaba: cada función de admin comprobaba
--
--     if auth.uid() is not null and not falm.es_gestor() then raise ...
--
-- o sea, "si hay sesión y no es gestor, error". Una llamada SIN sesión
-- (auth.uid() null) no entraba en el if y seguía adelante. Y las catorce
-- estaban concedidas al rol anon, cuya clave viaja dentro del bundle que se
-- descarga cualquiera que abra la web. Sumando las dos cosas, un tercero podía
-- llamar por HTTP a activar_temporada o a generar_calendario_liga sin ni
-- siquiera entrar en la aplicación.
--
-- Cómo queda: se deniega salvo prueba de lo contrario. La comprobación vive en
-- un único sitio, y el permiso de anon desaparece de todas ellas.
--
-- Aplicado en Supabase el 2026-09-03 (migraciones cerrar_funciones_admin_
-- deny_por_defecto, revocar_anon_en_funciones_admin y cerrar_puede_gestionar_
-- a_public).

-- ---------------------------------------------------------------------------
-- Quién puede administrar. Los automatismos (cron con service_role) y el
-- mantenimiento por SQL directo pasan; si no, hay que ser gestor con sesión.
-- ---------------------------------------------------------------------------
create or replace function falm.puede_gestionar()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'falm'
as $function$
  select coalesce(auth.role(), '') = 'service_role'
      or current_user in ('postgres', 'supabase_admin')
      or (auth.uid() is not null and falm.es_gestor());
$function$;

-- Postgres concede EXECUTE a PUBLIC por defecto, así que hay que revocarlo ahí
-- también: quitárselo solo a anon no sirve de nada, lo hereda igual.
revoke execute on function falm.puede_gestionar() from public;
revoke execute on function falm.puede_gestionar() from anon;
grant execute on function falm.puede_gestionar() to authenticated;

-- ---------------------------------------------------------------------------
-- Guardas: de "si hay sesión y no es gestor, error" a "si no puede, error".
-- ---------------------------------------------------------------------------
do $$
declare r record; def text; nuevo text;
begin
  for r in
    select p.oid, p.oid::regprocedure::text as firma
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'falm' and p.prokind = 'f'
       and pg_get_functiondef(p.oid) like '%is not null and not%'
  loop
    def := pg_get_functiondef(r.oid);
    -- El pick del draft lo hace el dueño del equipo, no solo el gestor.
    nuevo := replace(def,
      'if v_uid is not null and not falm.es_mi_equipo(p_equipo) and not falm.es_gestor() then',
      'if not (falm.puede_gestionar() or falm.es_mi_equipo(p_equipo)) then');
    nuevo := replace(nuevo,
      'if auth.uid() is not null and not falm.es_gestor() then',
      'if not falm.puede_gestionar() then');
    nuevo := replace(nuevo,
      'if v_uid is not null and not falm.es_gestor() then',
      'if not falm.puede_gestionar() then');
    if nuevo <> def then
      execute nuevo;
      raise notice 'guarda corregida en %', r.firma;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Y fuera anon: ninguna operación de administración a su alcance, ni siquiera
-- con la guarda puesta. Defensa en profundidad, no una u otra.
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure::text as firma
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'falm' and p.prokind = 'f'
       and pg_get_functiondef(p.oid) like '%puede_gestionar%'
       and p.proname <> 'puede_gestionar'
  loop
    execute format('revoke execute on function %s from anon', r.firma);
    execute format('revoke execute on function %s from public', r.firma);
    execute format('grant execute on function %s to authenticated', r.firma);
    raise notice 'anon fuera de %', r.firma;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Comprobación: ninguna debe quedar al alcance de anon.
--
--   select p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') as anon
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'falm'
--      and pg_get_functiondef(p.oid) like '%puede_gestionar%';
-- ---------------------------------------------------------------------------
