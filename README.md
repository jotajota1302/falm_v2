# FALM V2

Segunda versión de **FALM** (Fantasy Andaluza League Management), la liga fantasy de LaLiga.

Este repositorio es la **evolución** de la app actual:
- **Producción actual:** [ligafalm.com](https://ligafalm.com) (Angular 18 + Spring Boot + Heroku). Sigue funcionando intacta.
- **V2 (este repo):** reescritura sobre Supabase (Postgres + Auth + Edge Functions) + Angular, con un micro-servicio mínimo solo para el scraping, mejor UX y mayor autonomía de mantenimiento.

La V2 se desarrolla **en paralelo** y se despliega en un proyecto Vercel aparte, para poder **probar y comparar** contra la versión en producción sin riesgo para la liga.

## Documentación

Toda la documentación de análisis y planificación está en [`docs/`](./docs):

| Documento | Contenido |
|---|---|
| [Specs de funcionalidades](./docs/2026-06-13-specs-funcionalidades-falm.md) | Qué hace la app actual, por dominios. Base de verdad para no perder nada. |
| [Análisis de evolución técnica](./docs/2026-06-13-analisis-evolucion-tecnica.md) | Arquitectura destino, migración Heroku→Supabase, viabilidad del plan gratuito, plan por fases. |
| [Análisis de nueva app (UX)](./docs/2026-06-13-analisis-nueva-app-ux.md) | Rediseño de menús, dashboard, mejoras de operativa. |
| [Auditoría UX, mantenibilidad y autonomía](./docs/2026-06-13-auditoria-ux-mantenibilidad.md) | Auditoría profunda del frontend actual (fundamentada en código) y visión de la V2. |

## Arquitectura objetivo

```
Angular (Vercel)  →  Supabase (Postgres + Auth + RLS + Edge Functions)  →  Micro-scraper (Cloud Run)
```

- **Frontend:** Angular, habla directo a Supabase vía `supabase-js`.
- **Datos y lógica:** Postgres (cálculos/vistas) + Edge Functions (transacciones: scoring, fichajes, premios, porteros virtuales).
- **Scraping:** único componente que requiere servidor → contenedor mínimo con Selenium, scale-to-zero.

## Estado

🚧 En fase de análisis y planificación. El código de la V2 aún no ha comenzado.

Siguiente paso: Fase 0 del [plan de migración](./docs/2026-06-13-analisis-evolucion-tecnica.md#6-plan-de-migración-por-fases-verano-2026) (tests de caracterización + proyecto Supabase + andamiaje inicial).
