# Modelo de datos V2 — Bloque ALINEACIONES + CLASIFICACIÓN

> **Fecha:** 2026-06-13 · **Estado:** diseño validado · **Depende de:** bloque núcleo.
> Cubre las alineaciones por jornada, los enfrentamientos entre equipos FALM y la
> clasificación (derivada). Premios/beneficio van en el bloque de premios.

## Estado del sistema actual (verificado en código)

- **`Alineacion`**: 11 titulares + suplentes **por posición** (máx 2 defensa, 2 medio, 2 delantero; **no hay suplente de portero** — lo cubre el portero virtual). La **formación** es un enum de 7 (`FormacionesEnum`) pero **no se persiste ni se valida** la composición.
- **`Partido`** (enfrentamiento): calendario **round-robin** predefinido (36 jornadas = 4 vueltas, 5 partidos/jornada con 10 equipos). Guarda `puntosLocal/Visitante` y `resultado`.
- **Reparto** (`ClasificacionCalculationService`): diferencia ≥3.0 → 3-0; 0.5-2.99 → 2-1; 0.0 → 1.5-1.5 (simétrico). Distingue victoria total vs mínima.
- **`Clasificacion`**: tabla **persistida** con 3 métodos de recálculo (completo / incremental / sola jornada) → origen de los *cumulative errors* del changelog v2.9.4.
- **Sin sustitución automática** de suplentes: el usuario declara si el suplente jugó; un suplente puntúa solo si jugó.

## Decisiones de diseño

1. **Clasificación derivada por vista** (validado). Se calcula en vivo desde `puntuacion` + alineaciones + `mapeo_jornada`. Sin recálculos, sin errores acumulativos. Coste trivial para 10-16 equipos.
2. **`enfrentamiento` guarda solo el fixture** (jornada + local + visitante). Puntos y resultado se derivan → una sola fuente de verdad.
3. **Formación se persiste** (mejora sobre el actual).
4. **Titulares y suplentes en una sola tabla** (`alineacion_activo`) con un campo `rol`, en vez de 4 listas separadas. Más limpio y extensible.

## Esquema (3 tablas + vistas)

### Tipos nuevos
- `formacion` enum: `5-4-1`, `5-3-2`, `4-5-1`, `4-4-2`, `4-3-3`, `3-4-3`, `3-5-2`.
- `rol_alineacion` enum: `TITULAR`, `SUPLENTE_DEFENSA`, `SUPLENTE_MEDIO`, `SUPLENTE_DELANTERO`.

### 1. `alineacion`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| equipo_falm_id | uuid FK→equipo_falm | |
| jornada_falm_id | uuid FK→jornada_falm | |
| formacion | enum `formacion` | persistida |
| created_at / updated_at | timestamptz | |

`unique(equipo_falm_id, jornada_falm_id)` → una alineación por equipo y jornada.

### 2. `alineacion_activo`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| alineacion_id | uuid FK→alineacion (on delete cascade) | |
| activo_id | uuid FK→activo | |
| rol | enum `rol_alineacion` | titular o suplente de línea |
| orden | int | orden de presentación |

`unique(alineacion_id, activo_id)`. Reglas de composición (11 titulares, máx 2 suplentes por línea, no suplente de portero) se validan en la capa de aplicación/Edge Function, no en el schema (permite estados intermedios al editar).

### 3. `enfrentamiento` — fixture FALM (solo quién juega contra quién)
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| jornada_falm_id | uuid FK→jornada_falm | |
| equipo_local_id | uuid FK→equipo_falm | |
| equipo_visitante_id | uuid FK→equipo_falm | |
| etiqueta | text | NULL en liga; "Final", "3er/4º puesto", "Cuartos"… en eliminatorias |
| created_at | timestamptz | |

`CHECK (equipo_local_id <> equipo_visitante_id)`. El calendario round-robin se genera como **datos** al montar la temporada. Sirve también para cruces eliminatorios (Champions/Clausura) vía `etiqueta`.

## Vistas derivadas (pendientes de la regla de cómputo)

Estas vistas se crean al cerrar el **bloque de scoring** (Edge Functions), porque dependen de la regla exacta de cómo se combinan titulares y suplentes para el total de un equipo en una jornada:

- **`v_puntos_jornada_falm`**: puntos FALM de cada `(equipo, jornada_falm)` = suma de `puntuacion` de los activos alineados (según la regla de suplentes) en las `jornada_lfp` mapeadas.
- **`v_enfrentamiento_resultado`**: para cada `enfrentamiento`, puntos de cada lado (desde la vista anterior), diferencia, tipo de resultado (total/mínima/empate) y puntos de clasificación otorgados (3-0 / 2-1 / 1.5-1.5).
- **`v_clasificacion`**: por equipo y competición, agrega `v_enfrentamiento_resultado` → puntos de clasificación, V/Vmín/E/Dmín/D, puntos totales a favor/contra, posición. El **beneficio** (premios) se añade al integrar el bloque de premios.

## Regla pendiente de precisar (bloque scoring)

Cómo se combinan titulares + suplentes para el total del equipo en una jornada:
- **(A) Solo titulares que jugaron + suplentes que entraron por un titular que no jugó** (sustitución, aunque hoy es manual).
- **(B) Titulares + cualquier suplente que jugó** suman todos.

El modelo (`rol` en `alineacion_activo` + existencia de `puntuacion`) soporta ambas; hay que fijar cuál replica el comportamiento actual antes de escribir `v_puntos_jornada_falm`.
