# Auditoría de Experiencia de Usuario, Mantenibilidad y Autonomía — FALM → V2

> **Fecha:** 2026-06-13 · **Alcance:** auditoría profunda del frontend Angular 18 actual,
> fundamentada en el código real (referencias `archivo:línea`), medida contra las
> *Web Interface Guidelines* (Vercel) y orientada a definir la experiencia de la V2.
> **Complementa** a `2026-06-13-analisis-nueva-app-ux.md` (este es la versión detallada y verificada).
> **Método:** auditoría de las 29 pantallas en 4 bloques (shell/navegación, Mi Equipo,
> Competición, Análisis/Admin) + checklist de calidad de UI + revisión de mantenibilidad.

---

## 1. Veredicto ejecutivo

FALM **funciona y resuelve el problema de negocio**, pero arrastra la deuda típica de una app crecida "por piezas": tres sistemas visuales conviviendo, componentes gigantes, lógica de negocio filtrada al cliente, seguridad por convención y ausencia de los conceptos que harían la operativa fluida (un home, plazos visibles, panel de salud, premios). No es un problema de "arreglar estilos": es que **faltan piezas estructurales** y **sobra acoplamiento**.

| Dimensión | Nota /10 | Síntesis |
|---|---:|---|
| Arquitectura de información / navegación | 4 | 21 rutas planas, sin home, routing roto, doble fuente de navegación. |
| Operativa / flujos | 5 | Las funciones existen pero el ciclo semanal no está guiado; plazos invisibles. |
| Calidad visual / consistencia | 4 | Material + Bootstrap + jQuery + estilos inline + SCSS de 1.900 líneas. |
| Accesibilidad | 3 | Tablas sin semántica, botones-`div`, color como único indicador, sin ARIA. |
| Mantenibilidad | 3 | Componentes de 1.200–2.000 líneas, `any` masivo, memory leaks, duplicación. |
| Autonomía del admin | 4 | Sin panel de salud, sin rollback, sin auditoría visible, permisos hardcoded. |
| Seguridad | 2 | Token API en el repo, permisos por nombre de equipo en el cliente. |

**Conclusión:** la V2 no debería "reskinear" la actual. Debe **reusar el conocimiento de dominio** (las specs) pero **rehacer la capa de presentación sobre cimientos limpios**: un único sistema visual, componentes pequeños, estado tipado, y las pantallas estructurales que hoy faltan.

---

## 2. Hallazgos CRÍTICOS transversales (atacar primero)

Estos aparecen en varias pantallas y condicionan todo lo demás.

| # | Hallazgo | Evidencia | Por qué es crítico |
|---|---|---|---|
| C1 | **Token de API en el código fuente** | `environment.ts:11` y `environment.prod.ts:5` (`AUTH_TOKEN_FOOTBALL_DATA`) | Credencial expuesta en el repo. En V2 va al servidor (Edge Function / micro-scraper), nunca al cliente. |
| C2 | **Permisos hardcoded por nombre de equipo en el cliente** | `permisos.service.ts:31-36`, `draft.component.ts:279-282` | Cualquiera edita `sessionStorage` y entra como admin. Cambiar un nombre de equipo rompe accesos. → RLS + roles en JWT (ver análisis técnico). |
| C3 | **Routing roto / sin home** | `app.routing.ts:16-19` (`dashboard` redirige a sí mismo), sin wildcard 404, `auth.guard.ts:18-29` no redirige a login | El usuario no tiene punto de entrada ni feedback al perder sesión. |
| C4 | **Tres sistemas visuales mezclados** | jQuery (`admin-layout.component.ts:8,63-132`), `$.notify` (`navbar.component.ts:266`), Bootstrap + `perfect-scrollbar` + `bootstrap-material-design` (`package.json:63-76`) | Inconsistencia, conflictos, bundle inflado, mantenimiento frágil. |
| C5 | **Componentes gigantes** | `fichajes` 1.982 líneas, `alineacion-new` 1.795, `gestion-jornadas` 1.311, `player-management` 1.244, `jornadafalm.scss` 1.906 | Imposibles de testear, depurar o traspasar a otra persona. Riesgo de "bus factor 1". |
| C6 | **Memory leaks generalizados** | suscripciones sin `unsubscribe` en navbar, sidebar, plantilla, alineacion-new (11 subs / 1 cleanup), fichajes (100+ subs / 3 `.add()`) | Degradación con el uso; síntoma de patrón ausente (`takeUntilDestroyed`). |
| C7 | **Lógica de negocio en el cliente** | deduplicación de jornadas dobles `puntuaciones-analisis.component.ts:294-305`; mapeos de equipos duplicados `jornadafalm.ts:338-387` | Reglas críticas viven en el front → frágil y duplicado. En V2 van a Postgres/Edge Functions. |
| C8 | **Tipado débil (`any` masivo)** | `clasificacion.ts:18,26`, `jornadafalm.ts:30-31`, `clausura.ts:12,27`, plantilla/alineación | Errores en runtime, refactor imposible. La V2 debe tipar el modelo end-to-end (tipos generados de Supabase). |

