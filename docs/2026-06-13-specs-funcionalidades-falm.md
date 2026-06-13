# Specs de Funcionalidades — FALM (estado actual)

> **Propósito:** capturar TODO lo que la app hace hoy, por dominios, como base de verdad
> para la migración. Si algo no está aquí, corre el riesgo de perderse al reescribir.
> **Fecha:** 2026-06-13 · **Versión analizada:** v2.9.13
> **Stack actual:** Spring Boot 2.7.18 (Java 8) + PostgreSQL + Angular 18 + Selenium/JSoup

---

## 0. Glosario rápido

| Término | Significado |
|---|---|
| **FALM** | La liga fantasy privada (Fantasy Andaluza League Management). |
| **LFP** | LaLiga real, fuente de datos de partidos y estadísticas. |
| **Jornada FALM** | Jornada de la liga fantasy (1-32). |
| **Jornada LFP** | Jornada real de LaLiga (5-36 son las válidas). |
| **Mapeo FALM↔LFP** | Tabla que vincula cada jornada FALM con su(s) jornada(s) LFP. |
| **Portero virtual** | Jugador sintético que representa la defensa de un equipo LFP. |
| **Jornada doble** | Una jornada FALM que cubre dos jornadas LFP (premios x2). |
| **Jornada partida** | Una jornada LFP que se juega en varias fechas (estado PARCIAL). |

---

## 1. Autenticación y permisos

- **Login** por usuario (nombre de equipo) + contraseña. El backend devuelve `true/false`.
- Sesión guardada en `sessionStorage` (`user`, `equipoId`). **No hay JWT**.
- `AuthGuard` protege todas las rutas salvo `/login`.
- **Permisos hardcoded en el frontend** (`PermisosService`):
  - `isAdmin()` → usuario exacto `"GOLDEN BOYS"`.
  - `canManageJugadores()` → `["GOLDEN BOYS", "MANCHESTER", "TOBAGO", "CHANATIBORG"]`.
- **Deuda conocida:** contraseñas sin hash robusto, permisos en cliente (cualquiera puede saltarlos), token de football-data.org expuesto en `environment`.

**Spec funcional a preservar:** el sistema distingue 3 niveles → usuario normal, gestor de jugadores, admin total. Cualquier rediseño debe mantener estos 3 roles.

---

## 2. Equipos y plantilla

**Entidades:** `EquipoFalm`, `Jugador`.

- Cada equipo tiene: presupuesto, puntos, puntos totales, victorias/empates/derrotas, beneficio.
- Cada jugador tiene: nombre, apellido, **precio**, **posición** (Portero/Defensa/Medio/Delantero), equipo LFP, flags `lesionado`/`baja`, y estadísticas acumuladas (puntos totales, goles, asistencias, estrellas, imbatidos, penaltis parados).
- **Plantilla personal** (`/plantilla`): ver mis jugadores agrupados por posición con puntuaciones.
- **Plantillas de otros** (`/plantillas`): consultar equipos rivales con estadísticas.
- **Equipos LFP** (`/equiposlfp`): plantillas reales de LaLiga, alimentadas por scraping + Football Data API.

**Reglas implícitas:** un jugador pertenece a un único equipo FALM (o está libre). El precio condiciona fichajes.

---

## 3. Alineaciones

**Entidad:** `Alineacion` (titulares + suplentes, formación, vinculada a Partido y EquipoFalm).

- **Crear/editar alineación** (`/alineacion-new`): drag & drop, **11 titulares + 3 suplentes por posición**, selección de formación.
- **Repetir alineación anterior**: reutiliza la última disponible.
- **Copiar de Liga a Champions**: clona la alineación entre competiciones.
- **Validación temporal**: las alineaciones se cierran por fecha de jornada.
- **Jornada partida (PARCIAL)**: si una jornada LFP se juega en varias fechas, se **bloquean los jugadores de equipos que ya jugaron** pero el resto queda abierto. La clasificación NO se calcula hasta que la jornada esté completa. Configurado en código (`JornadaPartidaConfig`), sin tocar BD.

