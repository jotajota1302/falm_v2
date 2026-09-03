-- Calendario de la Liga FALM 2026/27. Aplicado el 2026-09-03.
--
-- La liga son 36 rondas (10 equipos, todos contra todos x4) y solo quedan 32 jornadas de
-- LaLiga por delante (de la 5 a la 36). En vez de crear 36 jornadas FALM y que 4 jornadas
-- de LaLiga alimenten dos cada una -- lo que obligaria a mantener dos alineaciones para la
-- misma jornada de LaLiga y dejaria a falm.jornada_objetivo_actual() con un empate --,
-- se crea UNA jornada FALM por jornada de LaLiga y cuatro de ellas son DOBLES: cada equipo
-- juega dos rivales con una sola alineacion, y salen dos resultados.
--
--   28 jornadas simples x 5 enfrentamientos  +  4 dobles x 10  =  180 = 36 rondas x 5
--
-- Dobles elegidas: jornadas 6, 17, 26 y 33 de LaLiga. La 6 (martes 15/09) y la 33
-- (miercoles 21/04) se juegan entre semana; las otras dos reparten la carga a mitad de
-- cada vuelta.
--
-- Resultado verificado: 32 jornadas, 180 enfrentamientos, cada pareja se cruza 4 veces,
-- cada equipo juega 36 partidos (18 en casa y 18 fuera), nadie repite rival dentro de una
-- jornada y nadie juega mas de dos partidos en la misma jornada.
--
-- Efecto lateral util: las jornadas 1-4 y 37-38 de LaLiga quedan fuera de la liga FALM, asi
-- que el cron falm-procesar-jornada ya no intenta puntuarlas ('nada pendiente').

create or replace function falm.generar_liga_falm(
  p_temporada  uuid,
  p_lfp_desde  integer,
  p_lfp_hasta  integer,
  p_dobles     integer[] default '{}'::integer[]   -- jornadas de LaLiga que van dobles
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'falm'
as $function$
declare
  v_liga uuid;
  w uuid[]; n int; n2 int; tmp uuid;
  v_jornadas int;
  v_rondas   int;
  v_vuelta int; v_r int; i int;
  v_local uuid; v_visit uuid; v_swap boolean;
  v_jf uuid; v_lfp_num int; v_idx int := 0;
  v_pend int; v_enf int := 0;
begin
  select id into v_liga from falm.competicion where temporada_id = p_temporada and tipo = 'LIGA';
  if v_liga is null then raise exception 'La temporada no tiene competicion LIGA'; end if;

  select array_agg(id order by random()) into w from falm.equipo_falm where temporada_id = p_temporada;
  n := coalesce(array_length(w, 1), 0);
  if n < 2 or n % 2 <> 0 then raise exception 'Se necesitan equipos en numero par (hay %)', n; end if;
  n2 := n / 2;

  v_jornadas := p_lfp_hasta - p_lfp_desde + 1;
  v_rondas   := v_jornadas + coalesce(array_length(p_dobles, 1), 0);
  if v_rondas % (n - 1) <> 0 then
    raise exception 'Con % equipos las rondas deben ser multiplo de %; salen % (jornadas % + dobles %)',
      n, n - 1, v_rondas, v_jornadas, coalesce(array_length(p_dobles, 1), 0);
  end if;

  delete from falm.enfrentamiento where jornada_falm_id in
    (select id from falm.jornada_falm where competicion_id = v_liga);
  delete from falm.mapeo_jornada where jornada_falm_id in
    (select id from falm.jornada_falm where competicion_id = v_liga);
  delete from falm.jornada_falm where competicion_id = v_liga;

  insert into falm.jornada_falm (competicion_id, numero)
  select v_liga, k from generate_series(1, v_jornadas) k;

  insert into falm.mapeo_jornada (jornada_falm_id, jornada_lfp_id)
  select jf.id, jl.id
  from falm.jornada_falm jf
  join falm.jornada_lfp jl
    on jl.temporada_id = p_temporada and jl.numero = p_lfp_desde + jf.numero - 1
  where jf.competicion_id = v_liga;

  -- round-robin del circulo: (n-1) rondas por vuelta; las vueltas pares invierten
  -- la localia, de modo que cada pareja acaba 2 en casa y 2 fuera.
  for v_vuelta in 1 .. v_rondas / (n - 1) loop
    for v_r in 1 .. n - 1 loop
      v_idx := v_idx + 1;

      -- primera jornada con cupo libre (las dobles admiten el doble de enfrentamientos)
      select jf.id, jl.numero into v_jf, v_lfp_num
      from falm.jornada_falm jf
      join falm.mapeo_jornada mj on mj.jornada_falm_id = jf.id
      join falm.jornada_lfp jl on jl.id = mj.jornada_lfp_id
      where jf.competicion_id = v_liga
        and jf.numero = (
          select min(x.numero) from (
            select jf2.numero,
                   (select count(*) from falm.enfrentamiento e where e.jornada_falm_id = jf2.id) as hechos,
                   case when jl2.numero = any(p_dobles) then 2 else 1 end as cupo
            from falm.jornada_falm jf2
            join falm.mapeo_jornada mj2 on mj2.jornada_falm_id = jf2.id
            join falm.jornada_lfp jl2 on jl2.id = mj2.jornada_lfp_id
            where jf2.competicion_id = v_liga
          ) x where x.hechos < x.cupo * (n / 2)
        );

      v_swap := (v_vuelta % 2 = 0);
      for i in 1 .. n2 loop
        v_local := w[i]; v_visit := w[n - i + 1];
        if v_swap then tmp := v_local; v_local := v_visit; v_visit := tmp; end if;
        insert into falm.enfrentamiento (jornada_falm_id, equipo_local_id, equipo_visitante_id)
          values (v_jf, v_local, v_visit);
        v_enf := v_enf + 1;
      end loop;

      tmp := w[n];
      for i in reverse n .. 3 loop w[i] := w[i-1]; end loop;
      w[2] := tmp;
    end loop;
  end loop;

  select count(*) into v_pend from falm.jornada_falm jf
   where jf.competicion_id = v_liga
     and not exists (select 1 from falm.enfrentamiento e where e.jornada_falm_id = jf.id);

  return jsonb_build_object(
    'jornadas_falm', v_jornadas, 'rango_lfp', p_lfp_desde || '-' || p_lfp_hasta,
    'dobles', p_dobles, 'rondas', v_rondas, 'enfrentamientos', v_enf,
    'jornadas_sin_enfrentamientos', v_pend);
end $function$;

-- Ejecutado asi (y despues falm.refrescar_calendario_fd para fijar los cierres):
--   select falm.generar_liga_falm(
--            (select id from falm.temporada where activa), 5, 36, array[6,17,26,33]);