---

## 3. Auditoría por dimensión

### A. Arquitectura de información y navegación

**Problemas:**
- **21 rutas planas** bajo un layout, sin agrupación por tarea ni jerarquía (`admin-layout.routing.ts`).
- **Sin home/dashboard**: al entrar no hay "qué hago ahora".
- **Doble fuente de navegación**: mapa de rutas hardcoded en `navbar.component.ts:147-160` *y* en `sidebar.component.html` → se desincronizan.
- **`window.location.reload()` como workaround** tras deshacer fichaje (`navbar.component.ts:250`) → tira todo el estado.
- **`href="javascript:void(0)"`** y `<div (click)>` para acciones → debería ser `<button type="button">` (WIG: usar `<button>` para acciones, `<a>` para navegación).

**Visión V2:** ver §5 (mapa de navegación de 5 secciones + Dashboard).

### B. Operativa y flujos (el corazón del problema)

La liga tiene un **ritmo semanal** que la app no refleja. Las funciones existen, pero el usuario tiene que "saber" cuándo hacer cada cosa.

**Problemas concretos:**
- **Deadline de fichajes (martes 23:59) invisible**: `fichajes.component.html:19-21` solo dice "Próximo procesamiento" sin countdown ni énfasis. → gente que pierde la ventana.
- **Reglas de desempate opacas**: el usuario no sabe por qué pierde un fichaje (los 3 criterios no se explican en ninguna parte).
- **Sin confirmación** antes de enviar petición de fichaje (acción con consecuencias).
- **`jornadafalm` vs `partidofalm` se solapan**: uno consulta, otro edita, pero no está claro (ambos empiezan igual, `*.component.html:1-6`).
- **Entrada manual de puntuaciones sin red de seguridad**: inputs de texto plano sin `type="number"`, rango ni validación (`partidofalm.component.html:109,144,169,…`). Propenso a error en una tarea frecuente y sensible.
- **Sin estados vacíos**: `mercado` no dice nada cuando la búsqueda no devuelve resultados (`mercado.component.html:63+`).
- **Botón "ALTA" deshabilitado en Mercado** con tooltip "usa Fichajes" (`mercado.component.html:112-116`) → ¿por qué se muestra entonces?

**Visión V2:** ver §6 (Dashboard "la semana del jugador" + "la semana del admin").

### C. Calidad visual y consistencia

- **jQuery-notify** (`$.notify`) en vez de `MatSnackBar` → estilo legacy mezclado.
- **`alert()` y `confirm()` nativos** (`login.component.ts:72`, `navbar.component.ts:243`, `player-management.ts:1150-1175`) → rompen la estética y la accesibilidad.
- **Estilos inline en HTML** (`clasificacion.component.html:22`, `jornadafalm.component.html:16,20-21`) y **colores hardcoded** repetidos (`clasificacion.scss:241-266`, `clausura.scss:16-24`) → sin design tokens.
- **`* { transition: margin .3s, padding .3s }`** global (`admin-layout.component.scss:60-61`) y `transition: all` → jank (WIG: animar solo `transform`/`opacity`, nunca `all`).
- **`!important`** para parchear especificidad (`styles.css:7-32`).
- **Breakpoints inconsistentes** entre pantallas (992/768/480 vs 992/576 vs solo 768).
- **`jornadafalm.scss` de 1.906 líneas** mezclando 4 responsabilidades.

### D. Accesibilidad (la dimensión más floja)

