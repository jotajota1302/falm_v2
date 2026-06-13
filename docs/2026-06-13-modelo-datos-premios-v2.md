# Modelo de datos V2 — Bloque PREMIOS

> **Fecha:** 2026-06-13 · **Estado:** diseño validado · **Depende de:** núcleo + alineaciones.
> Premios de jornada y de competición. El **reparto con empates** es lógica de Edge
> Function; aquí solo el modelo de datos (snapshot persistido y auditable).

## Estado actual (entidad `Premio` verificada)

Campos: `jornada`, `equipo`, `posicion`, `importe`, `tipoPremio` (string), `puntosObtenidos`, `pagado`, `descripcion`, `esJornadaDoble`, `jornadaInicio`/`jornadaFin` (rango para jornadas dobles). `unique(jornada, posicion, tipo_premio)`.

Reglas de reparto (specs §9, v2.9.10):
- **Jornada normal** (10€+5€): empate 1º → reparto a partes iguales; 1 primero + varios 2º → 1º 10€, resto reparte 5€.
- **Jornada doble** (20€+15€+5€): combinaciones según empates, garantizando que el 1º siempre gana más.
- **Competición**: Liga 160/110/50; Clausura 70/50/30 (J6); Champions 100/60/30.

## Decisiones de diseño

1. **Premio = snapshot persistido** (no vista). Es dinero real con flag `pagado` → se congela al calcular, es auditable. (La clasificación sí es vista; los premios no.)
2. **`tipo` como enum** (JORNADA / LIGA / CLAUSURA / CHAMPIONS) en vez de string libre.
3. **Sin `jornada_inicio`/`jornada_fin`**: la jornada doble ya se modela con `mapeo_jornada` (N:M). `es_jornada_doble` se deriva de contar mapeos de la jornada → no se almacena.
4. Un premio de **jornada** referencia `jornada_falm_id`; uno de **competición** referencia `competicion_id`. El reparto con empates → Edge Function `calcular-premios`.

## Esquema (1 tabla)

### Tipo nuevo
- `tipo_premio` enum: JORNADA, LIGA, CLAUSURA, CHAMPIONS.

### `premio`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| equipo_falm_id | uuid FK→equipo_falm | ganador |
| tipo | enum `tipo_premio` | |
| jornada_falm_id | uuid FK→jornada_falm | set si tipo=JORNADA |
| competicion_id | uuid FK→competicion | set si premio de competición |
| posicion | int | 1, 2, 3… |
| importe | numeric(10,2) | congelado |
| puntos_obtenidos | numeric(6,2) | snapshot informativo |
| descripcion | text | |
| pagado | bool | default false |
| created_at | timestamptz | |

`CHECK`: al menos uno de `jornada_falm_id` / `competicion_id` no nulo.
Índices: `(jornada_falm_id)`, `(competicion_id)`, `(equipo_falm_id)`.
Con empates puede haber varios equipos en la misma `posicion` → **no** se fuerza unicidad por posición; la unicidad lógica (un premio por equipo/jornada/tipo) la garantiza la Edge Function al recalcular (borra y reinserta).
