# FALM V2 — Cálculo de premios de jornada (función SQL)

> **Fecha:** 2026-06-13 · **Función:** `falm.calcular_premios_jornada(jornada, normal[], doble[])`
> Determinista → SQL testeable. Escribe snapshots en `falm.premio` (borra y reinserta).

## Regla canónica de reparto con empates (decidida con el usuario)

Cada premio se asocia a una **posición real** (1º, 2º, 3º). Un grupo de equipos
empatados que ocupa varias posiciones **reparte la suma** de los premios de esas
posiciones, a partes iguales. Los equipos más allá de la última posición premiada: 0€.

- **Importes por defecto:** jornada normal `[10, 5]`, jornada doble `[20, 15, 5]`.
- **Jornada doble** se detecta por el mapeo (≥2 `jornada_lfp` mapeadas a la `jornada_falm`).
- Implementada con `rank() over(order by puntos desc)` (posición del grupo) + `count() over(partition by puntos)` (tamaño) + suma de `premios[pos]` sobre el rango de posiciones del grupo.

## Decisión: se corrige un bug del sistema actual

El código Java (`PremioCalculationService`), en **jornada doble con 2 empatados en 1º**, daba el 3er premio (5€) al equipo con la **3ª puntuación distinta**, saltándose al que realmente quedó 3º (2ª puntuación). La regla canónica **lo corrige**: el 5€ va a la posición 3 real. También corrige análogos (p.ej. doble 1-1-1, que el código daba 20/20/0 en vez de 20/15/5).

> El usuario eligió **corregir** (reparto justo) frente a replicar el comportamiento anterior.

## Validación (matemática del reparto, aislada)

| Caso | Entrada | Resultado | OK |
|---|---|---|---|
| Doble, 2 empatados 1º | A10,B10,C8,D6 | A,B=17.5 · **C=5** · D=0 | ✅ |
| Normal, 1º + 2 empatados 2º | A10,B8,C8 | A=10 · B,C=2.5 | ✅ |

`v_puntos_jornada_falm` ya estaba validada por separado; la función solo combina ambas.

## Premios de competición — `falm.calcular_premios_competicion(competicion, premios[])`

Misma regla canónica sobre la **clasificación final** (`v_clasificacion`, orden por
`puntos_clasificacion` y luego `puntos_favor`). El `tipo` de premio se deriva de la
competición (cast `competicion_tipo → tipo_premio`, verificado). Importes los pasa el
llamador: **Liga `[160,110,50]`, Clausura `[70,50,30]`, Champions `[100,60,30]`**.
Snapshot en `premio` (borra y reinserta por competición+tipo).

**Subsistema de premios COMPLETO** (jornada + competición), ambos con la regla canónica.

## Pendiente

- `procesar-fichajes` (3 desempates en 2 fases; determinista → puede ser SQL).
- Expiración de ofertas (`pg_cron`), micro-scraper (Cloud Run).
