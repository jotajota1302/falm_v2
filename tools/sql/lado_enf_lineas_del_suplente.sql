-- El pop-up del partido no decia a que huecos entra un suplente.
--
-- En Alineacion, un suplente puede marcar mas de una linea -Alex Berenguer
-- cubre DEFENSA y MEDIO en la jornada 2- y alli se ven sus dos pildoras. En la
-- vista del partido salia una sola fila con su posicion natural y nada mas, asi
-- que parecia que solo cubria la suya. El dato ya estaba en
-- alineacion_activo.lineas: lo unico que faltaba era subirlo en _lado_enf.
--
-- Se parchea sobre la definicion viva para no reescribir la funcion entera.

do $l$
declare d text; n text;
begin
  d := pg_get_functiondef('falm._lado_enf(uuid,uuid)'::regprocedure);
  n := replace(d, E'    select aa.rol::text rol, aa.orden, aa.activo_id, jl.ext_id,',
                  E'    select aa.rol::text rol, aa.orden, aa.activo_id, aa.lineas, jl.ext_id,');
  if n = d then raise exception 'no casa el select'; end if;
  d := n;
  n := replace(d, E'''nombre'',nombre,''pos'',pos,''rol'',rol,',
                  E'''nombre'',nombre,''pos'',pos,''rol'',rol,''lineas'',lineas,');
  if n = d then raise exception 'no casa el build_object'; end if;
  execute n;
end $l$;
