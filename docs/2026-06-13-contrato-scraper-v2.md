# FALM V2 — Contrato de integración del micro-scraper

> **Fecha:** 2026-06-13 · El scraper es el único componente con servidor (Cloud Run).
> Toda la lógica vive en SQL; el scraper solo **obtiene datos** y los **entrega** por RPC.

## Responsabilidad del scraper

1. Abrir la fuente LFP (Selenium/Chrome headless) y extraer, por jugador y jornada:
   estadísticas brutas → `minutos`, `goles`, `goles_penalti`, `penalti_fallado`,
   `estrellas`, `imbatido`, `tarjetas_rojas`, `goles_en_propia`, `penalti_parado`,
   `goles_en_contra`, y el `resultado` del equipo (VICTORIA/EMPATE/DERROTA).
2. **Resolver `activo_id`**: mapear (nombre, equipo LFP) → `jugador_lfp` → su `activo` tipo JUGADOR.
   (El "player matching v3.0" del sistema viejo vive aquí, en el scraper, no en la BD.)
3. Llamar **una** RPC por jornada con el payload.

## RPC de ingesta (ya implementada y validada en SQL)

```
select falm.ingestar_puntuaciones(
  '<jornada_lfp_uuid>',
  '[{"activo_id":"<uuid>","desglose":{"resultado":"VICTORIA","goles":2,"minutos":90,"imbatido":true}}, ...]'::jsonb,
  false   -- sobreescribir: false respeta manuales/automáticos; true fuerza
);
```

La función, por cada activo: resuelve su posición efectiva (DEFENSA = portero virtual juega
de PORTERO), calcula los puntos con `falm.calcular_puntos`, hace `upsert_puntuacion`
(precedencia manual>auto), y al final llama `sincronizar_porterias`. Devuelve nº de filas escritas.

**El scraper NO calcula puntos ni toca porteros virtuales** — todo eso es del backend.

## Acceso

- El scraper usa la **`service_role` key** de Supabase (salta RLS) para invocar la RPC.
- Llamada vía PostgREST `POST /rest/v1/rpc/ingestar_puntuaciones` (header `apikey`/`Authorization: Bearer <service_role>`), o `supabase-js` con la service key en el servidor del scraper.

## Estrategia recomendada (del análisis técnico)

Reusar el `ScrappingService` (Selenium) Java existente casi tal cual, extraído a un
contenedor mínimo: en vez de escribir en la BD Java, construye el payload y llama a
`ingestar_puntuaciones`. Cloud Run scale-to-zero, invocado on-demand/semana.

## Estado del backend (para ambas fases siguientes)

**COMPLETO y validado.** 22 tablas + RLS, 3 vistas, 8 funciones:
`calcular_puntos`, `upsert_puntuacion`, `sincronizar_porterias`, `ingestar_puntuaciones`,
`calcular_premios_jornada`, `calcular_premios_competicion`, `procesar_fichajes`,
`expirar_ofertas` (+ `jornada_objetivo_actual`). pg_cron: expiración horaria + fichajes del martes.

Faltan solo **aplicaciones**: micro-scraper (este contrato) y frontend Angular (consumir
tablas/vistas vía supabase-js + Auth email; exponer schema `falm` en API + grants).
