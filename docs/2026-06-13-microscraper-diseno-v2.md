# FALM V2 — Diseño del micro-scraper

> **Fecha:** 2026-06-13 · Único componente con servidor. Extrae datos de la fuente LFP
> y los entrega al backend por RPC. Cero lógica de negocio (vive toda en SQL).

## Decisiones

- **Reusar el `ScrappingService` Java/Selenium existente** (parsing frágil ya probado contra `futbolfantasy.com`), no reescribir el parsing. App **Spring Boot mínima** (solo `RestController` + RestTemplate, sin JPA).
- **Despliegue:** contenedor en **Google Cloud Run** (scale-to-zero), invocado on-demand/semana.
- **El scraper forma el `desglose`** (deriva `resultado`/`imbatido`/contadores del marcador y los eventos) y llama a `falm.ingestar_puntuaciones` con la **service_role key**.

## Arquitectura

```
Cron / admin  ──POST /scrape?jornada=N──▶  Cloud Run (scraper)
                                              │ Selenium + Chrome headless
                                              │ futbolfantasy.com/.../{year}/{N}/futmondo-prensa
                                              ▼
                          ScrappingService (copiado) → PartidoJornadaDto[]
                                              │ DesgloseMapper (NUEVO)
                                              ▼
                          payload [{activo_id, desglose}]   ← MatchingService (NUEVO): nombre+equipo → activo_id
                                              │ SupabaseClient (NUEVO): POST /rest/v1/rpc/ingestar_puntuaciones
                                              ▼
                          Supabase  →  ingestar_puntuaciones(jornada_lfp, payload, sobreescribir)
```

## Qué se copia del repo viejo (con refactor mínimo)

| Origen (`FalmBack`) | Cambio |
|---|---|
| `ScrappingService.java` (~1181 l.) | Quitar `EquipoLFPRepository` (JPA) → `EquipoLfpDto` plano + cache desde Supabase |
| `LightweightScrapingService.java` (JSoup fallback) | Igual |
| `PartidoJornadaDto`, `PuntosJugadorJornadaDto`, `EventsEnum` | Quitar `EquipoLFP` entity → DTO plano |
| Config ChromeDriver (`:1090-1146`) | Conservar (headless, ruta Chrome del contenedor) |

## Piezas NUEVAS

### 1. `DesgloseMapper` — `PuntosJugadorJornadaDto` + marcador → `desglose` jsonb
```
resultado   = si su equipo marcó más → VICTORIA; igual → EMPATE; menos → DERROTA
goles       = count(eventos == GOL)                       // normales (sin penalti)
goles_penalti      = count(GOL_DE_PENALTI)
penalti_fallado    = count(PENALTI_FALLADO)
penalti_parado     = count(PENALTI_PARADO)
goles_en_propia    = count(GOL_EN_PROPIA)
tarjetas_rojas     = count(ROJA) + count(DOBLE_AMARILLA)
estrellas          = parse(estrellas)                      // "7.0" → 7.0  (regla: cada estrella +1; "-" → -1; "SC" → 0)
minutos            = minutos
imbatido           = (goles encajados por su equipo == 0)  // del marcador
goles_en_contra    = goles del equipo rival                // solo lo usa el scoring si es portero y >1
```
(Las reglas de puntos NO se aplican aquí — eso es `falm.calcular_puntos` en el backend.)

### 2. `MatchingService` — (nombre, equipo LFP) → `activo_id`
Resuelve el nombre en bruto a `jugador_lfp` (consulta Supabase: por `equipo_lfp` + nombre normalizado, con el "player matching v3.0": exacto → parcial → casos especiales) y de ahí a su `activo` tipo JUGADOR. Cachea el catálogo de la temporada al arrancar.

### 3. `SupabaseClient` — RPC
`POST {SUPABASE_URL}/rest/v1/rpc/ingestar_puntuaciones` con headers `apikey`/`Authorization: Bearer {SERVICE_ROLE_KEY}` y body `{p_jornada_lfp, p_payload, p_sobreescribir}`. Una llamada por jornada.

### 4. `ScraperController` — `POST /scrape`
Params: `jornada` (LFP), `year`, `sobreescribir`. Orquesta: scrape → map → match → ingest. Devuelve resumen (nº jugadores, nº escritos, no-encontrados).

## Dependencias (pom.xml mínimo)
`spring-boot-starter-web`, `selenium-java 4.11`, `jsoup 1.18.3`. Sin JPA, sin base de datos local.

## Dockerfile (esquema)
Base `eclipse-temurin:8-jre` + Chrome headless + ChromeDriver (o imagen `selenium/standalone-chrome`). Exponer 8080. Cloud Run: 1 vCPU / 1-2 GB, `min-instances=0`.

## Variables de entorno
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CHROME_BIN`.

## Validación (cuando se implemente)
- Test del `DesgloseMapper` con eventos conocidos → desglose esperado (unit test puro, sin red).
- Scrape de una jornada real ya cerrada → comparar puntos resultantes con los del sistema viejo (test de caracterización).

## Pendiente de decisión menor
- ¿`year` y número de jornada LFP se pasan por request o el scraper los deriva de la `jornada_lfp` de Supabase? (Recomendado: el caller pasa el `jornada_lfp` uuid y el scraper lee su `numero`/temporada de Supabase para construir la URL.)
