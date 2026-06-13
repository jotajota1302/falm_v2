# Modelo de datos V2 — Bloque NÚCLEO

> **Fecha:** 2026-06-13 · **Estado:** borrador para validación (schema aún NO creado)
> **Alcance:** primer bloque del nuevo modelo de datos de FALM V2 sobre Supabase Postgres.
> Cubre el corazón del sistema: temporadas, competiciones, equipos, catálogo real de
> LaLiga, activos fichables (incluidos porteros virtuales), jornadas con mapeo
> configurable y puntuaciones. Fichajes, alineaciones, premios y auth/RLS son bloques
> posteriores.

## Decisiones de partida (brainstorming 2026-06-13)

1. **Multi-temporada.** `temporada` es la raíz; casi todo cuelga de ella → histórico y palmarés consultables.
2. **Diseño por bloques**, empezando por este núcleo. Cada bloque se valida y se puede crear en Supabase antes de pasar al siguiente.
3. **Se conservan las mecánicas de juego**, pero el **mapeo de jornadas es configurable por temporada** (hoy está hardcoded en `JornadaPartidaConfig.java`). Abierto a rediseños puntuales donde aporten.
4. **Catálogo real separado del activo fichable** → el portero virtual deja de ser un `Jugador` falso.

## Qué mejora respecto al modelo actual

| Problema actual | Causa | Solución en V2 |
|---|---|---|
| Porteros virtuales como `Jugador` con `origen=VIRTUAL` y precio 1.5M | `Jugador` mezcla jugador real + activo + stats | `activo` con `tipo=DEFENSA` que apunta a `equipo_lfp` |
| `PuntosJornada` duplicado en jornadas dobles + sync bidireccional | Puntos anclados a jornada FALM | Puntos anclados a **jornada LFP real** (verdad única); FALM = agregación por mapeo |
| Mapeo y jornadas partidas en código (`JornadaPartidaConfig`) | Configuración hardcodeada | Tablas `jornada_lfp`, `mapeo_jornada`, `partido_lfp` (fechas por partido) |
| Rango LFP fijo (5-36 / 5-38) en código | Constante hardcodeada | El rango válido = "las jornadas LFP que mapees" en esa temporada |
| Stats de equipo (V/E/D, puntos, beneficio) como columnas que hay que recalcular | Datos derivados almacenados | Vistas/funciones derivadas (no se almacenan) |

---

## Esquema del núcleo

### Convenciones
- PK `id uuid default gen_random_uuid()` salvo catálogos estables.
- `created_at timestamptz default now()`, `updated_at` donde aplique.
- Enums como tipos Postgres (`create type ...`).
- RLS se define en el bloque de auth; aquí solo se nombran las tablas.

### 1. `temporada` — raíz
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| nombre | text | "2025-26" |
| anio_inicio | int | 2025 |
| activa | bool | solo una activa a la vez (índice parcial único) |

### 2. `competicion`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| temporada_id | uuid FK→temporada | |
| tipo | enum `competicion_tipo` | LIGA / CHAMPIONS / CLAUSURA |
| nombre | text | |

`unique(temporada_id, tipo)`.

### 3. `equipo_falm` — los equipos de la liga fantasy
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| temporada_id | uuid FK→temporada | |
| usuario_id | uuid FK→auth.users | nullable hasta el bloque auth |
| nombre | text | "GOLDEN BOYS", … |
| presupuesto | numeric(10,2) | |

`unique(temporada_id, nombre)`.
**Stats (V/E/D, puntos, puntos totales, beneficio) NO se almacenan**: se derivan en una vista de clasificación (bloque alineaciones/clasificación).

### 4. `equipo_lfp` — catálogo de clubes de LaLiga
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| nombre | text | "Real Madrid" |
| tla | text | "RMA" (código de 3 letras) |
| escudo_url | text | |

Catálogo **global** (estable entre temporadas). Si en el futuro hace falta controlar qué clubes participan en cada temporada (ascensos/descensos), se añade `equipo_lfp_temporada(equipo_lfp_id, temporada_id)`. No necesario para el núcleo.

### 5. `jugador_lfp` — catálogo de jugadores reales
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| nombre | text | |
| apellido | text | |
| posicion | enum `posicion` | PORTERO / DEFENSA / MEDIO / DELANTERO |

Identidad **estable** del jugador. El club en el que milita **puede cambiar entre temporadas** → se modela aparte:

### 6. `militancia` — en qué club juega un jugador cada temporada
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| jugador_lfp_id | uuid FK→jugador_lfp | |
| equipo_lfp_id | uuid FK→equipo_lfp | |
| temporada_id | uuid FK→temporada | |
| posicion | enum `posicion` | puede variar por temporada |

`unique(jugador_lfp_id, temporada_id)`. Resuelve el caso multi-temporada de jugadores que cambian de club (lo que el modelo actual no contempla bien).

### 7. `activo` — lo fichable en FALM
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| tipo | enum `activo_tipo` | JUGADOR / DEFENSA |
| jugador_lfp_id | uuid FK→jugador_lfp | NOT NULL si tipo=JUGADOR |
| equipo_lfp_id | uuid FK→equipo_lfp | NOT NULL si tipo=DEFENSA |

`CHECK`:
- `tipo=JUGADOR` → `jugador_lfp_id NOT NULL AND equipo_lfp_id IS NULL`
- `tipo=DEFENSA` → `equipo_lfp_id NOT NULL AND jugador_lfp_id IS NULL`

