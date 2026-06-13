# Modelo de datos V2 — Bloque FICHAJES + MERCADO

> **Fecha:** 2026-06-13 · **Estado:** diseño validado · **Depende de:** bloque núcleo.
> Peticiones de fichaje semanales (con desempates), ofertas de intercambio, fichajes
> extra por lesión y mercado libre. Los desempates y el procesamiento son lógica de
> Edge Function; aquí va solo el modelo de datos.

## Estado del sistema actual (verificado en código)

- **`PeticionFichaje`**: equipo, `jugadorPrioridad1`, `jugadorPrioridad2`, `jornadaObjetivo`, `semana`, `temporada`, `fechaCreacion/Procesamiento/Limite`, `estado` (PENDIENTE/PROCESADA/RECHAZADA/EXPIRADA), `observaciones`, FK opcional a `FichajeExtra`. Exactamente **2 opciones** (prioridad 1 y 2).
- **Desempates** (`PeticionFichajeService.resolverConflicto`): 1º no fichó la jornada anterior; 2º menor en clasificación; 3º menor en puntos totales. Procesamiento en 2 fases (prioridad 1, luego prioridad 2). Cron martes 23:59.
- **`OfertaIntercambio`** + **`OfertaJugador`** (tipo OFRECIDO/SOLICITADO): estado (PENDIENTE/ACEPTADA/RECHAZADA/CANCELADA/EXPIRADA), comentario, `fechaExpiracion = creación + 7 días`, `motivoRechazo`.
- **`FichajeExtra`** (por lesión): equipo, `jugadorLesionado`, `urlNoticia`, `usado`, `jornadaUsada`, `fechaUso`. 1 lesión = 1 fichaje extra.
- **Mercado libre**: no hay entidad; un jugador está libre si `equipoFalm IS NULL`. Precio en `Jugador.precio` (fijo).

## Decisiones de diseño

1. **Opciones como tabla** (`peticion_fichaje_opcion` con `prioridad`) en vez de dos columnas fijas → mismo criterio que `alineacion_activo`; admite extender el nº de opciones sin cambiar el schema.
2. **"Libre" se deriva**, no es flag: un activo está libre en una temporada si no tiene fila en `plantilla` con `fecha_baja IS NULL`. No hace falta entidad "mercado".
3. **Sin columnas redundantes** `semana`/`temporada`: se derivan de `jornada_objetivo` (→ competición → temporada) y del `equipo_falm` (que ya es por temporada).
4. **Precio de mercado en `activo`** (`precio_mercado`, fijo como hoy `Jugador.precio`); `plantilla.precio` = lo que pagó el equipo al ficharlo.
5. Desempates y procesamiento por fases → **Edge Function** `procesar-fichajes`, no schema.

## Ajuste al núcleo

```sql
alter table falm.activo add column precio_mercado numeric(10,2) not null default 0;
```

## Esquema (5 tablas)

### Tipos nuevos
- `estado_peticion` enum: PENDIENTE, PROCESADA, RECHAZADA, EXPIRADA.
- `estado_oferta` enum: PENDIENTE, ACEPTADA, RECHAZADA, CANCELADA, EXPIRADA.
- `tipo_oferta_activo` enum: OFRECIDO, SOLICITADO.

### 1. `peticion_fichaje`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| equipo_falm_id | uuid FK→equipo_falm | (lleva temporada) |
| jornada_objetivo_id | uuid FK→jornada_falm | fin de semana destino |
| estado | enum `estado_peticion` | default PENDIENTE |
| fecha_creacion | timestamptz | |
| fecha_limite | timestamptz | martes 23:59 |
| fecha_procesamiento | timestamptz | NULL hasta procesar |
| observaciones | text | log / motivo |
| fichaje_extra_id | uuid FK→fichaje_extra | NULL = petición normal |

### 2. `peticion_fichaje_opcion`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| peticion_id | uuid FK→peticion_fichaje (cascade) | |
| activo_id | uuid FK→activo | jugador objetivo |
| prioridad | int | 1, 2, … |

`unique(peticion_id, prioridad)` y `unique(peticion_id, activo_id)`.

### 3. `oferta_intercambio`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| equipo_oferente_id | uuid FK→equipo_falm | |
| equipo_receptor_id | uuid FK→equipo_falm | |
| estado | enum `estado_oferta` | default PENDIENTE |
| comentario | text | |
| fecha_creacion | timestamptz | |
| fecha_respuesta | timestamptz | |
| fecha_expiracion | timestamptz | creación + 7 días |
| motivo_rechazo | text | |

`CHECK (equipo_oferente_id <> equipo_receptor_id)`. Expiración a 7 días vía `pg_cron` (bloque de jobs).

### 4. `oferta_activo`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| oferta_id | uuid FK→oferta_intercambio (cascade) | |
| activo_id | uuid FK→activo | |
| tipo | enum `tipo_oferta_activo` | OFRECIDO / SOLICITADO |

### 5. `fichaje_extra`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| equipo_falm_id | uuid FK→equipo_falm | |
| activo_lesionado_id | uuid FK→activo | lesión que da derecho |
| url_noticia | text | comprobante |
| fecha_solicitud | timestamptz | |
| usado | bool | default false |
| jornada_usada_id | uuid FK→jornada_falm | NULL hasta usarse |
| fecha_uso | timestamptz | |

## Lógica fuera del schema (Edge Functions / jobs)

- **`procesar-fichajes`** (cron martes 23:59): resuelve conflictos con los 3 desempates en 2 fases (prioridad 1 → prioridad 2), mueve el activo (alta en `plantilla` del ganador, baja del anterior), marca estados.
- **Expiración de ofertas** (`pg_cron`): marca EXPIRADA las ofertas con `fecha_expiracion < now()` y estado PENDIENTE.
- **Cálculo de `jornada_objetivo`** y `fecha_limite`: en la capa de aplicación al crear la petición.
