# FALM V2 — Procesamiento de fichajes (función SQL)

> **Fecha:** 2026-06-13 · **Función:** `falm.procesar_fichajes(jornada_falm)`
> Determinista → SQL (plpgsql). El cron del martes 23:59 solo la invoca.

## Mecánica (verificada en `PeticionFichajeService`)

- **2 fases**: prioridad 1, luego prioridad 2. En V2 se unifican en un bucle `1..2`: el filtro `activo_fichado_id IS NULL` excluye automáticamente a los equipos que ya ficharon en la fase anterior.
- **3 desempates** (orden exacto) cuando varios equipos piden el mismo activo:
  1. **No fichó la jornada anterior** (el que no fichó gana; `false` ordena primero).
  2. **Menor clasificación** (`v_clasificacion.puntos_clasificacion` asc).
  3. **Menor puntos a favor** (`v_clasificacion.puntos_favor` asc).
  > La clasificación "hasta la jornada anterior" sale gratis: al procesar antes de jugar la jornada objetivo, `v_clasificacion` ya refleja solo lo jugado.
- Estado final: todas las peticiones quedan **PROCESADA** (con o sin fichaje); el motivo va en `observaciones`.

## Mejoras sobre el sistema actual (decididas con el usuario)

El código Java **no validaba nada** (ni presupuesto ni plantilla) y al fichar nadie salía. En V2:
- **Validación de presupuesto**: el activo se asigna al **primer solicitante por desempate que pueda pagar** `precio_mercado`; se resta del presupuesto. Si el ganador del desempate no llega, pasa al siguiente.
- **Sin tope fijo de plantilla**: el límite lo marca el presupuesto (decisión del usuario). La plantilla se autorregula por el dinero.
- El fichaje da de alta en `plantilla` (historial con `fecha_fichaje`/`fecha_baja`); el campo `activo_fichado_id` en `peticion_fichaje` registra el resultado y alimenta el desempate "fichó la jornada anterior".

## Validación (caso ejecutado y borrado)

E1 (presup. 100, fichó la jornada anterior) y E2 (presup. 40, no fichó) piden el mismo activo (precio 50) en prioridad 1:
- Desempate favorece a **E2** (no fichó), pero 40 < 50 → no puede.
- Resultado: **ficha E1** (100→50); E2 sin fichaje, observación de presupuesto insuficiente. ✅

## Pendiente del bloque #6 (operativa, no SQL de lógica)

- **Expiración de ofertas** a 7 días → función trivial + `pg_cron`.
- **Micro-scraper** (Cloud Run): único componente con servidor; obtiene el `desglose` por jugador y llama por RPC a `calcular_puntos` + `upsert_puntuacion` + `sincronizar_porterias`.
- Cron del martes 23:59 → `pg_cron` que invoca `procesar_fichajes` para la jornada objetivo.
