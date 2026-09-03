-- Carga inicial del catalogo LFP - FALM V2 - temporada 2026/27
-- Aplicado el 2026-09-02 sobre el proyecto Supabase rgpzrbwpyaewughahpgo.
-- Resultado: 20 equipos, 840 jugadores (523 de primer equipo, 604 con retrato),
--            840 activos JUGADOR + 20 porterias virtuales.
--
-- Conserva: temporada, jornada_lfp, mapeo_jornada, jornada_falm, enfrentamiento,
--           competicion, equipo_falm y usuario_perfil.
-- Borra el estado de prueba anterior (draft simulado, alineaciones y puntuaciones).

begin;

-- 1. limpieza del estado de prueba (orden de dependencia)
delete from falm.alineacion_activo;
delete from falm.draft_pick;
delete from falm.fichaje_extra;
delete from falm.oferta_activo;
delete from falm.peticion_fichaje_opcion;
delete from falm.peticion_fichaje;
delete from falm.plantilla;
delete from falm.puntuacion;
delete from falm.jornada_lfp_bloqueo;
delete from falm.alineacion;
delete from falm.oferta_intercambio;
delete from falm.draft_orden;
delete from falm.draft;
delete from falm.premio;
delete from falm.activo;
delete from falm.jugador_lfp;
delete from falm.equipo_lfp;

-- 2. clubes: ext_id y escudo de football-data, nombre corto como lo escribe futbolfantasy
--    (falm._equipo_lfp_por_nombre resuelve por similitud; con el nombre largo,
--     el 'Deportivo' de la web de puntos se iba al 'Deportivo Alaves').
insert into falm.equipo_lfp (id, ext_id, nombre, tla, escudo)
select extensions.uuid_generate_v5('fa100000-0000-0000-0000-000000000001'::uuid,
       'eqlfp:'||v.ext_id::text), v.ext_id, v.nombre, v.tla,
       'https://crests.football-data.org/'||v.ext_id||'.png'
from (values
  (263,'Alavés','ALA'),(77,'Athletic','ATH'),(78,'Atlético','ATL'),(81,'Barcelona','FCB'),
  (90,'Betis','BET'),(558,'Celta','CEL'),(560,'Deportivo','DEP'),(285,'Elche','ELC'),
  (80,'Espanyol','ESP'),(82,'Getafe','GET'),(88,'Levante','LEV'),(84,'Málaga','MAL'),
  (79,'Osasuna','OSA'),(5335,'Racing','SAN'),(87,'Rayo','RAY'),(86,'Real Madrid','RMA'),
  (92,'Real Sociedad','RSO'),(559,'Sevilla','SEV'),(95,'Valencia','VAL'),(94,'Villarreal','VIL')
) as v(ext_id, nombre, tla);

-- 3. jugadores: los trae falm.refrescar_catalogo_ff() scrapeando futbolfantasy
--    (ver tools/sql/refrescar_catalogo_ff.sql, que crea la funcion y las columnas
--     dorsal / primer_equipo / slug_ff).
select falm.refrescar_catalogo_ff();

-- 4. cedidos que futbolfantasy lista en los dos clubes y ninguno le da dorsal:
--    se resuelven con la plantilla de football-data.
update falm.jugador_lfp set equipo_lfp_id = (select id from falm.equipo_lfp where ext_id = 80)
  where slug_ff = 'andoni-gorosabel';                       -- Espanyol
update falm.jugador_lfp set equipo_lfp_id = (select id from falm.equipo_lfp where ext_id = 285)
  where slug_ff = 'thomas-lemar';                           -- Elche
update falm.jugador_lfp set equipo_lfp_id = (select id from falm.equipo_lfp where ext_id = 560)
  where slug_ff in ('jose-maria-gimenez','marc-casado');    -- Deportivo

-- 5. activos: se derivan del catalogo, asi ningun jugador se queda sin activo
insert into falm.activo (id, tipo, jugador_lfp_id, precio_mercado)
select extensions.uuid_generate_v5('fa100000-0000-0000-0000-000000000001'::uuid, 'activo:'||jl.id::text),
       'JUGADOR', jl.id,
       case jl.posicion when 'PORTERO' then 5 when 'DEFENSA' then 5 when 'MEDIO' then 6 else 7 end
from falm.jugador_lfp jl
on conflict (id) do nothing;

-- 6. porterias virtuales: un activo DEFENSA por club
insert into falm.activo (id, tipo, equipo_lfp_id, precio_mercado)
select extensions.uuid_generate_v5('fa100000-0000-0000-0000-000000000001'::uuid, 'pv:'||el.ext_id::text),
       'DEFENSA', el.id, 1.5
from falm.equipo_lfp el
on conflict (id) do nothing;

-- 7. el scrape de puntos de la 2026/27 vive en /laliga/puntos/2027/... (año de cierre)
update falm.temporada set anio_scrape = 2027 where anio_inicio = 2026;

-- 8. verificacion
select (select count(*) from falm.equipo_lfp)                                   as equipos,
       (select count(*) from falm.jugador_lfp)                                  as jugadores,
       (select count(*) from falm.jugador_lfp where primer_equipo)              as primer_equipo,
       (select count(*) from falm.jugador_lfp where foto is not null)           as con_foto,
       (select count(*) from falm.activo where tipo='JUGADOR')                  as activos_jugador,
       (select count(*) from falm.activo where tipo='DEFENSA')                  as porterias,
       (select count(*) from falm.jugador_lfp where equipo_lfp_id is null)      as sin_equipo,
       (select count(*) from falm.jugador_lfp jl where not exists
          (select 1 from falm.activo a where a.jugador_lfp_id = jl.id))         as sin_activo;

commit;
