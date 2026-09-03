-- Login por nombre de equipo, tolerante.
--
-- email_de_equipo comparaba exacto (ef.nombre = p_nombre), asi que "Golden Boys"
-- o "golden boys" no encontraban nada, y el frontend devolvia "Invalid login
-- credentials": el mismo mensaje que una contrasena mala. Resultado: parecia que
-- la contrasena de los demas equipos no funcionaba cuando el problema era el
-- nombre.
--
-- Ahora ignora mayusculas y espacios sobrantes. nombre_de_equipo devuelve el
-- nombre canonico, que el cliente necesita porque "mi equipo" se resuelve
-- comparando ese texto con la base.

create or replace function falm.email_de_equipo(p_nombre text)
returns text
language sql
stable
security definer
set search_path to 'auth', 'public', 'falm'
as $function$
  select u.email
  from falm.equipo_falm ef
  join auth.users u on u.id = ef.usuario_id
  where lower(trim(ef.nombre)) = lower(trim(p_nombre))
    and ef.usuario_id is not null
  limit 1;
$function$;

create or replace function falm.nombre_de_equipo(p_nombre text)
returns text
language sql
stable
security definer
set search_path to 'public', 'falm'
as $function$
  select ef.nombre
  from falm.equipo_falm ef
  where lower(trim(ef.nombre)) = lower(trim(p_nombre))
    and ef.usuario_id is not null
  limit 1;
$function$;

grant execute on function falm.email_de_equipo(text) to anon, authenticated;
grant execute on function falm.nombre_de_equipo(text) to anon, authenticated;
