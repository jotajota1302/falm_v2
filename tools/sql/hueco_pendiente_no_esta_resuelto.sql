-- Un hueco que guarda un suplente pendiente no esta resuelto.
--
-- LL10 (26/10/2026), Golden Boys: Ratiu (Rayo) no jugo y su hueco lo guarda
-- Kike Salas (Sevilla), que juega el lunes. once_resuelto lo decia bien, pero
-- los marcadores contaban "resueltos" como titulares que jugaron o que ya no
-- estan pendientes; Ratiu no esta pendiente (su partido acabo) y salia
-- resuelto: Inicio decia 11 de 11 y daba el partido por cerrado.
--
-- Cada suplente con hueco y pendiente guarda exactamente el hueco de un
-- titular caido, asi que se resta uno por cada uno.

begin;

do $$
declare
  f text; v_def text; v_new text;
  a_con constant text := $a$count(*) filter (where o.rol = 'TITULAR' and (o.jugo or not o.pendiente)))::int$a$;
  b_con constant text := $a$(count(*) filter (where o.rol = 'TITULAR' and (o.jugo or not o.pendiente))
              - count(*) filter (where o.rol = 'SUPLENTE' and o.hueco is not null and o.pendiente))::int$a$;
  a_sin constant text := $a$count(*) filter (where rol = 'TITULAR' and (jugo or not pendiente)),$a$;
  b_sin constant text := $a$count(*) filter (where rol = 'TITULAR' and (jugo or not pendiente))
           - count(*) filter (where rol = 'SUPLENTE' and hueco is not null and pendiente),$a$;
begin
  foreach f in array array['marcador_jornada', 'marcadores_jornada', 'marcadores_jornada_detalle'] loop
    v_def := pg_get_functiondef(('falm.' || f)::regproc);
    if position(a_con in v_def) = 0 then
      raise exception '% no tiene la forma esperada; no se toca', f;
    end if;
    -- El parentesis de apertura que cerraba el )::int queda dentro de b_con.
    v_new := replace(v_def, '(' || a_con, b_con);
    if v_new = v_def then
      raise exception '% no tiene el parentesis esperado; no se toca', f;
    end if;
    execute v_new;
  end loop;

  v_def := pg_get_functiondef('falm.marcador_enfrentamiento'::regproc);
  if position(a_sin in v_def) = 0 then
    raise exception 'marcador_enfrentamiento no tiene la forma esperada; no se toca';
  end if;
  execute replace(v_def, a_sin, b_sin);
end $$;

commit;
