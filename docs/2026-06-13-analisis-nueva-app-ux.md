# Análisis de Nueva App — Mejora de Operativa, Menús y UX

> **Fecha:** 2026-06-13 · **Propósito:** repensar la experiencia de FALM partiendo de las
> funcionalidades existentes (ver specs), corrigiendo la deuda de haber crecido "por piezas".
> **Alcance:** propuestas presentadas como specs para que decidas qué adoptar. No es vinculante.

---

## 1. Diagnóstico de la UX actual

**Lo que funciona:**
- Material Design en formularios/tablas, lazy loading, paginación en mercado.
- Sidebar jerárquico + navbar con selector de competición.

**La deuda de "construir por piezas":**
1. **Tres sistemas visuales conviviendo:** Angular Material + Bootstrap 5 + jQuery-notify. Inconsistencia visual y conflictos potenciales.
2. **21 rutas planas** bajo un mismo layout, sin agrupación clara por tarea → el usuario no tiene un "centro de operaciones".
3. **Componentes obsoletos** conviviendo con los nuevos (`alineacion` antigua comentada, dos versiones de pantallas).
4. **No hay un "home"/dashboard**: al entrar, no ves de un vistazo qué tienes que hacer esta semana.
5. **Operativa fragmentada:** alinear, fichar, ver puntos y ver clasificación son pantallas separadas sin un hilo que las una al ciclo semanal real de la liga.
6. **Notificaciones legacy** (jQuery-notify) en vez de Material Snackbar.
7. **Sin feedback de plazos**: el deadline de fichajes (martes 23:59) y el cierre de alineación son críticos pero no omnipresentes.

---

## 2. Principio rector del rediseño: "la semana del jugador"

La liga tiene un **ritmo semanal** muy marcado. La app debería organizarse alrededor de ese ciclo, no alrededor de entidades técnicas. El ciclo real es:

```
JORNADA EN JUEGO        →  POST-JORNADA           →  VENTANA FICHAJES        →  PRÓXIMA JORNADA
(viernes-domingo)          (lunes)                    (lunes-martes 23:59)       (preparar)
· ver puntos en vivo       · ver resultado y premios  · pedir fichajes (prio)    · alinear
· ver clasificación        · ver clasificación        · ofertas intercambio      · repetir/copiar alineación
```

**Idea central:** un **Dashboard** que, según el momento de la semana, te muestre *la acción que toca ahora* con un contador y un botón directo. Esto resuelve los puntos 4, 5 y 7 del diagnóstico de golpe.

---

## 3. Propuesta de navegación (menús)

### De 21 rutas planas → 5 secciones por tarea

```
🏠 INICIO (Dashboard)        ← nuevo: estado de la semana + acción prioritaria
   └ resumen: mi posición, próximo deadline, puntos última jornada

⚽ MI EQUIPO
   ├ Plantilla
   ├ Alineación            (incluye repetir / copiar Liga→Champions)
   └ Fichajes & Ofertas    (peticiones semanales + intercambios unificados)

🏆 COMPETICIÓN
   ├ Clasificación         (selector Liga / Champions / Clausura)
   ├ Jornadas FALM         (resultados + mis partidos, unificado)
   ├ Premios               ← nuevo: dinero ganado, histórico, pendientes de pago
   └ Calendario LaLiga

📊 ANÁLISIS
   ├ Mercado               (jugadores libres)
   ├ Equipos rivales
   ├ Equipos LaLiga
   └ Estadísticas & Puntuaciones (unificado)

⚙️ ADMIN  (visible solo con rol)
   ├ Gestión jugadores
   ├ Gestión jornadas
   ├ Scraping / Puntuaciones
   └ Mantenimiento
```

**Cambios clave:**
- **Inicio/Dashboard** nuevo como punto de entrada.
- **Fichajes + Ofertas** unificados (hoy están separados pero son "mover jugadores").
- **Jornadas FALM + Mis partidos** unificados (hoy `jornadafalm` y `partidofalm` se solapan y mostraban puntuaciones distintas — bug ya corregido, pero conceptualmente son lo mismo).
- **Premios** como sección propia (hoy diluido) — en una liga con dinero real, ver "cuánto llevo ganado" motiva.
- **Estadísticas + Análisis de puntuaciones** unificados.
- Admin agrupado y oculto salvo rol.

---

## 4. El Dashboard (pantalla nueva, la más importante)

Tarjetas contextuales según el momento de la semana:

