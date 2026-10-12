-- Un suplente que aun no ha jugado guarda el hueco: no entra el siguiente del banquillo.
--
-- Caso real, J8 2026-27: Aramburu (titular de GOLDEN BOYS) no jugo y dejo hueco en
-- defensa. El primer suplente de defensa era Kike Salas, cuyo Sevilla jugaba el lunes
-- por la noche; once_resuelto lo saltaba por no tener puntos todavia y metia a Carreira,
-- el siguiente, que ya habia jugado. Si Kike Salas juega, el hueco es suyo; hasta
-- saberlo, no es de nadie.
--
-- Ahora un suplente pendiente (de su club no se sabe nada aun, ver
-- suplente_no_entra_antes_de_tiempo.sql) reserva el primer hueco libre de sus lineas,
-- igual que lo ocuparia si jugase, pero no cuenta ni dice por quien entra. Cuando su
-- club puntua: si jugo, entra; si no, deja de estar pendiente y el hueco pasa al
-- siguiente. El total final no cambia; lo que deja de mentir es el marcador en vivo.
--
-- Se parchea por replace sobre la definicion viva, y si no tiene la forma esperada no
-- se toca nada.

begin;

do $$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('falm.once_resuelto(uuid)'::regprocedure);
  v_new := replace(v_def,
$a$    else -- SUPLENTE, ya en orden de prioridad y solo si jugo
      if r.jugo and coalesce(array_length(vac_pos,1),0) > 0 then
        for i in 1 .. array_length(vac_pos,1) loop
          if not vac_used[i] and vac_pos[i] = any(coalesce(r.lineas, array[]::text[])) then
            vac_used[i] := true; v_cuenta := true;
            v_entra := vac_act[i]; v_hueco := vac_pos[i];
            exit;
          end if;
        end loop;
      end if;$a$,
$a$    else -- SUPLENTE, ya en orden de prioridad
      -- El que jugo tapa el primer hueco libre de sus lineas. El que aun esta
      -- pendiente lo guarda: no cuenta, pero el siguiente del banquillo no puede
      -- quitarselo hasta que se sepa si juega.
      if (r.jugo or r.pendiente) and coalesce(array_length(vac_pos,1),0) > 0 then
        for i in 1 .. array_length(vac_pos,1) loop
          if not vac_used[i] and vac_pos[i] = any(coalesce(r.lineas, array[]::text[])) then
            vac_used[i] := true;
            if r.jugo then
              v_cuenta := true; v_entra := vac_act[i]; v_hueco := vac_pos[i];
            end if;
            exit;
          end if;
        end loop;
      end if;$a$);
  if v_new = v_def then
    raise exception 'once_resuelto no tiene la forma esperada; no se toca';
  end if;
  execute v_new;
end $$;

commit;
