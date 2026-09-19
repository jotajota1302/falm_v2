-- Portería a cero: de "más de 45 minutos" a "45 o más".
--
-- La fuente (futbolfantasy) no da minuto de entrada ni de salida, solo "N
-- Minutos jugados", y tapa en 90: quien juega una parte entera viene con 45
-- clavado, entre y salga en el descanso. Con el criterio viejo (> 45) ese
-- jugador no cobraba nunca la portería a cero. Con >= 45, media parte cuenta.
--
-- El 45 vive en cuatro funciones; se parchean sobre la definición viva para no
-- reescribirlas enteras y arriesgar a perder otro cambio por el camino.

do $parche$
declare
  f text; def text; nuevo text;
begin
  foreach f in array array[
    'falm.calcular_puntos(falm.posicion,jsonb)',
    'falm.desglose_puntos(falm.posicion,jsonb)',
    'falm.puntuaciones_acumuladas()',
    'falm.stats_equipo(uuid)'
  ] loop
    def := pg_get_functiondef(f::regprocedure);
    nuevo := replace(def, '> 45', '>= 45');
    nuevo := replace(nuevo, '>45 min', '45 min o más');
    if nuevo = def then
      raise exception 'no casa el parche en %', f;
    end if;
    execute nuevo;
  end loop;
end $parche$;

-- Y los puntos ya guardados, que no se recalculan solos.
update falm.puntuacion p
   set puntos = falm.calcular_puntos(j.posicion, p.desglose),
       updated_at = now()
  from falm.activo a, falm.jugador_lfp j
 where a.id = p.activo_id
   and j.id = a.jugador_lfp_id
   and p.puntos is distinct from falm.calcular_puntos(j.posicion, p.desglose);
