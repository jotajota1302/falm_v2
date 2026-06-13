# Análisis de Evolución Técnica — Migración FALM

> **Fecha:** 2026-06-13 · **Ventana objetivo:** verano 2026 (listo antes de la temporada 2026-27, ~mediados de agosto).
> **Decisiones tomadas en brainstorming:**
> - Scraping → **micro-backend mínimo** (conserva Selenium, reduce backend a ~2-3 clases).
> - Motor de la migración → **coste cero + simplicidad + UX** (las tres por igual).
> - Destino → **a recomendar** (este documento lo hace).

---

## 1. Diagnóstico de partida

| Componente | Hoy | Problema |
|---|---|---|
| BBDD | PostgreSQL en AWS RDS (vía Heroku) | Coste / dependencia Heroku |
| Backend | Spring Boot, 178 clases, 36k líneas, Java 8 | Pesado, 2º stack a mantener, hosting de pago |
| Frontend | Angular 18, 29 componentes | Sólido pero con deuda visual (Material+Bootstrap+jQuery) |
| Auth | sessionStorage, sin JWT, permisos en cliente | Inseguro |
| Scraping | Selenium + ChromeDriver | **Ata a un servidor** |
| Hosting | Heroku dyno + Supabase ya en uso parcial | Coste, fragmentación |

---

## 2. Recomendación de arquitectura destino

### Veredicto: **Angular 18 (actual) + Supabase + micro-scraper en contenedor serverless**

No reescribir a Next.js. Razonado abajo.

```
┌─────────────────────────────────────────────────────────┐
│  Angular 18 (Vercel / Netlify / Cloudflare Pages — free) │
│  · UI + orquestación + estado                            │
│  · Habla DIRECTO a Supabase (supabase-js)               │
└───────────────┬─────────────────────────────────────────┘
                │  (REST/Realtime + JWT)
┌───────────────▼─────────────────────────────────────────┐
│  SUPABASE (free tier)                                    │
│  · Postgres  → datos + funciones/vistas (clasificación,  │
│                puntuaciones, premios)                    │
│  · Auth      → login real con JWT + roles               │
│  · RLS       → permisos por fila (sustituye hardcode)   │
│  · Edge Functions (Deno/TS) → lógica transaccional:     │
│      fichajes, scoring, porteros virtuales, premios     │
└───────────────┬─────────────────────────────────────────┘
                │  (invocación semanal on-demand)
┌───────────────▼─────────────────────────────────────────┐
│  MICRO-SCRAPER (Google Cloud Run — free, scale-to-zero) │
│  · 1 contenedor con Chrome headless + Selenium          │
│  · 1-2 endpoints: "scrapea jornada N" → escribe en      │
│    Supabase o devuelve JSON                             │
│  · Reemplaza las 178 clases por ~2-3                    │
└─────────────────────────────────────────────────────────┘
```

### Qué significa "llevar la lógica al frontend bien estructurada"
No es meter 36k líneas en el cliente (sería inseguro y frágil). Es **repartirla en la capa correcta**:

| Tipo de lógica | Dónde va | Por qué |
|---|---|---|
| UI, navegación, estado, validación de formularios | **Angular** | Es presentación. |
| Cálculos sobre datos (clasificación, agregados de puntos, vistas) | **Funciones/vistas Postgres** | Cerca del dato, rápido, declarativo. |
| Transacciones de negocio (fichajes con desempate, scoring, premios, porteros virtuales) | **Edge Functions (Deno/TS)** | Necesitan atomicidad y reglas que NO deben estar en el cliente. |
| Permisos | **RLS de Postgres** | Seguridad real, no evitable desde el front. |
| Scraping con navegador | **Micro-backend Cloud Run** | Único componente que exige un servidor. |

Resultado: **el backend Java desaparece**. Pasas de 2 stacks (Java + Angular) a 1 frontend + BaaS gestionado + 1 contenedor mínimo. Eso es lo más cerca de "un solo proyecto" que se puede llegar **sin tirar tu frontend**.

### Por qué NO Next.js (aunque sería "1 proyecto" más puro)
- Implica **reescribir las 29 vistas Angular** además de la lógica → el doble de trabajo.
- Riesgo alto de **no llegar a agosto** con la temporada empezando.
- La ganancia de "monorepo full-stack" se consigue casi igual con Supabase + Edge Functions, sin tirar tu UI.
- **Recomendación honesta:** si en el futuro quieres Next.js, hazlo como evolución posterior, no en la misma ventana que la migración de infraestructura.

---

## 3. Viabilidad del plan gratuito (¿podemos funcionar gratis?)

