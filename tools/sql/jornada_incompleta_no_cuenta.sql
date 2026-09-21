-- Una jornada sin todas las notas tampoco cuenta en la clasificación.
--
-- 2026-09-21. La J3 (jornada 7 de LaLiga) salía en la tabla con los diez
-- partidos jugados, pero sin los puntos del Valencia - Real Sociedad:
-- futbolfantasy tenía los minutos de los dos clubes y las notas TODAS como
-- "SC", en sus cinco vistas, así que la ingesta los descartó a propósito
-- (puntuaciones_esperar_al_1x1.sql: minutos sin estrellas son puntos falsos).
--
-- Cerrar no se cerró —`jornada_lfp.procesada_en` seguía a null y la jornada se
-- vuelve a leer cada dos horas—, pero `procesar_jornada_auto` resuelve los
-- cruces y recalcula la clasificación ANTES de comprobar si faltan notas, y
-- `jornada_cuenta` solo miraba que los partidos hubieran acabado. Resultado:
-- una tabla con nueve titulares a cero, de ocho de los diez equipos.
--
-- El once sí estaba bien: `once_resuelto` marca "pendiente" a quien juega en un
-- club del que no hay ni una nota, y su sitio sigue siendo suyo, así que ningún
-- suplente entró por la puerta de atrás ([[pendiente-no-es-no-jugo]]).
--
-- Se le añade a `jornada_cuenta` la misma comprobación que ya usa el cierre:
-- cada partido acabado tiene que tener puntuaciones de sus dos clubes. Solo
-- mientras la jornada de LaLiga no esté procesada: si se cerró con la salida de
-- emergencia de los 3 días, cuenta con lo que tenga. Los partidos bloqueados
-- (jugados antes de abrir la jornada) quedan fuera, como en el resto de reglas.

do $parche$
declare def text; nuevo text;
begin
  def := pg_get_functiondef('falm.jornada_cuenta(uuid)'::regprocedure);
  nuevo := replace(def,
'  from falm.jornada_falm jf where jf.id = p_jornada;',
'     and not exists (
       select 1 from falm.mapeo_jornada mj
       join falm.jornada_lfp jl on jl.id = mj.jornada_lfp_id and jl.procesada_en is null
       join falm.partido_lfp pl on pl.jornada_lfp_id = jl.id and pl.estado = ''FINISHED''
       where mj.jornada_falm_id = jf.id
         and not exists (select 1 from falm.jornada_lfp_bloqueo b
                          where b.jornada_lfp_id = jl.id and b.equipo_lfp_id = pl.local_id)
         and not (
           exists (select 1 from falm.puntuacion pu
                   join falm.activo a on a.id = pu.activo_id and a.tipo = ''JUGADOR''
                   join falm.jugador_lfp j2 on j2.id = a.jugador_lfp_id
                   where pu.jornada_lfp_id = jl.id and j2.equipo_lfp_id = pl.local_id)
           and
           exists (select 1 from falm.puntuacion pu
                   join falm.activo a on a.id = pu.activo_id and a.tipo = ''JUGADOR''
                   join falm.jugador_lfp j2 on j2.id = a.jugador_lfp_id
                   where pu.jornada_lfp_id = jl.id and j2.equipo_lfp_id = pl.visitante_id)))
  from falm.jornada_falm jf where jf.id = p_jornada;');
  if nuevo = def then raise exception 'no casa el parche en jornada_cuenta'; end if;
  execute nuevo;
end $parche$;

-- Y se rehace la tabla, que ya llevaba la J3 dentro.
select falm.recalcular_clasificacion((select id from falm.temporada where activa order by created_at desc limit 1));

-- 2026-09-21, despues: el cierre de oficio pasa de 3 a 5 dias.
--
-- `procesar_jornada_auto` cierra la jornada "con lo que haya" pasados unos dias
-- de su fecha_fin, y eso NO tiene vuelta atras: los jugadores sin nota se
-- quedan a cero para siempre. Con el Valencia - Real Sociedad sin 1x1 en la
-- fuente, tres dias se quedaban cortos. Para la J3 el plazo pasa del miercoles
-- 23 al viernes 25 a las 21:00 de Madrid.
do $plazo$
declare def text; nuevo text;
begin
  def := pg_get_functiondef('falm.procesar_jornada_auto()'::regprocedure);
  nuevo := replace(def,
    'if v_sin_puntos > 0 and v_fin + interval ''3 days'' > now() then',
    'if v_sin_puntos > 0 and v_fin + interval ''5 days'' > now() then');
  if nuevo = def then raise exception 'no casa el parche del plazo'; end if;
  execute nuevo;
end $plazo$;