Medido contra las Web Interface Guidelines:
- **Tablas sin `scope="col"` ni `<caption>`** (`clasificacion`, `clausura`, `jornadafalm`) → lectores de pantalla no entienden la estructura.
- **Botón de cierre del modal es un `<div>` con `(click)` sin `aria-label`** (`jugador.component.html:3-5`) → inaccesible por teclado.
- **Color como único indicador** del ganador (`clasificacion.scss:203-209`) → ~8% de usuarios (daltonismo) no lo distinguen. Falta icono (✓/👑).
- **Emojis como cabeceras de tabla** (`estadisticas.component.html:21-27`) → el lector lee "🎯".
- **`aria-expanded` enlazado a número** 0/1 en vez de booleano (`navbar.component.html:23`).
- **Sin estados de foco visibles**, sin skip link, sin jerarquía de headings consistente.
- **Sin `prefers-reduced-motion`**, sin `inputmode`/`autocomplete` en formularios.

### E. Mantenibilidad y autonomía (lo que pediste reforzar)

**Mantenibilidad:**
- **Componentes gigantes** (C5) → nadie puede sostenerlos con confianza.
- **`any` por todas partes** (C8) → el compilador no protege.
- **Memory leaks** (C6) → falta un patrón único de gestión de suscripciones.
- **Duplicación**: mapeos de equipos y métodos `getTeamTLA()`/`getApellido()` repetidos en 3 componentes; diálogos declarados inline en el módulo (`admin-layout.module.ts:88-123`).
- **Datos hardcoded que se desincronizan de la BD**: `getEquiposPorDefecto()` con IDs y nombres fijos (`draft.component.ts:99-112`).
- **Código muerto**: secciones de draft comentadas (`sidebar.component.html:12-25`, `navbar.component.ts:202-211`), `CdkDragDrop` importado y no usado.

**Autonomía del admin — valoración: 4/10.** Un admin puede operar el día a día, pero depende de un desarrollador para lo importante:
- ❌ **Sin panel de salud**: no se ve si el último scraping funcionó, qué jornadas faltan por procesar, ni los huérfanos.
- ❌ **Sin rollback**: si un cálculo de puntos sale mal, es trabajo manual en BD.
- ❌ **Auditoría invisible**: existe en backend, pero el front no muestra "quién cambió qué".
- ❌ **Operaciones destructivas sin contexto**: `confirm()` genérico sin decir qué se borra (`player-management.ts:1150-1175`); "Simular procesamiento" sin decir cuántos fichajes afecta (`mantenimiento.html:64-68`).
- ❌ **Sin resolución visual de conflictos de fichajes**.

> Tareas que hoy exigen un "ticket al desarrollador": *"¿por qué falló el scraping de J15?"*, *"¿quién cambió los puntos de Vinicius?"*, *"¿cómo revierto este cálculo?"*. En la V2 deben ser autoservicio.

### F. Seguridad (resumen, detalle en análisis técnico)
- C1 (token en repo) y C2 (permisos en cliente) son los dos grandes. Ambos se resuelven con la arquitectura Supabase: secretos en el servidor, **Auth + JWT con rol**, **RLS** por fila.

---

## 4. Inventario de pantallas actuales — veredicto

| Pantalla | Mantener / Rehacer / Fusionar | Nota |
|---|---|---|
| login | Rehacer | → Supabase Auth (JWT, reset password, sin `alert`). |
| **(falta) Dashboard/Home** | **Crear** | Pieza estructural ausente. |
| plantilla | Mantener (refactor) | Tipar, quitar leaks, estados de carga. |
| alineacion-new | Rehacer (partir) | 1.795 líneas → componentes pequeños; drag&drop accesible. |
| mercado | Mantener (mejorar) | Empty state, comparador, orden por puntos/precio. |
| fichajes | Rehacer (partir) | 1.982 líneas; countdown de deadline; transparencia desempates. |
| oferta-intercambio | **Fusionar** con fichajes → "Movimientos". | Misma intención (mover jugadores). |
| jugador (modal) | Mantener (accesibilidad) | Botón cerrar accesible, foco atrapado. |
| clasificacion | Mantener (mejorar) | Indicador ↑↓, semántica de tabla, tabular-nums. |
| jornadafalm | **Fusionar** con partidofalm. | Consulta + edición de lo mismo. |
| partidofalm | **Fusionar** + validación de inputs. | Entrada de puntos robusta. |
| jornadaliga | Mantener | Calendario LFP. |
| champions / clausura | Mantener (deduplicar) | Lógica común a un servicio. |
| **(falta) Premios** | **Crear** | Ganancias, pagado/pendiente, histórico. |
| estadisticas + puntuaciones-analisis | **Fusionar** | Un "Análisis" con gráficas. |
| plantillas (rivales) | Mantener | + head-to-head. |
| equiposlfp | Mantener | + lazy loading de imágenes. |
| draft / draft-invierno | Mantener (feature flag) | Deshabilitado; aislar tras flag, no comentado. |
| player-management | Rehacer (partir) | 1.244 líneas; auditoría visible; confirmaciones con contexto. |
| gestion-jornadas | Rehacer (partir) | 1.311 líneas; editor visual de mapeo FALM↔LFP. |
| mantenimiento | Rehacer | → **Panel de salud** + acciones con rollback. |

