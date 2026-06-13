# FALM V2 — Operativa (pg_cron, expiración, exposición API)

> **Fecha:** 2026-06-13 · Tareas programadas y pasos de despliegue del backend.

## Hecho

### Expiración de ofertas (pg_cron)
- `falm.expirar_ofertas()`: marca `EXPIRADA` las ofertas `PENDIENTE` con `fecha_expiracion < now()`. Devuelve nº. **Validada** (expira la vencida, respeta la vigente).
- **Extensión `pg_cron` habilitada.** Job `falm-expirar-ofertas` programado **cada hora** (`0 * * * *`): `select falm.expirar_ofertas();`. Activo (jobid 1).

## Pendiente

### Cron de procesamiento de fichajes (martes) — HECHO
- `falm.jornada_objetivo_actual()`: próxima jornada de LIGA (temporada activa) con `fecha_cierre > now()`; `NULL` al final de temporada. `procesar_fichajes(NULL)` devuelve 0 sin error (verificado).
- Job `falm-procesar-fichajes` programado a **`59 22 * * 2`** (martes 22:59 UTC ≈ 23:59 Madrid en invierno). **Nota DST:** en verano (UTC+2) caería a las 00:59 del miércoles Madrid; irrelevante para un deadline "martes noche", ajustable si se desea exactitud.

### Exposición del schema en la API (al montar el frontend)
Para que `supabase-js` acceda al schema `falm` (hoy PostgREST solo expone `public`):
1. **Settings → API → Exposed schemas**: añadir `falm` (no es SQL; config del proyecto).
2. Grants (RLS sigue filtrando filas):
   ```sql
   grant usage on schema falm to authenticated;
   grant select, insert, update, delete on all tables in schema falm to authenticated;
   grant select on all tables in schema falm to anon;  -- solo si se quiere lectura anónima (no recomendado)
   ```
3. **Funciones de mutación** (`procesar_fichajes`, `calcular_premios_*`, `sincronizar_porterias`, `upsert_puntuacion`): **NO** dar `execute` a `authenticated`. Las ejecuta el `service_role` (Edge Function/cron) o el rol admin. `calcular_puntos` (pura) sí puede exponerse.

> Nota: el proyecto es compartido; exponer `falm` no afecta a las otras apps (cada schema es independiente), pero conviene hacerlo solo cuando el frontend lo necesite.

## Resumen del backend FALM V2

Con esto, el **backend de lógica está completo**: 22 tablas + RLS, 3 vistas y 7 funciones
(scoring, porteros, premios jornada/competición, fichajes, expiración), todo validado con
casos. Solo faltan piezas de **infraestructura/UI**: micro-scraper (Cloud Run), cron de
fichajes (tras `jornada_objetivo_actual`), exposición de API y el frontend Angular.
