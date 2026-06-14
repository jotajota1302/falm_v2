# Research: fuentes de datos para FALM V2 (reducir/eliminar scraping)

> **Fecha:** 2026-06-14 · Objetivo: centralizar la fuente de verdad y minimizar el scraping (la pieza débil).
> Todas las pruebas se hicieron en vivo desde Supabase con la extensión `http` (solo GET).

## Qué necesita el scoring de FALM
- **Estructura**: equipos, escudos, jugadores, posición, fotos.
- **Calendario**: fechas/horarios de cada jornada.
- **Resultado**: marcador del partido (para resultado +2/+1/0, portería a cero, goles en contra).
- **Eventos por jugador**: goles, gol de penalti, penalti fallado/parado, asistencias, tarjetas, minutos, gol en propia.
- **Estrellas Marca/AS**: la valoración editorial de prensa (componente del scoring FALM).

## Fuentes evaluadas (probadas hoy)

### 1. football-data.org API — ✅ funciona, sin navegador
- Token (de la app vieja): `8a3410d9fcd34f94b496b25ed46140dd`.
- Da: equipos, escudos (crests), **fechas/horarios** y **resultados** por jornada, clasificación oficial.
- Probado: `GET /v4/competitions/PD/matches?matchday=15` → Oviedo–Mallorca, 2025-12-05 20:00, marcador. Header `X-Auth-Token`.
- **No da**: nada de fantasy (ni eventos por jugador detallados en free, ni estrellas).

### 2. LaLiga Fantasy Oficial (ex-Marca, Relevo) — ✅ HALLAZGO CLAVE
- Base: `https://api-fantasy.llt-services.com`. La API "vieja" (`/api/v3/players`) está **caída (404)**.
- **Endpoint público VIVO sin token (JSON):** `GET /stats/v1/stats/week/{jornada}`.
- Devuelve, en UNA llamada, toda la jornada:
  - 10 partidos con `localScore`/`visitorScore`/`matchState`/`date`.
  - Cada equipo: `id`, `mainName`, `badgeColor` (escudo).
  - Cada jugador: `id`, `name`, `nickname`, `images` (foto), `positionId` (1=POR,2=DEF,3=MED,4=DEL,5=entrenador), y **`weekPoints`** (puntos fantasy oficiales de esa jornada, incluye negativos).
- **No da (en el endpoint público)**: el **desglose** (goles/penaltis/tarjetas/minutos) ni las **estrellas Marca/AS**. El desglose vive tras la API de la app (token Bearer 24h, frágil).

### 3. API-Football (api-sports.io) — de pago/freemium, robusto
- Da el **desglose por jugador y partido**: goles, asistencias, tarjetas, minutos, sustituciones e incluso rating. Timeline de eventos.
- Free tier ~100 req/día (una jornada ≈ 10 partidos → cabe justo). Alternativas: SportMonks, Highlightly.

### 4. futbolfantasy (scraping actual) — ⛔ exige navegador
- Probado `GET .../laliga/puntos/2025/15/futmondo-prensa` → **timeout, 0 bytes** (protegido). Confirma por qué el viejo usa Selenium.
- Es la **única fuente fácil de las estrellas Marca/AS** (página `futmondo-prensa`).

## Conclusión

**Casi todo lo que antes scrapeábamos ya está en APIs JSON sin navegador:**
- Estructura + escudos + fotos + posiciones + resultados + **un nº de puntos por jugador** → `api-fantasy.llt-services.com/stats/v1/stats/week/{N}` (gratis, sin token, desde pg_cron).
- Calendario/horarios + resultados oficiales → football-data.org.
- Desglose de eventos (si se quiere) → API-Football.

**Lo ÚNICO sin API limpia son las estrellas Marca/AS** (valoración editorial de prensa). Es la pieza irreducible de scraping.

→ Por tanto la fragilidad del scraping se reduce a **una sola pregunta**: ¿el scoring de FALM sigue dependiendo de las estrellas Marca/AS?

## Espectro de decisión

| Opción | Fuentes | Scraping | Implica |
|---|---|---|---|
| **A. Mantener scoring FALM tal cual** | llt-services (estructura/resultados) + API-Football (desglose) + scrape SOLO estrellas | Mínimo (solo estrellas) | Sigue habiendo un scrape pequeño y protegido |
| **B. Evolucionar el scoring a datos con API** | llt-services + (opcional API-Football) | **CERO** | Cambia la "identidad" del scoring (sin estrellas Marca/AS); 100% automatizable en pg_cron + runner ligero |
| **C. Adoptar puntos oficiales** | solo llt-services (`weekPoints`) | **CERO** | El más simple de todos, pero FALM puntuaría como la fantasy oficial (pierde sus reglas propias) |

**Recomendación:** B o A según cuánto valga el "sello FALM" de las estrellas. Si las estrellas son el alma del juego → A (scrape mínimo y aislado, todo lo demás por API). Si se puede prescindir de ellas → B elimina el scraping por completo.
