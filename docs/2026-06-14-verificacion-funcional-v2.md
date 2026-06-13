# Verificación funcional FALM V2 — Antes / Ahora / Test real

> Recorre los 13 dominios de `2026-06-13-specs-funcionalidades-falm.md` comparando
> cómo se hacía en el sistema viejo (Spring Boot/Java), cómo se hace en V2 (Supabase + Angular)
> y un test real ejecutado. Producción NO se toca en ningún momento (solo lecturas GET).
>
> **Fecha:** 2026-06-14 · **Leyenda estado:** ✅ cubierto y probado · ⚠️ parcial / con matiz · ⛔ pendiente

---

## 1. Autenticación y permisos — ⚠️

| | |
|---|---|
| **Antes** | Login por nombre de equipo + contraseña (sin hash robusto), sesión en `sessionStorage`, permisos hardcoded en el frontend (`isAdmin` = "GOLDEN BOYS"). 3 niveles: usuario / gestor / admin. |
| **Ahora** | Supabase Auth + **RLS** en las 24 tablas. Funciones `es_admin()` / `es_gestor()` / `es_mi_equipo(eq)` (security definer) + tabla `usuario_perfil(rol USUARIO/GESTOR/ADMIN)`. Los 3 roles se conservan a nivel de BD, no de cliente (más seguro). En dev se usa login anónimo + equipo fijo GOLDEN BOYS. |
| **Test real** | RLS activa verificada: la escritura anónima a `alineacion` la bloquea RLS → se canaliza por RPC SECURITY DEFINER `guardar_alineacion`. Políticas SELECT/ALL existentes en draft/oferta/fichaje_extra/alineacion. |
| **Pendiente** | Activar login real con email para que cada usuario sea dueño de su equipo (hoy diferido por decisión). |

## 2. Equipos y plantilla — ✅

| | |
|---|---|
| **Antes** | `EquipoFalm` (presupuesto, puntos, V/E/D, beneficio) + `Jugador` (precio, posición, equipo LFP, lesionado/baja, stats). Plantilla propia y de rivales; equipos LFP por scraping + Football Data. |
| **Ahora** | `equipo_falm` (+snapshot puntos_clasif/victorias/.../beneficio) por temporada; **catálogo global** `equipo_lfp` / `jugador_lfp` (foto, escudo, ext_id) + `activo` (JUGADOR / DEFENSA=portero virtual) + `plantilla` (por temporada). Frontend: pantalla **Equipo** (cromos por posición) + ficha de jugador. |
| **Test real** | Temporada real: 10 equipos, 229 filas de plantilla, 555 jugador_lfp, 575 activo. La temporada de pruebas distribuyó las mismas 229 plantillas. |

## 3. Alineaciones — ✅

| | |
|---|---|
| **Antes** | `Alineacion` (11 titulares + 3 suplentes por línea, formación), drag&drop, repetir anterior, copiar Liga→Champions, cierre por fecha, bloqueo selectivo en jornada partida. |
| **Ahora** | `alineacion` + `alineacion_activo` (rol TITULAR/SUPLENTE_*). Pantalla **Once** = campo (pitch) con selector competición+jornada, **Repetir última** y **Copiar de Liga** (empareja por fecha = misma jornada LFP). Guardado real vía RPC `guardar_alineacion`. Herencia por defecto (`heredar_alineaciones`) + cron martes 23:05. |
| **Test real** | `guardar_alineacion` (RPC) + recálculo: OK server-side sobre GOLDEN BOYS de pruebas. `generar_alineacion_defecto` creó 30 alineaciones (10 equipos × 3 jornadas). |
| **Matiz** | Jornada partida (bloqueo selectivo) NO reimplementado aún (era config en código, baja prioridad fuera de temporada). |

## 4. Mercado y fichajes — ✅ / ⚠️