```
┌──────────────────────────────────────────────────────────┐
│  Hola, MANCHESTER          Liga ▼      Jornada 14         │
├──────────────────────────────────────────────────────────┤
│  ⏰ ACCIÓN QUE TOCA AHORA                                  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Cierre de fichajes en 1d 4h 30m                    │  │
│  │ Tienes 0/2 peticiones esta semana    [Pedir ahora] │  │
│  └────────────────────────────────────────────────────┘  │
├───────────────────────────┬──────────────────────────────┤
│  📍 MI POSICIÓN            │  💰 PREMIOS                   │
│  3º · 28 pts · +2 vs J13   │  Ganado: 45€ · Pendiente: 10€ │
├───────────────────────────┼──────────────────────────────┤
│  ⚽ ÚLTIMA JORNADA          │  📋 PRÓXIMA ALINEACIÓN        │
│  Mi equipo 14.5 - 11.0 ✅  │  Sin enviar · cierra sáb 14:00│
│  [Ver desglose]           │  [Alinear] [Repetir anterior] │
└───────────────────────────┴──────────────────────────────┘
```

El contenido de "Acción que toca ahora" cambia según el día: alinear (jue-sáb), ver resultados (lun), pedir fichajes (lun-mar). Resuelve la fragmentación operativa.

---

## 5. Mejoras de operativa concretas (por pantalla)

| Pantalla | Mejora propuesta | Problema que resuelve |
|---|---|---|
| **Global** | Banner/contador de deadline siempre visible | Plazos críticos invisibles |
| **Global** | Sustituir jQuery-notify por Material Snackbar | Inconsistencia + deuda |
| **Alineación** | Avisar de jugadores lesionados/bloqueados al alinear; validar formación en vivo | Errores al alinear |
| **Alineación** | "Repetir anterior" y "Copiar Liga→Champions" como botones de 1 clic en el dashboard | Pasos repetitivos |
| **Fichajes** | Mostrar probabilidad de éxito de cada petición según desempates (transparencia de los 3 criterios) | El usuario no entiende por qué pierde un fichaje |
| **Fichajes/Ofertas** | Unificar en una sola pantalla "Mercado de movimientos" | Dos sitios para una misma intención |
| **Clasificación** | Indicador de cambio de posición (↑↓) vs jornada anterior | Falta de contexto |
| **Premios** | Vista de "mis ganancias" + estado pagado/pendiente | Motivación + transparencia económica |
| **Jornadas** | Fusionar `jornadafalm` + `partidofalm`; un único origen de puntos | Solapamiento histórico (ya bugfixeado) |
| **Mercado** | Filtros guardados, orden por puntos/precio, comparar jugadores | Búsqueda tediosa |
| **Admin** | Panel de salud (último scraping, jornadas sin procesar, huérfanos) | Mantenimiento reactivo |

---

## 6. Sistema visual unificado

**Decisión recomendada:** quedarse con **Angular Material** como único sistema y **retirar Bootstrap + jQuery**.
- Material ya cubre tablas, formularios, diálogos, chips, tabs, paginación.
- Bootstrap solo se usa para layout → reemplazable por CSS Grid/Flex nativo.
- jQuery-notify → Material Snackbar.
- Definir **tokens de diseño** (color, espaciado, tipografía) y un par de componentes propios (tarjeta de jugador, tarjeta de partido) reutilizables.
- Tema claro/oscuro "gratis" con Material 3.

**Beneficio:** menos bundle, consistencia, menos conflictos, más fácil de mantener para un solo desarrollador.

---

## 7. Mejoras transversales (rápidas, alto impacto)

1. **Estados vacíos y de carga** decentes (skeletons) en todas las tablas.
2. **Responsive de verdad** orientado a móvil — la liga se consulta desde el móvil (alinear el domingo desde el sofá).
3. **PWA**: instalable + notificaciones push de deadlines (encaja con Supabase + service worker). Mata el problema de "se me pasó el martes".
4. **Onboarding mínimo**: tooltip de las reglas de scoring/desempates donde apliquen.
5. **Accesibilidad básica**: labels ARIA, foco, contraste (hoy ausente).

---

## 8. Priorización (si no se puede todo)

**Imprescindibles (máximo impacto / bajo coste):**
- Dashboard con acción semanal + contador de deadline.
- Reagrupar menús en 5 secciones.
- Unificar fichajes+ofertas y jornadas+partidos.
- Material Snackbar (quitar jQuery-notify).

**Muy recomendables:**
- Sección Premios.
- Sistema visual unificado (retirar Bootstrap).
- PWA + push de deadlines.

**Cuando haya tiempo:**
- Comparador de jugadores, filtros guardados.
- Tema oscuro, onboarding, accesibilidad completa.

---

## 9. Relación con la migración técnica

Estas mejoras de UX son **independientes del backend** y se pueden hacer **sobre el Angular actual**, antes, durante o después de la migración a Supabase. Recomendación de secuencia:
1. Primero la migración técnica (Fases 1-2: coste cero + auth) — da base estable.
2. Luego las mejoras de UX imprescindibles del §8, aprovechando que ya tienes Supabase Auth (el dashboard "mi posición/mis premios" se nutre de las vistas Postgres nuevas).
3. PWA + push al final (encaja con Supabase y cierra el problema de los deadlines).

No mezclar ambas cosas en el mismo paso: migrar lógica y rediseñar UI a la vez multiplica el riesgo. Una cosa después de la otra.
