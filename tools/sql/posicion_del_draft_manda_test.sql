-- Casos de "la posicion del draft manda". Se revierte solo: termina lanzando
-- una excepcion a proposito, asi que Postgres deshace las posiciones falsas
-- que pone y el refresco que lanza.
-- Pasa si el error empieza por 'TEST OK'; falla si empieza por 'FALLO'.
--
-- Ojo con como esta montado: si se prueba sin trampa, no prueba nada. La web y
-- la base coinciden hoy en todas las posiciones, asi que el refresco no tendria
-- nada que cambiar y pasaria por el motivo equivocado. Por eso el test primero
-- le pone una posicion FALSA a dos jugadores del mismo club -uno fichado y uno
-- libre- y luego mira a cual se la respeta y a cual se la corrige.
--
-- Usa el Real Madrid (ext_id 86) porque siempre tiene de los dos.

do $$
declare
  v_temp uuid; v_fichado uuid; v_libre uuid;
  v_pos_fichado falm.posicion; v_pos_libre falm.posicion;
  v_falsa_f falm.posicion; v_falsa_l falm.posicion;
  v_tras_f falm.posicion; v_tras_l falm.posicion;
  v_madrid constant uuid :=
    extensions.uuid_generate_v5('fa100000-0000-0000-0000-000000000001'::uuid, 'eqlfp:86');
  v_res jsonb; v_fallos text[] := array[]::text[];
begin
  select id into v_temp from falm.temporada where activa;

  select jl.id, jl.posicion into v_fichado, v_pos_fichado
    from falm.jugador_lfp jl
    join falm.activo a on a.jugador_lfp_id = jl.id
    join falm.plantilla pl on pl.activo_id = a.id
     and pl.fecha_baja is null and pl.temporada_id = v_temp
   where jl.equipo_lfp_id = v_madrid and jl.posicion <> 'PORTERO'
   limit 1;

  select jl.id, jl.posicion into v_libre, v_pos_libre
    from falm.jugador_lfp jl
   where jl.equipo_lfp_id = v_madrid and jl.posicion <> 'PORTERO' and jl.slug_ff is not null
     and not exists (
       select 1 from falm.activo a
         join falm.plantilla pl on pl.activo_id = a.id
          and pl.fecha_baja is null and pl.temporada_id = v_temp
        where a.jugador_lfp_id = jl.id)
   limit 1;

  if v_fichado is null or v_libre is null then
    raise exception 'FALLO: hace falta un jugador del Madrid fichado y otro libre';
  end if;

  -- La trampa: una posicion que la web va a contradecir.
  v_falsa_f := case when v_pos_fichado = 'DEFENSA' then 'DELANTERO' else 'DEFENSA' end;
  v_falsa_l := case when v_pos_libre   = 'DEFENSA' then 'DELANTERO' else 'DEFENSA' end;
  update falm.jugador_lfp set posicion = v_falsa_f where id = v_fichado;
  update falm.jugador_lfp set posicion = v_falsa_l where id = v_libre;

  v_res := falm.refrescar_catalogo_ff('real-madrid');

  select posicion into v_tras_f from falm.jugador_lfp where id = v_fichado;
  select posicion into v_tras_l from falm.jugador_lfp where id = v_libre;

  -- 1. Al fichado no se le toca: la del draft manda.
  if v_tras_f is distinct from v_falsa_f then
    v_fallos := v_fallos || format('1: al fichado le han cambiado el puesto (%s -> %s)', v_falsa_f, v_tras_f);
  end if;

  -- 2. Al libre si: ahi la web es la buena, y es lo que vera quien lo fiche.
  if v_tras_l is not distinct from v_falsa_l then
    v_fallos := v_fallos || format('2: al libre no le han actualizado el puesto (sigue en %s)', v_tras_l);
  end if;

  -- 3. Y la discrepancia queda anotada, que es lo que hay que hablar.
  if (v_res->>'posicion_respetada')::int < 1 then
    v_fallos := v_fallos || format('3: no avisa de la discrepancia (dice %s)', v_res->>'posicion_respetada');
  end if;

  if array_length(v_fallos, 1) > 0 then
    raise exception 'FALLO: %', array_to_string(v_fallos, ' | ');
  end if;
  raise exception 'TEST OK: 3 casos (fichado intacto en %, libre corregido % -> %, avisa %)',
    v_tras_f, v_falsa_l, v_tras_l, v_res->'posicion_a_revisar';
end $$;