| | |
|---|---|
| **Antes** | Mercado de libres (paginado, filtros). Fichajes semanales (deadline martes 23:59, 1-2 por prioridad, 3 desempates: no fichó antes > menor clasif > menor puntos). Intercambios (oferta, expira 7 días). Fichaje extra por lesión. |
| **Ahora** | "Libre" se deriva de no estar en plantilla (`v_activo_libre`). **Fichajes** en cromos (prioridad 1/2). `procesar_fichajes(jornada)` con los 3 desempates + presupuesto (validado 5 casos). Cron martes 22:59. **Intercambios** (bandeja + compositor). **Fichaje por lesión** (`fichaje_extra`). `expirar_ofertas()` cron horario. |
| **Test real** | `procesar_fichajes` validado con casos (2 fases, desempates). Ofertas demo sembradas (MANCHISTER→GB, GB→TOBAGO). 1 fichaje_extra demo. |
| **Matiz** | Mercado/fichajes aún leen el set global, no están filtrados por temporada seleccionada (no urgente). |

## 5. Drafts — ✅

| | |
|---|---|
| **Antes** | Draft inicial snake (23 rondas, picks no invasivos → consolidar). Draft de invierno (deshabilitado). |
| **Ahora** | `draft` + `draft_orden` (serpiente) + `draft_pick`. Funciones `draft_crear` (orden aleatorio + serpiente), `draft_pick` (valida turno + libre + no repetido), `draft_consolidar` (→ plantilla). Panel admin Pretemporada con tablero. |
| **Test real** | Draft de prueba: serpiente correcta (R1 en orden, R2 invertida), 230 turnos (23×10), 25 picks simulados, avance de turno OK. |
| **Nota** | Draft de invierno omitido (estaba deshabilitado en el viejo). |

## 6. Scoring (motor de puntuación) — ✅✅