**Spec a preservar:** el bloqueo selectivo por equipo en jornadas partidas es lógica de negocio sutil — fácil de perder en una reescritura.

---

## 4. Mercado y fichajes

### 4.1 Mercado libre (`/mercado`)
- Búsqueda de jugadores **libres** con paginación (25/página) y filtros (nombre/equipo/posición).
- Fichar un jugador libre directamente (sujeto a presupuesto).

### 4.2 Fichajes semanales (`/fichajes`) — sistema de peticiones
**Entidad:** `PeticionFichaje`, estados `PENDIENTE/PROCESADA/RECHAZADA`.

- **Deadline: martes 23:59.** Cada equipo pide **1-2 jugadores por prioridad**.
- Tras la jornada se abre la ventana → cierra el martes → apunta al **siguiente fin de semana** (salta jornadas entre semana).
- **Resolución automática de conflictos** cuando varios equipos piden el mismo jugador, con criterios de desempate **ordenados**:
  1. No fichó la semana anterior.
  2. Menor en la clasificación.
  3. Menor en puntos totales.
  *(Se eliminó el criterio de fecha de creación.)*
- Intercambio de jugadores, historial y **deshacer** últimos fichajes.

**Endpoints:** `/resumen-semanal/{equipoId}`, `/crear`, `/actualizar/{id}`, `/mantenimiento/por-jornada/{jornada}`, `/resumen-jornadas`.

**Spec crítica a preservar:** los 3 criterios de desempate en ese orden exacto. Es el corazón de la "justicia" de la liga.

### 4.3 Ofertas de intercambio
**Entidad:** `OfertaIntercambio` + `OfertaJugador` (OFRECIDO/SOLICITADO).
- Crear oferta entre dos equipos (jugadores ofrecidos vs solicitados), estado, **expiración automática (7 días)**, motivo de rechazo.
- Bandejas de enviadas/recibidas, aceptar/rechazar.

### 4.4 Fichajes extra
**Entidad:** `FichajeExtra` — fichajes fuera de draft (p. ej. por lesión).

---

## 5. Drafts

- **Draft inicial** (`/draft`): rondas, turnos, orden de equipos, picks. **Deshabilitado esta temporada** (fichaje manual).
- **Draft de invierno** (`/draft-invierno`): candidatos, participación, resultados, para refuerzos en enero.

**Spec a preservar:** aunque deshabilitado, el modelo de draft (orden, rondas, picks) debe conservarse si se quiere reactivar.

---

## 6. Scoring (motor de puntuación)

**Servicio clave:** `ScoringCalculationService` + `PuntuacionCalculadora`.

### 6.1 Puntos por jugador
| Concepto | Puntos |
|---|---|
| Victoria de su equipo LFP | +2 |
| Empate | +1 |
| Derrota | 0 |
| Gol (Portero) | +5 |
| Gol (Defensa) | +4 |
| Gol (Medio) | +3 |
| Gol (Delantero) | +2 |
| Penalti marcado | +2 (extra) |
| Portería a cero (Portero) | +2 |
| Portería a cero (Defensa) | +1 |
| Tarjeta roja | −3 |
| Gol en contra (Portero/Defensa) | −1 |

### 6.2 Clasificación del enfrentamiento FALM
Cada jornada enfrenta a dos equipos FALM; el reparto de puntos depende de la diferencia:
| Diferencia de puntos | Reparto |
|---|---|
| ≥ 3.0 | 3 - 0 |
| 0.5 – 2.9 | 2 - 1 |
| 0.0 (empate) | 1.5 - 1.5 |

### 6.3 Origen de los datos de puntuación
- **Manual** (`partidofalm`): entrada a mano, `tipoInsercion: MANUAL`. **Nunca se sobrescribe por auto-sync.**
- **Automático** (scraping): puntos copiados desde la fuente LFP.
- **Regla de precedencia:** manual > automático; el más reciente gana; clasificación asíncrona con 500ms de retardo.
- **Flag `sobreescribir`** (v2.9.11):
  - `true` → siempre actualiza (manual o auto).
  - `false` → actualiza solo si no hay dato O si el dato es MANUAL (permite corregir manuales sin tocar automáticos).

