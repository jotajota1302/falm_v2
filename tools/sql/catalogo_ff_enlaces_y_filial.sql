-- El refresco del catalogo vuelve a leer futbolfantasy, y el primer equipo lo dice la web.
--
-- Caso real, 2026-10-12: un companero no encontraba a Felix Correia (Sevilla, cedido,
-- dorsal 20) en el mercado. Estaba en la base desde la carga inicial, pero sin dorsal
-- y con primer_equipo = false, y nada lo habia corregido despues. Dos causas:
--
-- 1. futbolfantasy cambio los enlaces de jugador: antes /jugadores/felix-correia" y
--    ahora /jugadores/felix-correia/laliga-26-27". La expresion pedia la comilla justo
--    detras del nombre, asi que refrescar_catalogo_ff ya no casaba con nadie y no
--    actualizaba ni dorsales, ni clubes, ni primer_equipo.
-- 2. primer_equipo se deducia del dorsal ("el primero con ese dorsal en su club"),
--    pero la pagina agrupa por posicion y el filial va detras de cada grupo: el 10 del
--    filial en medios sale antes que el 10 del primer equipo en delanteros. Asi se
--    quedaban fuera Aspas, Oyarzabal, Guedes, Camello o Satriano, y dentro canteranos.
--    La web marca a cada jugador del filial con la clase "filial"; ahora manda eso:
--    primer_equipo = tiene dorsal y no es del filial.
--
-- Se parchea por replace sobre la definicion viva, y si no tiene la forma esperada no
-- se toca nada. Despues hay que lanzar select falm.refrescar_catalogo_ff(); a mano.

begin;

do $$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('falm.refrescar_catalogo_ff(text)'::regprocedure);
  v_new := v_def;

  v_new := replace(v_new,
$a$(regexp_match(bloque, '/jugadores/([a-z0-9\-]+)"'))[1] as slug,$a$,
$a$(regexp_match(bloque, '/jugadores/([a-z0-9\-]+)[/"]'))[1] as slug,
        -- Lo que queda de la etiqueta de clase: "filial", "cedido", "lesionado"...
        split_part(bloque, '"', 1) ~ '\mfilial\M'                                    as filial,$a$);

  v_new := replace(v_new,
$a$        foto, ext_id
      from campos$a$,
$a$        foto, ext_id, filial
      from campos$a$);

  v_new := replace(v_new,
$a$    select l.*,
           l.dorsal is not null
             and row_number() over (partition by l.dorsal order by l.orden) = 1 as primer_equipo
      from limpio l;$a$,
$a$    select l.*, l.dorsal is not null and not l.filial as primer_equipo
      from limpio l;$a$);

  if v_new = v_def
     or position('[/"]' in v_new) = 0
     or position('not l.filial' in v_new) = 0
     or position('ext_id, filial' in v_new) = 0 then
    raise exception 'refrescar_catalogo_ff no tiene la forma esperada; no se toca';
  end if;
  execute v_new;
end $$;

-- Segunda parte: el que se va deja de ser del primer equipo.
--
-- El refresco solo escribe a los que encuentra, y a un jugador que la web lista sin
-- dorsal no le cambia nada si en la base tenia uno (asi no se pierde a un cedido que
-- sale en los dos clubes). El resultado era que los que dejaban LaLiga, o se quedaban
-- sin dorsal, seguian en el mercado: Carlos Alvarez, Collado, Astigarraga, Neyou...
-- Ahora, en el refresco completo, quien no sale con dorsal y fuera del filial en
-- ninguna de las 20 plantillas deja de ser del primer equipo. Si la lectura vuelve a
-- romperse y salen menos de 300, no se toca nada: mejor un mercado viejo que vacio.

do $$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('falm.refrescar_catalogo_ff(text)'::regprocedure);
  v_new := v_def;

  v_new := replace(v_new,
$a$  v_revisar text[] := array[]::text[];$a$,
$a$  v_revisar text[] := array[]::text[];
  v_vistos text[] := array[]::text[];
  v_fuera int := 0;$a$);

  v_new := replace(v_new,
$a$    drop table tmp_ff;
  end loop;$a$,
$a$    v_vistos := v_vistos || array(select slug from tmp_ff where primer_equipo);
    drop table tmp_ff;
  end loop;

  if p_slug is null and coalesce(array_length(v_vistos,1),0) >= 300 then
    update falm.jugador_lfp set primer_equipo = false
     where primer_equipo and slug_ff is not null and not (slug_ff = any(v_vistos));
    get diagnostics v_fuera = row_count;
  end if;$a$);

  v_new := replace(v_new,
$a$      'posicion_respetada', coalesce(array_length(v_revisar,1),0),$a$,
$a$      'fuera_del_primer_equipo', v_fuera,
      'posicion_respetada', coalesce(array_length(v_revisar,1),0),$a$);

  if v_new = v_def
     or position('v_vistos text[]' in v_new) = 0
     or position('v_vistos := v_vistos' in v_new) = 0
     or position('fuera_del_primer_equipo' in v_new) = 0 then
    raise exception 'refrescar_catalogo_ff no tiene la forma esperada; no se toca';
  end if;
  execute v_new;
end $$;

commit;