**Sí, con holgura.** Datos verificados del free tier de Supabase (2026):

| Recurso | Límite free | Tu necesidad estimada | Margen |
|---|---|---|---|
| Tamaño BBDD | 500 MB (luego solo-lectura) | Liga de ~12-16 equipos, 1 temporada: **muy por debajo de 100 MB** | Enorme |
| Bandwidth | 10 GB/mes (5 cached + 5 uncached) | Uso semanal de ~16 usuarios: bajo | Enorme |
| Auth (MAU) | 50.000 usuarios activos/mes | ~16 | Trivial |
| Edge Functions | ~500k invocaciones/mes | Decenas/semana | Trivial |
| Storage | 1 GB | Escudos/fotos: bajo | Amplio |
| Proyectos activos free | 1 por organización (2 orgs permitidas) | 1 | OK |

**Hosting del frontend:** Vercel / Netlify / Cloudflare Pages tienen tier gratuito de sobra para una SPA Angular.

**Micro-scraper:** Google Cloud Run free tier (2M requests/mes, scale-to-zero) cubre un scraping semanal sin coste. El contenedor solo "despierta" cuando lo invocas.

### Dos riesgos reales del free tier (gestionables)
1. **Auto-pausa por inactividad.** Los proyectos free se pausan tras ~7 días sin actividad. Durante la temporada hay uso semanal → no se pausa. **En verano sí podría pausarse** → solución: un "ping" programado (cron de Cloud Run o GitHub Actions) cada pocos días, o simplemente reactivarlo manualmente al empezar la pretemporada.
2. **Sin backups automáticos.** El free tier NO hace backups diarios. **Solución obligatoria:** un job programado (GitHub Actions gratis) que ejecute `supabase db dump` semanalmente y lo guarde (repo privado / Drive). Para una liga con dinero real en premios, esto es **no negociable**.

---

## 4. Mapeo de migración Java → destino

| Servicio Java | Destino | Dificultad | Notas |
|---|---|---|---|
| `LoginController` / auth | Supabase Auth | Baja | Ganas JWT + reset password gratis. |
| `PermisosService` (front) | RLS + claim de rol | Baja | Mueve permisos al servidor. |
| `EquipoFalmService`, `JugadorService` | Tablas + queries supabase-js | Baja | CRUD directo. |
| `ScoringCalculationService` | Edge Function `calcular-scoring` | **Alta** | Replicar reglas §6 specs. Tests primero. |
| `PuntuacionIntegrationService` (porteros virtuales) | Edge Function `sync-porteros` | **Muy alta** | El más delicado. Tests de caracterización obligatorios. |
| `PeticionFichajeService` (desempates) | Edge Function `procesar-fichajes` | **Alta** | 3 criterios de desempate exactos. |
| `PremioCalculationService` | Edge Function `calcular-premios` o función SQL | **Alta** | Fórmulas de empate §9 specs. |
| `ClasificacionService` | Vista/función Postgres | Media | Agregación declarativa. |
| `MapeoJornadaFalmLfp` + jornadas dobles | Tablas + funciones Postgres | **Alta** | Lógica de mapeo y registros dobles. |
| `ScrappingService` (Selenium) | **Micro-backend Cloud Run** | Media | Se conserva casi tal cual. |
| `OfertaIntercambioService` | Edge Function + cron de expiración | Media | `pg_cron` para expiración a 7 días. |
| `DraftService` / `DraftInvierno` | Edge Function | Media | Está deshabilitado; baja prioridad. |
| Reporting / estadísticas | Vistas Postgres | Baja | Declarativo. |

**Patrón recomendado: Strangler Fig.** No reescribir todo de golpe. Migrar dominio a dominio detrás de un mismo frontend, validando cada uno contra el sistema viejo antes de apagarlo.

---

## 5. Modelo de datos en Supabase

- Migrar las **25 entidades** a tablas Postgres (el esquema ya es Postgres → migración casi 1:1).
- Aplicar **RLS** por tabla:
  - `equipo_falm`: cada usuario ve todo pero solo modifica el suyo.
  - `alineacion`, `peticion_fichaje`: escritura solo del dueño y dentro de plazo.
  - tablas admin: solo rol `admin`.
- Convertir cálculos pesados en **vistas materializadas** (clasificación) refrescadas tras cada jornada.
- `pg_cron` para tareas programadas (expiración de ofertas, refresco de clasificación, ping anti-pausa).

---

## 6. Plan de migración por fases (verano 2026)