**Spec crítica:** la jerarquía manual>automático y el comportamiento del flag `sobreescribir` son lógica de negocio dura, resultado de varios bugfixes. Reescribir esto sin replicar exactamente reintroduce bugs ya resueltos.

---

## 7. Jornadas y mapeo FALM↔LFP

**Entidades:** `Jornada`, `JornadaLFP`, `MapeoJornadaFalmLfp`, `PuntosJornada`.

- **Rango válido LFP: 5-36** (las jornadas 1-4 se eliminaron del sistema). *(Nota: el último commit amplió el rango válido LFP a 5-38 en el cálculo automático — verificar el rango definitivo al migrar.)*
- Cada jornada FALM muestra puntos **solo de sus jornadas LFP mapeadas**.
- `PuntosJornada` guarda estadísticas por jugador-jornada con `jornadaLFPNumero`.
- **Jornadas dobles:** una jornada FALM puede mapear 2 jornadas LFP → se crean **2 registros `PuntosJornada` separados** por jornada FALM, con sincronización bidireccional de puntos y estados "ha jugado".

**Spec crítica:** nunca mezclar números de jornada FALM y LFP. El mapeo es la columna vertebral del sistema de puntuación.

---

## 8. Porteros virtuales

**Entidades:** `Jugador` (posición=Portero, origen=VIRTUAL, precio 1.5M), `PorteroPorteria`, `PorteriaVirtual`.

- Un portero virtual representa la **defensa de un equipo LFP** como si fuera un jugador fichable.
- **Puntos manuales** (partidofalm): `tipoInsercion: MANUAL`, nunca sobrescritos por sync.
- **Puntos automáticos** (scraping): copia los puntos del portero titular real vía `PuntuacionIntegrationService`.
- **Sync:** `calcularPuntuacionesAutomatico()` → `sincronizarTodasLasPorteriasParaJornada()`. Manual vía `POST /porterias-virtuales/sincronizar-todas`.
- **Reglas:** manual > automático; el más reciente gana; nunca se sincroniza en updates individuales.
- **Bugfix preservado (v2.9.9):** los puntos manuales se guardan ANTES de copiar estadísticas y se restauran DESPUÉS, para que el sync no los pise.

**Endpoints:** `/porterias-virtuales/{inicializar|sincronizar-todas|sincronizar-jornada/{n}}`.

**Spec crítica:** este es el subsistema más sutil de la app. La preservación de puntos manuales del portero virtual costó varios bugfixes.

---

## 9. Premios y clasificación

**Entidades:** `Premio`, `Clasificacion`.

### 9.1 Clasificación
- `ClasificacionService` calcula posiciones, puntos acumulados, V/E/D y beneficios.
- 3 modos de cálculo (acumulado, por jornada, etc.).
- No se calcula para jornadas en estado PARCIAL.

### 9.2 Premios — reparto con empates (v2.9.10)
**Jornadas NORMALES (10€ + 5€ = 15€):**
- 2+ empatados 1º → repartir los 15€ a partes iguales entre los primeros.
- 1 primero + varios 2º → 1º gana 10€, repartir 5€ entre los segundos.

**Jornadas DOBLES (20€ + 15€ + 5€ = 40€):**
- 3+ empatados 1º → repartir los 40€ entre los primeros.
- 2 empatados 1º → repartir 35€ (20+15) entre ellos, 5€ al 3º.
- 1 primero + varios 2º → 1º gana 20€, repartir 20€ (15+5) entre los segundos.

**Garantía:** el 1º siempre gana más que 2º/3º, independientemente de los empates.

### 9.3 Premios de competición (commits recientes)
- **Liga:** 160/110/50 al 1º/2º/3º.
- **Clausura:** 70/50/30 al 1º/2º/3º de la J6.

**Spec crítica:** las fórmulas de reparto con empates son lógica de negocio densa y resultado de un bugfix de equidad. Hay que replicarlas exactamente (idealmente con tests).

---