---

## 5. Pantallas y funcionalidades NUEVAS necesarias (V2)

### Estructurales (alta prioridad)
1. **Dashboard / Home** — el punto de entrada que hoy no existe. Detalle en §6.
2. **Panel de Salud del Sistema (admin)** — estado del último scraping, jornadas LFP sin procesar, mapeos FALM↔LFP sin puntos, registros huérfanos, errores recientes. Convierte la operación reactiva en proactiva.
3. **Sección Premios** — "cuánto llevo ganado", pagado vs pendiente, histórico por jornada, por competición. En una liga con dinero real, motiva y aporta transparencia.
4. **Centro de Movimientos** — fichajes semanales + ofertas de intercambio unificados, con **countdown del deadline** y **probabilidad de éxito** del fichaje (explicando los 3 criterios de desempate).

### Operativas (media prioridad)
5. **Comparador de jugadores** (2+ lado a lado) en Mercado/Análisis.
6. **Desglose de puntos** ("7.5 = 5 base + 1 portería a cero + …") como tooltip/expandible.
7. **Indicador de cambio de posición** (↑↓) en clasificación.
8. **Editor visual de mapeo jornadas FALM↔LFP** (admin).
9. **Vista de resolución de conflictos de fichajes** (admin): qué equipos pidieron a quién y por qué ganó uno.
10. **Auditoría visible** (admin): timeline de cambios manuales (quién, qué, cuándo).
11. **Rollback de operaciones** (admin): deshacer último cálculo/procesamiento.

### Avanzadas (cuando haya tiempo)
12. Gráficas de evolución (puntos acumulados, top jugadores de la jornada).
13. Head-to-head histórico entre equipos.
14. Historial de alineaciones y su rendimiento.

---

## 6. La visión de experiencia V2: organizar la app alrededor del *ciclo semanal*

El cambio conceptual más importante. Hoy la app está organizada por **entidades técnicas** (jornadas, partidos, puntuaciones); la V2 debe organizarse por **lo que el usuario tiene que hacer esta semana**.

```
JORNADA EN JUEGO  →  POST-JORNADA   →  VENTANA FICHAJES        →  PREPARAR PRÓXIMA
(vie-dom)            (lun)              (lun-mar 23:59)            (jue-sáb)
ver puntos           ver resultado      pedir fichajes (prio)      alinear / repetir
clasificación        premios            ofertas intercambio        copiar Liga→Champions
```

**Dashboard contextual** — muestra *la acción que toca ahora* según el día, con contador y CTA directo:

```
┌──────────────────────────────────────────────────────────┐
│  Hola, MANCHESTER          Liga ▼      Jornada 14         │
├──────────────────────────────────────────────────────────┤
│  ⏰ ACCIÓN QUE TOCA AHORA                                  │
│  Cierre de fichajes en 1d 4h 30m · 0/2 peticiones        │
│                                          [Pedir ahora]    │
├───────────────────────────┬──────────────────────────────┤
│ 📍 MI POSICIÓN  3º · 28pts │ 💰 PREMIOS  45€ · 10€ pend.  │
├───────────────────────────┼──────────────────────────────┤
│ ⚽ ÚLTIMA JORNADA 14.5-11.0│ 📋 ALINEACIÓN próx: sin enviar│
│    [Ver desglose]          │    [Alinear] [Repetir]        │
└───────────────────────────┴──────────────────────────────┘
```

