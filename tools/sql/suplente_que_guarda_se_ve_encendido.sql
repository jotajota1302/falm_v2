-- El suplente que guarda un hueco se ve encendido. Aplicado el 2026-10-12.
--
-- Desde suplente_pendiente_guarda_el_hueco.sql, un suplente que aun no ha jugado
-- reserva el hueco del titular caido, pero en pantalla salia apagado como cualquier
-- suplente que no cuenta. Ahora:
--   once_resuelto  le pone en `hueco` la linea que guarda (cuenta sigue en false y
--                  entra_por en null hasta que juegue). Nadie mas leia `hueco`.
--   _lado_enf      lo pasa al detalle del partido como 'guarda'.
-- Inicio empareja ese hueco con el titular caido para decir "si juega, por X".

do $$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('falm.once_resuelto(uuid)'::regprocedure);
  v_new := replace(v_def,
$a$            vac_used[i] := true;
            if r.jugo then
              v_cuenta := true; v_entra := vac_act[i]; v_hueco := vac_pos[i];
            end if;$a$,
$a$            vac_used[i] := true;
            -- El que lo guarda dice que hueco es (para encenderlo en pantalla),
            -- pero ni cuenta ni entra por nadie hasta que juegue.
            v_hueco := vac_pos[i];
            if r.jugo then
              v_cuenta := true; v_entra := vac_act[i];
            end if;$a$);
  if v_new = v_def then raise exception 'once_resuelto no tiene la forma esperada; no se toca'; end if;
  execute v_new;
end $$;

do $$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('falm._lado_enf'::regproc);
  v_new := replace(v_def, $a$coalesce(rs.cuenta, false) cuenta, rs.entra_por,$a$,
    $a$coalesce(rs.cuenta, false) cuenta, rs.entra_por,
      -- suplente que aun no ha jugado y guarda el hueco de un titular caido
      (rs.hueco is not null and not coalesce(rs.cuenta, false)) guarda,$a$);
  v_new := replace(v_new, $a$'cuenta',cuenta,'entra_por',entra_por,$a$, $a$'cuenta',cuenta,'entra_por',entra_por,'guarda',guarda,$a$);
  if v_new not like '%''guarda'',guarda%' or v_new not like '%) guarda,%' then
    raise exception '_lado_enf no tiene la forma esperada; no se toca';
  end if;
  execute v_new;
end $$;
