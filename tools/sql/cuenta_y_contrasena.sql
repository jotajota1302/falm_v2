-- Mi cuenta: cambiar la contrasena y dejar un correo de contacto.
-- Aplicado el 2026-09-09.
--
-- De donde venimos: la contrasena de cada equipo es su propio nombre, puesta a
-- mano al crear los usuarios, y los diez correos de auth son falsos
-- (equipo@falm.test, un dominio que no existe). Nadie puede recuperar nada.
--
-- LO QUE NO SE PUEDE HACER, por si alguien lo pide otra vez: enseniar la
-- contrasena en pantalla. Supabase guarda un hash bcrypt, no la contrasena;
-- no hay vuelta atras. Hoy "se ve" solo porque se sabe cual es. Lo que se
-- ofrece en su lugar es cambiarla, que es lo util.
--
-- El correo NO se toca en auth todavia, a proposito. auth.users.email es lo que
-- resuelve el login por nombre de equipo (falm.email_de_equipo), y cambiarlo
-- abre un cambio pendiente de confirmacion en las dos direcciones; sin SMTP
-- propio ese correo no llega y el equipo se queda a medias. Asi que de momento
-- se guarda aparte, como dato de contacto. Cuando haya SMTP se migran a auth
-- con su confirmacion y se enciende el "he olvidado la contrasena".

alter table falm.equipo_falm
  add column if not exists email_contacto text;

comment on column falm.equipo_falm.email_contacto is
  'Correo real de quien lleva el equipo. Todavia no es el de auth.users: sirve '
  'para poder avisarle y para migrarlo cuando haya SMTP y recuperacion por enlace.';

-- ---------------------------------------------------------------------------
-- Cada uno deja (o borra) su correo. Solo el suyo: la funcion no recibe el
-- equipo, lo saca de quien llama.
-- ---------------------------------------------------------------------------
create or replace function falm.guardar_email_contacto(p_email text)
returns text
language plpgsql
security definer
set search_path to 'public', 'falm'
as $function$
declare v_limpio text; v_n int;
begin
  if auth.uid() is null then
    raise exception 'Hay que haber iniciado sesion';
  end if;

  v_limpio := nullif(btrim(coalesce(p_email, '')), '');

  -- Un correo mal escrito no sirve de nada el dia que haya que mandarle algo,
  -- y para entonces ya nadie se acuerda. Se comprueba al guardarlo.
  if v_limpio is not null and v_limpio !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-zA-Z]{2,}$' then
    raise exception 'Ese correo no tiene buena pinta: %', v_limpio;
  end if;

  update falm.equipo_falm
     set email_contacto = lower(v_limpio)
   where usuario_id = auth.uid();

  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'Tu usuario no lleva ningun equipo en esta temporada';
  end if;

  return coalesce(lower(v_limpio), '');
end $function$;

grant execute on function falm.guardar_email_contacto(text) to authenticated;
revoke execute on function falm.guardar_email_contacto(text) from public, anon;

-- ---------------------------------------------------------------------------
-- El gestor le pone a un equipo una contrasena temporal.
--
-- Es la recuperacion de verdad mientras no haya correos: en una liga de diez,
-- quien la pierde te la pide y se la cambias. El hash se hace igual que los que
-- ya hay (bcrypt, que es lo que valida GoTrue).
--
-- No devuelve la contrasena: la escribe quien llama, asi que ya la sabe. Y no
-- se guarda en ningun sitio en claro.
-- ---------------------------------------------------------------------------
create or replace function falm.contrasena_temporal(p_equipo uuid, p_nueva text)
returns text
language plpgsql
security definer
set search_path to 'public', 'falm', 'auth', 'extensions'
as $function$
declare v_usuario uuid; v_nombre text;
begin
  if not falm.puede_gestionar() then
    raise exception 'Solo un administrador puede cambiar la contrasena de un equipo';
  end if;

  -- Corta de verdad: seis es lo minimo que acepta Supabase, y una temporal que
  -- se manda por WhatsApp conviene que no sea trivial.
  if length(coalesce(p_nueva, '')) < 8 then
    raise exception 'La contrasena temporal necesita al menos 8 caracteres';
  end if;

  select ef.usuario_id, ef.nombre into v_usuario, v_nombre
    from falm.equipo_falm ef where ef.id = p_equipo;

  if v_usuario is null then
    raise exception 'Ese equipo no tiene usuario asignado';
  end if;

  update auth.users
     set encrypted_password = extensions.crypt(p_nueva, extensions.gen_salt('bf')),
         updated_at = now()
   where id = v_usuario;

  return v_nombre;
end $function$;

grant execute on function falm.contrasena_temporal(uuid, text) to authenticated;
revoke execute on function falm.contrasena_temporal(uuid, text) from public, anon;