El **portero virtual es un `activo` con `tipo=DEFENSA`** que apunta al club cuya defensa representa. Se ficha en la posición de portero. Ya no es un jugador inventado.

### 8. `plantilla` — pertenencia de un activo a un equipo FALM (por temporada)
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| temporada_id | uuid FK→temporada | |
| equipo_falm_id | uuid FK→equipo_falm | |
| activo_id | uuid FK→activo | |
| precio | numeric(10,2) | precio de fichaje |
| fecha_fichaje | timestamptz | |
| fecha_baja | timestamptz | NULL = en plantilla ahora |

Índice único parcial: un activo solo puede estar en **un** equipo FALM a la vez por temporada
(`unique(temporada_id, activo_id) where fecha_baja is null`).

### 9. `jornada_falm`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| competicion_id | uuid FK→competicion | (lleva temporada implícita) |
| numero | int | 1..N |
| fecha_cierre | timestamptz | cierre de alineaciones |

`unique(competicion_id, numero)`.

### 10. `jornada_lfp`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| temporada_id | uuid FK→temporada | |
| numero | int | jornada real de LaLiga |
| estado | enum `jornada_estado` | PENDIENTE / PARCIAL / COMPLETA (derivable de partidos) |

`unique(temporada_id, numero)`.

### 11. `partido_lfp` — cada partido real con su fecha (mata `JornadaPartidaConfig`)
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| jornada_lfp_id | uuid FK→jornada_lfp | |
| equipo_local_id | uuid FK→equipo_lfp | |
| equipo_visitante_id | uuid FK→equipo_lfp | |
| fecha | timestamptz | |
| goles_local | int | NULL hasta jugarse |
| goles_visitante | int | NULL hasta jugarse |

**La jornada partida se deriva de los datos**: si dentro de una `jornada_lfp` hay partidos con fechas distintas, los equipos cuyos partidos ya se jugaron quedan "bloqueados" automáticamente. El estado PARCIAL = hay partidos sin resultado. Ya no hace falta configurar equipos bloqueados en código.

### 12. `mapeo_jornada` — relación N:M configurable (jornadas dobles gratis)
| Columna | Tipo | Notas |
|---|---|---|
| jornada_falm_id | uuid FK→jornada_falm | |
| jornada_lfp_id | uuid FK→jornada_lfp | |

PK compuesta `(jornada_falm_id, jornada_lfp_id)`. Una jornada FALM con **dos** filas aquí = **jornada doble**, sin registros especiales. El rango LFP válido de la temporada = las jornadas LFP que aparezcan mapeadas. Configurable al montar la temporada.

### 13. `puntuacion` — puntos de un activo en una jornada LFP real (verdad única)
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| activo_id | uuid FK→activo | incluye porteros virtuales (DEFENSA) |
| jornada_lfp_id | uuid FK→jornada_lfp | **ancla a LFP, no a FALM** |
| puntos | numeric(5,2) | total calculado |
| goles | int | desglose |
| asistencias | int | |
| porteria_cero | bool | |
| penaltis | int | |
| tarjeta_roja | bool | |
| goles_en_contra | int | |
| resultado | enum `resultado` | VICTORIA / EMPATE / DERROTA del club |
| tipo_insercion | enum `insercion` | MANUAL / AUTOMATICO |
| updated_at | timestamptz | el más reciente gana |

`unique(activo_id, jornada_lfp_id)`. **Precedencia** manual>automático y flag `sobreescribir`
(specs §6.3) se aplican en la Edge Function de scoring, no en el schema.

---

## Vistas derivadas (no almacenan estado)

- **`v_puntos_jornada_falm`**: para cada `(equipo_falm, jornada_falm)`, suma las `puntuacion` de los activos alineados en las `jornada_lfp` mapeadas. Sustituye al `PuntosJornada` duplicado y a la sincronización bidireccional: ahora es una simple agregación sobre `mapeo_jornada`.
- **Clasificación** (V/E/D, puntos, beneficio): vista/función en el bloque de alineaciones/clasificación.

## Flujo de puntuación (cómo encaja todo)

```
scraping → escribe puntuacion(activo, jornada_LFP)   [una sola fila por activo y jornada real]
                                   │
        mapeo_jornada (N:M, por temporada)  ─────────┐
                                   │                  │
            v_puntos_jornada_falm  ◀──────────────────┘
                                   │
         alineación del equipo FALM (bloque siguiente)
                                   │
         enfrentamiento + reparto 3/2/1.5/1/0 (bloque siguiente)
```

## Fuera de alcance de este bloque (próximos)

- **Fichajes/mercado**: `peticion_fichaje` con los 3 desempates, ofertas de intercambio, fichajes extra.
- **Alineaciones/clasificación**: alineación (titulares/suplentes/formación), enfrentamiento FALM, reparto de puntos, clasificación.
- **Premios**: reparto con empates (reglas v2.9.10), premios de competición.
- **Auth/RLS**: Supabase Auth, roles (usuario/gestor/admin), políticas RLS por tabla.

## Preguntas abiertas para validar

1. ¿`militancia` por temporada te convence, o en la práctica prefieres simplificar y guardar el club directamente en `jugador_lfp` (perdiendo histórico de traspasos)?
2. ¿El desglose de `puntuacion` (goles, asistencias…) como columnas, o prefieres un `jsonb` flexible por si cambian las reglas de scoring?
3. ¿`partido_lfp` con resultado real te vale para derivar victoria/empate/derrota y portería a cero, o ahora esos datos vienen ya calculados del scraping y no guardas los partidos?