## 10. Competiciones

**Entidad:** `Competicion` (LIGA / CHAMPIONS / CLAUSURA).
- **Liga** (`/clasificacion`, `/jornadafalm`): competición principal.
- **Champions** (`/champions`): clasificación y jornadas propias; sorteo de cuartos (dialog).
- **Clausura** (`/clausura`): competición de cierre; genera **Final + 3er/4º puesto en la jornada 6**, editables manualmente.
- Selector de competición en el navbar (estado `competicion-state` con BehaviorSubject).

---

## 11. Web scraping (dependiente de servidor)

**Servicios:** `ScrappingService` (Selenium), `LightweightScrapingService` (JSoup), `ExternalScrapingService`.

- **Selenium + ChromeDriver** para puntuaciones LFP (la fuente exige ejecutar JS).
- **JSoup** para scraping ligero (plantillas) cuando no hace falta JS.
- **Football Data API** (`api.football-data.org/v4`) como fuente complementaria de equipos/datos.
- En dev: ChromeDriver local en `resources/chromedriver-win64/`. En Heroku: buildpack Chrome.
- Modo dual: Selenium local / JSoup en producción.

**Spec crítica para la migración:** ESTE es el único componente que ata el sistema a un servidor. Define la arquitectura destino (ver análisis técnico).

---

## 12. Administración y mantenimiento

- **Player Management** (`/player-management`): CRUD de jugadores con **auditoría** (usuario, timestamp, optimistic lock), estados AUTOMATICO/MANUAL_VERIFIED/REQUIRES_REVIEW.
- **Gestión de jornadas** (`/gestion-jornadas`): procesamiento de puntuaciones, gestión de jornadas.
- **Mantenimiento** (`/mantenimiento`): limpieza de datos, sincronización, init de sistemas.
- **Endpoints sensibles** (deshabilitados en prod): `/init/sistema/limpiar`, `/arrancar`, `/simular-datos`.
- **Sync producción→local** (`/init/sincronizar-datos-produccion`): triple validación, producción solo-lectura, sincroniza 8 tablas.
- **Limpieza de huérfanos** (`/init/limpiar-registros-huerfanos`): borra `PuntosJornada` sin padre.

---

## 13. Reporting y análisis

- **Estadísticas** (`/estadisticas`): análisis globales.
- **Análisis de puntuaciones** (`/puntuaciones-analisis`): desglose por jornada y jugador, usa `/jornadas-lfp-validas`.
- **Jornada LFP** (`/jornadaliga`): calendario de LaLiga con fechas y resultados.

---

## 14. Inventario de dominios (resumen para la migración)

| # | Dominio | Complejidad lógica | ¿Portable a cliente/Edge/DB? |
|---|---|---|---|
| 1 | Auth y permisos | Baja | → Supabase Auth + RLS |
| 2 | Equipos/plantilla | Baja | → tablas + RLS |
| 3 | Alineaciones | **Media** (jornada partida) | → Edge Function (validación) |
| 4 | Mercado/fichajes | **Alta** (desempates) | → Edge Function |
| 5 | Drafts | Media | → Edge Function |
| 6 | Scoring | **Alta** | → Edge Function + funciones Postgres |
| 7 | Jornadas/mapeo LFP | **Alta** | → tablas + funciones Postgres |
| 8 | Porteros virtuales | **Muy alta** | → Edge Function (cuidado extremo) |
| 9 | Premios/clasificación | **Alta** | → funciones Postgres + Edge |
| 10 | Competiciones | Media | → tablas + lógica mixta |
| 11 | Scraping | Media | **NO portable → micro-backend** |
| 12 | Admin/mantenimiento | Media | → Edge Function (rol admin) |
| 13 | Reporting | Baja | → vistas Postgres |

**Riesgo de migración alto:** dominios 6, 7, 8, 9 (scoring, mapeo, porteros virtuales, premios). Son el resultado de ~15 bugfixes documentados en el changelog. **Recomendación: tests de caracterización antes de reescribir** (capturar entradas/salidas reales del sistema actual y validarlas contra el nuevo).
