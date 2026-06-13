# FALM V2 — Vistas de puntos y clasificación (implementadas y validadas)

> **Fecha:** 2026-06-13 · **Migración:** `falm_vistas_clasificacion` · **Estado:** creadas y probadas con caso real.
> Las tres vistas son `security_invoker = true` → respetan el RLS de las tablas base.

## Vistas

1. **`falm.v_puntos_jornada_falm`** `(equipo_falm_id, jornada_falm_id, puntos)`
   Suma los puntos de cada equipo en una jornada FALM **aplicando la regla de suplentes**:
   - puntos de cada activo = suma de `puntuacion` sobre las `jornada_lfp` mapeadas (jornadas dobles incluidas);
   - cuentan los **titulares que jugaron**;
   - por cada **titular que no jugó** (líneas DEFENSA/MEDIO/DELANTERO), entra el **suplente de su línea** con menor `orden` que sí jugó (`row_number() <= nº de vacantes`);
   - el portero no tiene suplente.

2. **`falm.v_enfrentamiento_resultado`** `(enfrentamiento_id, jornada_falm_id, equipo_local_id, equipo_visitante_id, puntos_local, puntos_visitante, diferencia, puntos_clasif_local, puntos_clasif_visitante, jornada_jugada)`
   Reparto simétrico por diferencia: `≥3 → 3-0`, `≥0.5 → 2-1`, `|d|<0.5 → 1.5-1.5`. `jornada_jugada` = hay puntuaciones y ninguna LFP mapeada está `PARCIAL`.

3. **`falm.v_clasificacion`** `(competicion_id, equipo_falm_id, partidos_jugados, puntos_clasificacion, puntos_favor, puntos_contra, victorias, victorias_minimas, empates, derrotas_minimas, derrotas, posicion)`
   Agrega los enfrentamientos jugados por equipo y competición; posición por puntos y luego puntos a favor (`rank()`).

## Validación (caso de prueba ejecutado y luego borrado)

Montado un caso con un titular defensa (5 pts), un titular defensa que **no jugó**, y dos suplentes de defensa que jugaron (3 y 2 pts):

| Comprobación | Esperado | Obtenido |
|---|---|---|
| `v_puntos_jornada_falm` (sustitución) | 5 + 3 = **8** (el 2º suplente NO entra) | **8.00** ✅ |
| `v_enfrentamiento_resultado` (8 vs 4) | diferencia 4 → **3-0** | local 3, visit 0 ✅ |
| `v_clasificacion` | 1º con 3 pts / 1 victoria; 2º con 0 | correcto ✅ |

Datos de prueba eliminados tras la validación (todas las tablas a 0 filas).

## Nota técnica (mejora futura, no urgente)

Las FK `enfrentamiento.equipo_local_id/visitante_id` y `premio.equipo_falm_id` **no** tienen `on delete cascade`. Al borrar una temporada completa, el orden de cascadas de Postgres puede chocar (hay que borrar `enfrentamiento` antes que `equipo_falm`). Para archivar/borrar temporadas con un solo `delete`, conviene añadir cascade a esas FK.

## Pendiente del bloque scoring (Edge Functions, TypeScript)

- `calcular-scoring`: escribe `puntuacion` desde el scraping con precedencia manual>automático y flag `sobreescribir`; sync de porteros virtuales.
- `procesar-fichajes`: cron martes 23:59, 3 desempates en 2 fases, mueve plantillas.
- `calcular-premios`: reparto con empates (reglas v2.9.10) → escribe snapshots en `premio`.
- Expiración de ofertas a 7 días vía `pg_cron`.