**Equivalente para el admin — "la semana del admin":** un panel que tras la jornada diga *"3 jornadas LFP listas para scrapear · 1 mapeo sin puntos · 0 huérfanos · último scraping OK hace 2h"* con botones que ejecutan y muestran resultado + opción de deshacer.

Esto resuelve de golpe: ausencia de home, plazos invisibles, fragmentación operativa y baja autonomía del admin.

---

## 7. Principios de diseño de la V2 (para que sea mantenible por una persona)

1. **Un único sistema visual: Angular Material** (3) + CSS Grid/Flex nativo. Fuera jQuery, bootstrap-notify, perfect-scrollbar, bootstrap-material-design.
2. **Design tokens** (color, espaciado, tipografía, radios) en un único sitio → tema claro/oscuro gratis, cero colores hardcoded.
3. **Componentes pequeños y enfocados** (objetivo < 300–400 líneas). Tarjetas reutilizables: `player-card`, `match-card`, `standings-row`, `deadline-banner`.
4. **Modelo tipado end-to-end**: tipos generados desde Supabase (`generate_typescript_types`) → adiós a `any`.
5. **Patrón único de suscripciones**: `takeUntilDestroyed()` / signals → cero memory leaks.
6. **La lógica de negocio NO vive en el cliente**: cálculos en Postgres, transacciones en Edge Functions (ver análisis técnico). El front orquesta y presenta.
7. **Accesibilidad de serie**: semántica HTML, `scope`/`caption` en tablas, `aria-label` en iconos, foco visible, `prefers-reduced-motion`, nunca color como único indicador.
8. **Estados siempre cubiertos**: cargando (skeleton), vacío, error con siguiente paso, éxito (snackbar con `aria-live`).
9. **Confirmación o ventana de deshacer** en toda acción destructiva, indicando *qué* se ve afectado.
10. **URL refleja el estado** (filtros, competición, jornada en query params) → enlaces compartibles y navegación con back.
11. **Mobile-first real**: la liga se consulta desde el móvil; breakpoints estandarizados.
12. **PWA + push** para los deadlines → mata el "se me pasó el martes".

---

## 8. Priorización (impacto vs esfuerzo) y roadmap UX

### Quick wins (alto impacto / bajo esfuerzo) — primeras 1–2 semanas de la fase UX
- Sacar el token API del cliente (C1).
- Arreglar routing + AuthGuard + 404 (C3).
- `MatSnackBar` en lugar de `$.notify`/`alert`/`confirm` (C4 parcial).
- `scope`/`caption` en tablas + `aria-label` en botones-icono + icono además de color (D).
- Inputs de puntuación con `type="number"` + rango + validación (B).
- Countdown de deadline de fichajes visible (B).
- Empty states en mercado y listados (B).

### Estructural (alto impacto / esfuerzo medio-alto)
- **Dashboard** + reagrupar navegación en 5 secciones (§5, §6).
- **Panel de salud + autonomía admin** (rollback, auditoría visible, confirmaciones con contexto).
- **Sección Premios** y **Centro de Movimientos** (fusión fichajes+ofertas).
- Fusionar jornadafalm+partidofalm y estadisticas+puntuaciones-analisis.

### Fundacional (paga deuda, habilita el resto)
- Retirar jQuery/Bootstrap → Material puro + tokens.
- Partir los componentes gigantes; tipar el modelo; patrón de suscripciones.
- Mover lógica de negocio fuera del cliente (coordinado con la migración técnica).

### Cuando haya tiempo
- Comparador de jugadores, gráficas de evolución, head-to-head, PWA + push, tema oscuro, onboarding de reglas.

---

## 9. Cómo encaja con la migración técnica

- Los **quick wins** y la **accesibilidad** se pueden hacer ya sobre el Angular actual, sin tocar backend.
- Lo **estructural** (Dashboard "mi posición/mis premios", panel de salud) se nutre de las **vistas Postgres** y **Edge Functions** nuevas → conviene hacerlo **después** de las Fases 1–2 de la migración (BD + Auth en Supabase).
- Lo **fundacional** (quitar jQuery, tipar, partir componentes) es buen momento de abordarlo **a la vez** que se conecta el front a supabase-js, porque ya se va a tocar esa capa.
- **Regla de oro:** no rediseñar UI y migrar lógica crítica en el mismo paso. Primero cimientos (técnica), luego experiencia (UX). El orden reduce el riesgo de llegar a agosto.