> Principio rector: **conseguir "coste cero" pronto y con bajo riesgo**, y dejar la reescritura de lógica delicada para cuando esté validada con tests. La temporada termina (sin partidos en verano) → ventana ideal para migrar sin presión de jornadas en curso.

### Fase 0 — Preparación y red de seguridad (semana 1)
- [ ] Crear proyecto Supabase (org free).
- [ ] **Tests de caracterización** de los 4 dominios críticos (scoring, mapeo, porteros virtuales, premios): capturar entradas/salidas reales de producción como casos de prueba dorados.
- [ ] Exportar datos de producción (dump) como base de migración.
- [ ] Configurar backup automático semanal (GitHub Actions + `supabase db dump`).

### Fase 1 — Migrar datos y salir de Heroku (semanas 1-2) → **logra coste cero**
- [ ] Migrar esquema + datos a Supabase Postgres.
- [ ] **Opción puente de bajo riesgo:** apuntar el backend Java actual a Supabase (cambio de datasource) y desplegarlo temporalmente en Cloud Run (free) en lugar de Heroku. *Resultado: ya no pagas Heroku, sin reescribir nada todavía.*
- [ ] Validar que la app funciona end-to-end contra Supabase.

### Fase 2 — Auth real + RLS (semana 2-3)
- [ ] Implementar Supabase Auth (migrar usuarios/contraseñas).
- [ ] Definir roles (usuario / gestor / admin) como claims.
- [ ] Activar RLS y mover permisos fuera del cliente.
- [ ] Actualizar Angular para usar supabase-js (sesión, JWT, interceptor).

### Fase 3 — Strangler: vaciar el backend Java (semanas 3-6)
Migrar dominio a dominio a Edge Functions / Postgres, **del más simple al más crítico**, validando cada uno contra los tests de caracterización:
1. Reporting / clasificación → vistas Postgres.
2. Equipos / plantilla / mercado → supabase-js directo + RLS.
3. Ofertas de intercambio + expiración → Edge Function + pg_cron.
4. Fichajes (desempates) → Edge Function.
5. Scoring → Edge Function.
6. Premios → Edge Function / SQL.
7. **Porteros virtuales** (el último, el más delicado) → Edge Function.
8. Mapeo jornadas / jornadas dobles → funciones Postgres.

### Fase 4 — Aislar el scraping (semana 6-7)
- [ ] Extraer SOLO `ScrappingService` + dependencias a un contenedor mínimo.
- [ ] Desplegar en Cloud Run, scale-to-zero, invocable on-demand.
- [ ] Apagar definitivamente el backend Java completo.

### Fase 5 — Estabilización y corte (semana 7-8)
- [ ] Ping anti-pausa programado.
- [ ] Pruebas de la temporada simulada (replay de una jornada real).
- [ ] Documentar operativa (cómo lanzar scraping, cómo restaurar backup).
- [ ] **Corte antes de mediados de agosto.**

### Criterio de "listo"
- Todos los tests de caracterización en verde contra el nuevo sistema.
- Una jornada real replicada da exactamente los mismos puntos/clasificación/premios que el sistema viejo.
- Backup automático funcionando y restauración probada una vez.

---

## 7. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Reescribir lógica crítica introduce bugs ya resueltos | Alto | Tests de caracterización ANTES de tocar nada. |
| No llegar a agosto | Alto | Fase 1 ya da coste cero; el resto puede continuar con la temporada en marcha si Fase 1-2 están firmes. |
| Auto-pausa free en verano | Medio | Ping programado + reactivación manual en pretemporada. |
| Pérdida de datos (sin backups free) | Alto | Backup semanal automatizado obligatorio. |
| El scraping LFP cambia o se rompe | Medio | Conservas Selenium tal cual (no lo reescribes); la entrada manual sigue de respaldo. |
| Supabase free insuficiente | Bajo | Margen enorme; upgrade a Pro (~25$/mes) si algún día crece. |

---

## 8. Esfuerzo estimado

- **Fase 1-2 (coste cero + auth):** ~2-3 semanas, bajo riesgo. **Aquí está el 80% del valor inmediato.**
- **Fase 3-4 (vaciar Java + aislar scraping):** ~4 semanas, riesgo concentrado en 4 dominios.
- Total realista: **6-8 semanas** de dedicación de verano. Encaja en la ventana.

**Recomendación final:** ejecutar Fase 1-2 sí o sí este verano (te quita Heroku y arregla la seguridad). Fase 3-4 hacerla con disciplina de tests; si el tiempo aprieta, el puente "Java en Cloud Run apuntando a Supabase" permite terminar la reescritura **durante** la temporada sin prisa, porque ya no estarías pagando ni en Heroku.
