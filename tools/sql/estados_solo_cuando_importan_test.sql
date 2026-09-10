-- Casos de "leer lesionados y sancionados solo cuando sirven". Se revierte solo:
-- termina lanzando una excepcion a proposito.
-- Pasa si el error empieza por 'TEST OK'; falla si empieza por 'FALLO'.
--
-- Aqui lo que se prueba es CUANDO decide leer, no lo que lee. Los dos casos que
-- dicen que si hacen scrape de verdad (700 kB entre las dos paginas); los dos
-- que dicen que no, no tocan la red, que es justo lo que hay que comprobar.
--
-- Para mover el reloj se mueve la fecha de cierre de la jornada objetivo, que es
-- de lo unico que depende la decision.

do $test$
declare
  v_jor uuid; v_cierre_real timestamptz; v_res jsonb;
  v_fallos text[] := array[]::text[];
begin
  v_jor := falm.jornada_objetivo_actual();
  if v_jor is null then
    raise exception 'FALLO: no hay jornada objetivo, el test no puede montarse';
  end if;
  select fecha_cierre into v_cierre_real from falm.jornada_falm where id = v_jor;

  -- ------------------------------------------------------------------
  -- 1. Cierre a menos de 48 h: lee, aunque acabe de leer hace un minuto. Es
  --    cuando la gente esta tocando su once y una lesion cambia la alineacion.
  -- ------------------------------------------------------------------
  update falm.jornada_falm set fecha_cierre = now() + interval '10 hours' where id = v_jor;
  update falm.estado_jugador set actualizado_en = now();

  v_res := falm.estados_jugadores_si_hace_falta();
  if v_res->>'porque' is distinct from 'el cierre esta a menos de 48 h' then
    v_fallos := v_fallos || format('1: con el cierre a 10 h no lee (%s)', v_res);
  end if;
  if (v_res->>'guardados')::int is null or (v_res->>'guardados')::int = 0 then
    v_fallos := v_fallos || format('1: dice que lee pero no ha guardado nada (%s)', v_res);
  end if;

  -- ------------------------------------------------------------------
  -- 2. Cierre lejos y lectura reciente: no lee. Este es el caso que ahorra los
  --    2 GB al anio, asi que si alguna vez falla, es que hemos vuelto atras.
  -- ------------------------------------------------------------------
  update falm.jornada_falm set fecha_cierre = now() + interval '5 days' where id = v_jor;
  update falm.estado_jugador set actualizado_en = now();

  v_res := falm.estados_jugadores_si_hace_falta();
  if (v_res->>'leido')::boolean is distinct from false then
    v_fallos := v_fallos || format('2: con el cierre a 5 dias y el dato fresco, lee igual (%s)', v_res);
  end if;

  -- ------------------------------------------------------------------
  -- 3. Cierre lejos pero el dato viejo: lee, para que nadie vea el martes una
  --    lesion de la semana pasada.
  -- ------------------------------------------------------------------
  update falm.estado_jugador set actualizado_en = now() - interval '25 hours';

  v_res := falm.estados_jugadores_si_hace_falta();
  if v_res->>'porque' is distinct from 'toca el repaso diario' then
    v_fallos := v_fallos || format('3: con el dato de hace 25 h no hace el repaso (%s)', v_res);
  end if;

  -- ------------------------------------------------------------------
  -- 4. Sin jornada objetivo no lee nunca, por viejo que este el dato: en verano
  --    no hay a quien alinear. Se simula dejando todas las jornadas cerradas.
  -- ------------------------------------------------------------------
  update falm.jornada_falm set fecha_cierre = now() - interval '1 day'
   where fecha_cierre is null or fecha_cierre > now();
  update falm.estado_jugador set actualizado_en = now() - interval '30 days';

  if falm.jornada_objetivo_actual() is not null then
    v_fallos := v_fallos || '4: no se ha podido dejar la temporada sin jornada objetivo';
  else
    v_res := falm.estados_jugadores_si_hace_falta();
    if v_res->>'porque' is distinct from 'no hay jornada objetivo' then
      v_fallos := v_fallos || format('4: sin jornada objetivo sigue leyendo (%s)', v_res);
    end if;
  end if;

  if array_length(v_fallos, 1) > 0 then
    raise exception 'FALLO: %', array_to_string(v_fallos, ' | ');
  end if;
  raise exception 'TEST OK: 4 casos (cierre cerca -> lee; lejos y fresco -> no; lejos y viejo -> repaso; sin jornada -> nunca). El cierre real de la jornada objetivo era %',
    to_char(v_cierre_real at time zone 'Europe/Madrid', 'DD/MM HH24:MI');
end $test$;