| | |
|---|---|
| **Antes** | `calcularPuntosTotalesJugador`: resultado equipo, goles por posición (POR5/DEF4/MED3/DEL2), penalti +2, portería a cero (>45'), roja −3, gol en propia −1, penalti parado/fallado, goles en contra portero. |
| **Ahora** | `falm.calcular_puntos(posicion, desglose)` — **réplica exacta** verificada línea a línea. |
| **Test real** | **Comparación descargando jornadas enteras de pro y recalculando: J10 449/449, J15 440/440, J25 442/442 idénticos.** Las únicas diferencias son datos no recomputables de pro (ediciones manuales / jornadas sin desglose), preservados como MANUAL. `validar_jornada_lfp(N)` deja re-chequear cualquier jornada. |

## 7. Jornadas y mapeo FALM↔LFP — ✅

| | |
|---|---|
| **Antes** | `MapeoJornadaFalmLfp` (FALM 1-32 ↔ LFP 5-36), `PuntosJornada` con `jornadaLFPNumero`, jornadas dobles = 2 registros. |
| **Ahora** | `jornada_falm` / `jornada_lfp` / `mapeo_jornada` (configurable por temporada). Puntuación anclada a la **jornada LFP real** (verdad única); lo FALM se agrega por mapeo (elimina el duplicado del viejo). `generar_jornadas_liga(temp, desde, hasta)` crea jornadas + mapeo. |
| **Test real** | Temporada de pruebas: 3 jornadas FALM mapeadas a LFP 5-7 reales (3 mapeos). 32 jornadas LFP con puntuación importada. |

## 8. Porteros virtuales — ✅

| | |
|---|---|
| **Antes** | Jugador sintético (posición Portero, origen VIRTUAL) = defensa de un equipo LFP. Sync copia puntos del portero titular real; manual > automático; bugfix v2.9.9 (preservar manuales antes/después del copiado). |
| **Ahora** | `activo` tipo DEFENSA (sin jugador_lfp). `sincronizar_porterias(jornada_lfp, forzar)` copia los puntos del portero titular real al DEFENSA, preserva manuales (tipo SINCRONIZADO_PORTERIA). |
| **Test real** | **639 filas SINCRONIZADO_PORTERIA** (≈20 porteros × 32 jornadas) en la importación real. Validado con caso (Courtois→portería virtual). |

## 9. Premios y clasificación — ✅

| | |
|---|---|
| **Antes** | `ClasificacionService` (posiciones, V/E/D, beneficio). Premios con reparto de empates (normal 10/5, doble 20/15/5), garantía 1º>2º>3º. Finales Liga 160/110/50, Clausura 70/50/30. |
| **Ahora** | Vistas `v_puntos_jornada_falm` / `v_enfrentamiento_resultado` / `v_clasificacion`. `calcular_premios_jornada` (**regla canónica de empates** que corrige un bug del viejo) + `calcular_premios_competicion`. `recalcular_clasificacion(temp)` escribe el snapshot. |
| **Test real** | Clasificación de pruebas calculada (10 equipos, 3 jornadas, reparto 3/2-1/1.5 correcto: GOLDEN BOYS 5=1V+1Vm). **Premios J1 calculados** (2 filas: 10€ al 1º, 5€ al 2º). |

## 10. Competiciones — ✅

| | |
|---|---|
| **Antes** | LIGA / CHAMPIONS / CLAUSURA. Champions con sorteo de cuartos; Clausura con Final + 3er/4º en J6. Selector en navbar. |
| **Ahora** | 3 competiciones por temporada. **Selector de competición** en Partidos y Clasificación. Champions se muestra como **cuadro eliminatorio** (ida/vuelta agregada, rondas, Final + 3er/4º). Liga/Clausura como tabla. |
| **Test real** | Datos reales: Liga 36j/180p, Champions 7j/18p (cuadro: CHANATIBORG campeón, GB 4º), Clausura 6j/20p. |

## 11. Web scraping — ⛔ (por entorno)

| | |
|---|---|
| **Antes** | Selenium + ChromeDriver (puntuaciones LFP) / JSoup (plantillas) / Football Data API. Único componente atado a servidor. |
| **Ahora** | **Diseñado** (micro-scraper Cloud Run): el scraper queda "tonto" (extrae HTML → llama `ingestar_jornada_cruda` / `ingestar_puntuaciones` por RPC con service_role). La transformación cruda→desglose ya está en SQL (`construir_desglose`). |
| **Test real** | — Mientras tanto la V2 ya tiene los puntos reales importados de pro (vía http extension, solo lectura) en `falm.puntuacion`, así que **no depende del scraper para funcionar hoy**. |
| **Pendiente** | Empaquetar/desplegar el contenedor Java (necesita tu entorno con Java/Docker). |

## 12. Administración y mantenimiento — ✅

| | |
|---|---|
| **Antes** | Player Management (CRUD con auditoría), gestión de jornadas, mantenimiento, sync producción→local. |
| **Ahora** | Panel `/admin` aislado (extraíble a app propia): **Pretemporada** (temporada/jornadas/calendario/draft), **Simulación**, **Jugadores** (editar precio/posición), **Puntuaciones** (corregir por jornada), **Operaciones** (procesar fichajes/heredar/premios/expirar), **Equipos**. |
| **Test real** | Operaciones de pretemporada ejecutándose de verdad (montar temporada de pruebas, generar calendario, recalcular). |

## 13. Reporting y análisis — ✅

| | |
|---|---|
| **Antes** | Estadísticas, análisis de puntuaciones por jornada (`/jornadas-lfp-validas`), calendario LFP. |
| **Ahora** | Pantalla **Stats** (puntuaciones por jornada, clicable → ficha). RPCs `jornadas_lfp_validas` / `puntuaciones_jornada` / `jugador_jornadas` leen de `falm.puntuacion` (ya no de pro). Ficha con gráfico de evolución. |
| **Test real** | `puntuaciones_jornada(20)` = 410 jugadores (top Sergio Carreira 10pts); Mbappé 30 jornadas / 107 pts. |

---

## Resumen de cobertura

| # | Dominio | Estado |
|---|---|---|
| 1 | Auth y permisos | ⚠️ (RLS sí; login real diferido) |
| 2 | Equipos/plantilla | ✅ |
| 3 | Alineaciones | ✅ (jornada partida pendiente) |
| 4 | Mercado/fichajes | ✅ (filtro por temporada pendiente) |
| 5 | Drafts | ✅ (invierno omitido) |
| 6 | Scoring | ✅✅ (validado 1:1 vs pro) |
| 7 | Jornadas/mapeo | ✅ |
| 8 | Porteros virtuales | ✅ |
| 9 | Premios/clasificación | ✅ |
| 10 | Competiciones | ✅ |
| 11 | Scraping | ⛔ (entorno Java) |
| 12 | Admin | ✅ |
| 13 | Reporting | ✅ |

**Conclusión:** 11 de 13 dominios cubiertos y probados sobre datos reales. Pendientes reales: scraping (entorno), login real (decisión), y matices menores (jornada partida, filtro de mercado por temporada). El motor de riesgo alto (scoring, mapeo, porteros, premios) está validado.
