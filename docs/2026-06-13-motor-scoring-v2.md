# FALM V2 — Motor de scoring (funciones SQL)

> **Fecha:** 2026-06-13 · **Enfoque:** el scoring es determinista → se implementa como
> **funciones SQL** en Postgres (testeable con casos), no como Edge Function TypeScript.
> Las Edge Functions se reservan para lo que necesita servidor (orquestar el scraping).

## Hallazgo clave sobre el flujo de datos

El scraping **NO entrega puntos calculados**: entrega **estadísticas brutas** (eventos, minutos, estrellas). El total de puntos lo calcula el motor. Por eso en el modelo:
- `puntuacion.desglose` (jsonb) = estadísticas brutas del scraping.
- `puntuacion.puntos` = total calculado por `falm.calcular_puntos()`.

## `falm.calcular_puntos(posicion, desglose)` — IMPLEMENTADA y VALIDADA

Reglas exactas (de `PuntuacionService.calcularPuntosTotalesJugador`, líneas 133-235):

| Concepto | Valor |
|---|---|
| Resultado equipo | Victoria +2 · Empate +1 · Derrota 0 |
| Gol normal (por posición) | Portero +5 · Defensa +4 · Medio +3 · Delantero +2 |
| Gol de penalti | **+2 fijo** (no suma valor por posición; `goles` excluye penaltis) |
| Penalti fallado | −2 |
| Asistencia | 0 (no puntúa) |
| Estrellas | +1 por estrella (valor ya procesado; "−" = −1, "SC" = 0) |
| Portería a cero | requiere **>45 min E imbatido** → Portero +2 · Defensa +1 |
| Tarjeta roja | −3 (amarilla: 0) |
| Gol en propia | −1 |
| Penalti parado (portero) | +2 |
| Goles en contra (portero) | −1 por gol **solo si recibió >1** y jugó >0 min |

**Campos del `desglose` jsonb:** `resultado` (VICTORIA/EMPATE/DERROTA), `goles`, `goles_penalti`, `penalti_fallado`, `estrellas`, `imbatido`, `minutos`, `tarjetas_rojas`, `goles_en_propia`, `penalti_parado`, `goles_en_contra`.

**Validación:** 8 casos ejecutados, todos coinciden con el esperado (delantero 2 goles=6, portero imbatido=4, defensa gol+roja=1, portero 3 en contra=−2, portero 1 en contra=1 (no aplica), medio penalti+estrellas=6, defensa imbatido 30min=1, portero para penalti+imbatido=6).

## `falm.upsert_puntuacion(...)` — IMPLEMENTADA y VALIDADA

Tres orígenes (`insercion` enum): `MANUAL`, `AUTOMATICO`, `SINCRONIZADO_PORTERIA` (este último añadido para porteros virtuales).
Regla del flag `sobreescribir` (de `PuntuacionService:589-608`):

| Existente | sobreescribir=true | sobreescribir=false |
|---|---|---|
| (no existe) | crea | crea |
| AUTOMATICO | actualiza | **no toca** |
| SINCRONIZADO_PORTERIA | actualiza | **no toca** |
| MANUAL | actualiza | **actualiza** (permite corregir manuales) |

`falm.upsert_puntuacion(activo, jornada_lfp, puntos, desglose, tipo, sobreescribir)` devuelve `INSERTADO`/`ACTUALIZADO`/`OMITIDO`. **Validada**: 5 transiciones (nuevo→INSERTADO, AUTO+false→OMITIDO, AUTO+true→ACTUALIZADO, MANUAL+true→ACTUALIZADO, MANUAL+false→ACTUALIZADO).

## Pendiente

- `falm.sincronizar_porterias(jornada_lfp)`: copia los puntos del portero titular real a los activos DEFENSA (porteros virtuales), **preservando puntos manuales** (guardar antes / restaurar después; bugfix v2.9.9). Selección del titular: el de menor `orden` que jugó (minutos>0).
- Edge Function / micro-scraper: solo la obtención de datos (navegador), que escribe el `desglose`, llama a `calcular_puntos` y luego a `upsert_puntuacion`.
