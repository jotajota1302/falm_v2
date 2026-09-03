# Handoff: FALM V2 — rediseño visual (paleta "Prensa" + tipografía condensada)

## Overview
Rediseño de la interfaz de **FALM V2** (liga fantasy privada de LaLiga, 12 equipos, head-to-head semanal).
Cubre seis vistas: Alineación, Mi plantilla, Mercado/fichajes, Clasificación, Estadísticas y Ficha de jugador.

Motivo del rediseño: la paleta actual del repo (`frontend/src/styles.css`, tema "MATCHDAY" verde neón
sobre negro) no convence. Este paquete propone **tres paletas conmutables** y **tres pares tipográficos**,
con la combinación elegida por defecto: paleta **`prensa`** + tipografía **`condensada`**.

Repo de destino: `github.com/jotajota1302/falm_v2`, rama `main`, frontend Angular 18 standalone
(`frontend/src/app`), datos vía Supabase.

## About the Design Files
Los archivos de este bundle son **referencias de diseño hechas en HTML**: prototipos que muestran el
aspecto y el comportamiento deseados, **no código de producción para copiar**.

La tarea es **recrear estos diseños dentro del entorno ya existente del repo** — componentes Angular
standalone con `signal()`, plantillas inline, `styles: []` por componente y las variables CSS globales
de `frontend/src/styles.css`. Concretamente:

1. Sustituir el bloque `:root` de `frontend/src/styles.css` por los tokens de la paleta `prensa`
   (abajo), manteniendo los nombres de variable existentes donde sea posible para no tocar componentes.
2. Añadir las variables de tipografía y cambiar `--font`.
3. Ajustar los componentes de vista uno a uno según las descripciones de "Screens / Views".

No hay que introducir React ni reescribir la app. El prototipo usa React internamente solo porque es
el formato del entorno de diseño.

## Fidelity
**Alta fidelidad (hifi).** Colores, tipografías, tamaños, radios y estados están definidos con valores
exactos y deben reproducirse tal cual. La estructura de datos del prototipo es *mock*: los nombres de
jugadores, equipos y puntuaciones son de ejemplo y deben venir de `FalmService`/Supabase.

---

## Design Tokens

### Paleta `prensa` (por defecto)
| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#f2efe8` | Fondo de página (papel prensa) |
| `--surface` | `#fffdf9` | Tarjetas, cabecera, tablas |
| `--surface2` | `#eae5da` | Fondos secundarios, filas hover, barras vacías |
| `--line` | `#d9d2c3` | Todos los bordes y separadores (1px) |
| `--text` | `#16130f` | Texto principal |
| `--text2` | `#6d6353` | Texto secundario, etiquetas, cifras apagadas |
| `--accent` | `#a32b3f` | Acción primaria, valores destacados, barras |
| `--accent-ink` | `#fff8f2` | Texto sobre `--accent` |
| `--por` | `#b8791a` | Posición Portero |
| `--def` | `#1f6fa8` | Posición Defensa |
| `--med` | `#5c8a1f` | Posición Medio |
| `--del` | `#b83248` | Posición Delantero |
| `--good` | `#2f7d4f` | Deltas positivos, beneficio en verde |
| `--bad` | `#b83248` | Lesiones, deltas negativos, borrar |
| `--pitch` | `repeating-linear-gradient(0deg,#e6e1d4 0 46px,#dfd9ca 46px 92px)` | Césped |

### Paletas alternativas (implementar como tema conmutable si interesa)
`nocturno`: `--bg #0d1120`, `--surface #151b30`, `--surface2 #1e2540`, `--line #2c3455`,
`--text #e8ecf7`, `--text2 #8b95b8`, `--accent #f0b429`, `--accent-ink #1a1405`,
`--por #f0b429`, `--def #5aa9e6`, `--med #9fd356`, `--del #ef6f6c`, `--good #5fd39a`, `--bad #ef6f6c`,
`--pitch repeating-linear-gradient(0deg,#131a2e 0 46px,#171f36 46px 92px)`.

`carbon`: `--bg #0c0c0d`, `--surface #16161a`, `--surface2 #202027`, `--line #2e2e38`,
`--text #f2f2f4`, `--text2 #8e8e99`, `--accent #ff5a3c`, `--accent-ink #1a0703`,
`--por #e0a52e`, `--def #5f9ed6`, `--med #a8c34a`, `--del #ff5a3c`, `--good #63c68a`, `--bad #ff5a3c`,
`--pitch repeating-linear-gradient(0deg,#141418 0 46px,#18181d 46px 92px)`.

### Tipografía
Tres pares. El elegido es **`condensada`**:

| Variable | Valor (`condensada`) |
|---|---|
| `--fh` (titulares) | `'Oswald', Helvetica, sans-serif` — pesos 500/600/700 |
| `--fb` (cuerpo/UI) | `'Source Sans 3', Helvetica, sans-serif` — 400/500/600/700 |
| `--fm` (cifras) | `'IBM Plex Mono', monospace` — 400/600 |

Alternativas listas en el prototipo:
- `editorial`: `--fh 'Instrument Serif', Georgia, serif` · `--fb Archivo` · `--fm 'JetBrains Mono'`
- `tecnica`: `--fh 'Space Grotesk'` · `--fb 'IBM Plex Sans'` · `--fm 'IBM Plex Mono'`

Google Fonts (una sola petición):
```
https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Source+Sans+3:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;600&display=swap
```

### Escala tipográfica
| Rol | Tamaño / peso / familia |
|---|---|
| H1 de pantalla | 34px, `--fh`, uppercase, `letter-spacing:-.02em` |
| Marca en cabecera | 16px, `--fh`, uppercase |
| H2 de tarjeta | 15px, `--fh`, uppercase |
| Subtítulo de pantalla | 13.5px, `--fb`, color `--text2` |
| Fila de tabla | 13px / 13.5px, `--fb`; nombre en 700 |
| Etiqueta de campo | 9px, 700, `letter-spacing:.16em`, uppercase, `--text2` |
| Cifra KPI grande | 27px, `--fh` |
| Cifra en tabla / mono | 12–17px, `--fm`, 700 |
| Nota al pie | 11.5px, `--text2` |

### Espaciado, radios y sombras
- Escala de espaciado usada: 3, 5, 6, 8, 10, 11, 13, 15, 16, 18, 20, 22, 24, 26px.
- Radios: `999px` (píldoras y nav), `18px` (tarjetas y secciones), `13–14px` (campo, slots, botones grandes),
  `11px` (filas de banquillo, botones), `8–9px` (chips), `6px` (badges de posición).
- Sin sombras. La jerarquía se construye con `--surface` sobre `--bg` y bordes `1px solid var(--line)`.
- Contenido centrado, `max-width: 1520px`, padding `24px 26px 64px`.

---

## Screens / Views

### Chrome común: cabecera
`position:sticky; top:0; z-index:30`, `background:var(--surface)`, borde inferior `1px solid var(--line)`,
padding `13px 26px`, `display:flex; align-items:center; gap:22px; flex-wrap:wrap`.

De izquierda a derecha:
1. **Marca**: cuadrado 34×34, `border-radius:10px`, `background:var(--accent)`, letra "F" en `--fh` 16px
   color `--accent-ink`. A su derecha, dos líneas: nombre de liga (16px `--fh` uppercase) y
   `LaLiga · 12 equipos · J5` (10px, `letter-spacing:.15em`, uppercase, `--text2`).
2. **Nav** (5 píldoras): Alineación · Mi plantilla · Mercado · Clasificación · Estadísticas.
   Píldora: padding `8px 15px`, `border-radius:999px`, 13px/600, borde `1px solid var(--line)`,
   texto `--text2`, fondo transparente. Activa: fondo `--accent`, texto `--accent-ink`, borde `--accent`.
   Hover: `opacity:.82`.
3. **Espaciador** `flex:1`.
4. **Deadline**: dos líneas alineadas a la derecha — etiqueta 9px uppercase `--text2` "Cierra la jornada"
   y `sáb 14:00 · 2d 04h` en `--fm` 14px/700 color `--accent`. Debe calcularse desde `jornada.fecha`.
5. **Selector de tipografía**: 3 botones "Aa" en un contenedor `background:var(--surface2)`,
   `border-radius:9px`, borde `--line`, padding 3px. Cada botón muestra su propia familia de titular.
   *Es un control de exploración de diseño: en producción se elimina y se fija una tipografía.*
6. **Selector de paleta**: 3 círculos de 24px, `border-radius:50%`, borde 2px (`--text` si activo,
   transparente si no), relleno con el acento del tema (`#a32b3f`, `#f0b429`, `#ff5a3c`).
   *Opcional en producción; si se conserva, persistir la elección por usuario.*
7. **Usuario**: separador `border-left:1px solid var(--line)`, padding-left 15px; avatar circular 30px
   con iniciales (11px/700, `--text2`, fondo `--surface2`) y nombre de equipo 13px/600.

---

### 1. Alineación (vista por defecto, ruta `/alineacion`)
**Propósito:** montar el once de la jornada y ordenar el banquillo antes del cierre.

**Layout:** cabecera de pantalla; debajo, dos columnas con `display:flex; gap:18px; flex-wrap:wrap`:
- Columna izquierda `flex:1 1 640px; min-width:540px` → tarjeta del campo.
- Columna derecha `flex:1 1 330px; min-width:310px` → banquillo, duelo, resto de la jornada.

**Cabecera de pantalla:** H1 "Manda tu alineación" + subtítulo
"Arrastra del banquillo al campo, o toca un jugador y luego su hueco. 11 titulares + suplentes con cobertura por línea."
A la derecha, en fila con `gap:9px`:
- **Selector de formación**: 4 botones (`4-4-2`, `4-3-3`, `3-5-2`, `5-3-2`) en contenedor `--surface2`,
  `border-radius:11px`, padding 3px. Botón: `--fm` 12.5px/700, padding `8px 12px`, radio 8px.
  Activo: fondo `--accent`, texto `--accent-ink`.
- **`↩ Repetir última`** y **`Once óptimo`**: botones secundarios — fondo `--surface`, borde `--line`,
  padding `10px 15px`, radio 11px, 13px/600. Hover: `border-color:var(--accent)`.
- **`Enviar alineación`**: primario — fondo `--accent`, texto `--accent-ink`, padding `11px 22px`,
  radio 11px, 13.5px/700. Al guardar cambia a `✓ Enviada`. Hover `opacity:.88`.

**Banda de aviso** (condicional, encima del contenido): fondo `--surface`, borde `1px solid var(--accent)`,
texto `--accent` 13px/600, padding `10px 15px`, radio 11px.

**Tarjeta del campo:** `--surface`, borde `--line`, radio 18px, padding 16px.
- Fila superior: tres KPI (`Titulares` `11/11` — verde `--good` si completo, rojo `--bad` si no;
  `Media prevista` en `--accent`; `Valor en campo` en `--text`). Cada KPI: etiqueta 9px uppercase
  + cifra `--fm` 17px/700. A la derecha, la formación activa en `--fm` 12px `--text2`.
- **Campo**: `background:var(--pitch)`, borde `--line`, radio 14px, padding `18px 12px`,
  `display:flex; flex-direction:column; gap:10px; min-height:600px; justify-content:space-between`.
  Cuatro filas en orden **DEL → MED → DEF → POR** (de arriba a abajo).
  - Cada fila: etiqueta vertical de línea (`writing-mode:vertical-rl; transform:rotate(180deg)`,
    9px/700, `letter-spacing:.18em`, color de la posición, ancho 14px) + contenedor de huecos
    `flex:1; display:flex; justify-content:center; gap:10px; flex-wrap:wrap; padding:6px 4px;
    border-radius:12px` con tinte `color-mix(in oklab, var(--<pos>) 12%, transparent)`.
  - **Hueco ocupado (carta de jugador)**: 96px de ancho, `min-height:118px`, radio 13px,
    borde `1px solid rgba(255,255,255,.3)`, fondo = degradado del club
    `linear-gradient(155deg, color1, color2 74%, color2)`, texto = tinta del club.
    Contenido centrado: media en `--fm` 19px/700; círculo 36px con iniciales (`--fh` 12px,
    fondo `rgba(255,255,255,.22)`, borde `1.5px solid rgba(255,255,255,.5)`); nombre 11.5px/700;
    club 9px uppercase `letter-spacing:.12em` `opacity:.8`. Hover: `filter:brightness(1.08)`.
    Es `draggable`. Click → devuelve al banquillo.
  - **Hueco vacío**: mismas medidas, borde `1.5px dashed var(--line)`,
    fondo `color-mix(in oklab, var(--surface) 55%, transparent)`; dentro, círculo 34px con borde
    `1.5px dashed` del color de la posición y un `+` 17px, más la abreviatura de posición
    (9.5px/700 uppercase `letter-spacing:.14em`, `--text2`).
  - Los colores de club se toman de `frontend/src/app/shared/club-colors.ts` (ya existe: reutilizarlo).

**Tarjeta Banquillo:** cabecera con H2 "Banquillo" + contador "N disponibles" (11px `--text2`).
Lista con `gap:6px`, `max-height:430px; overflow:auto`. Cada fila: padding `8px 10px`, radio 11px,
fondo `--surface2`, borde `--line`, `cursor:grab`, `draggable`.
- Badge de posición: 28×28, radio 8px, fondo del color de posición, texto blanco 9px/700.
- Nombre 13px/700 con `text-overflow:ellipsis`; club 10px uppercase `--text2`.
- **Chips de cobertura** `DEF`/`MED`/`DEL` (28px de ancho, radio 6px, 9px/700): activo = fondo del color
  de línea y texto blanco; inactivo = transparente con borde `--line` y texto `--text2`.
  Regla de negocio existente: máximo **2 suplentes por línea**, y un suplente no puede quedarse sin
  ninguna línea.
- Media a la derecha en `--fm` 14px/700.
- Fila seleccionada: fondo `color-mix(in oklab, var(--accent) 14%, var(--surface))`, borde `--accent`.

**Tarjeta Tu duelo · J5:** nombre propio y rival a los lados (13px/700 + récord 11px `--text2`),
marcadores en `--fh` 26px (el propio en `--accent`), "VS" 10px `--text2` en medio.
Debajo, barra de 6px `border-radius:99px` sobre `--surface2` con relleno `--accent` proporcional
a los puntos. Nota al pie 11.5px `--text2`:
"Diferencia ≥3 pts reparte 3-0 · entre 0,5 y 2,9 reparte 2-1 · empate 1,5-1,5."

**Tarjeta Resto de la jornada:** 5 filas `display:grid; grid-template-columns:1fr auto 1fr`,
12.5px/600, marcador central en `--fm`/700 `--text2`, separador inferior `1px solid var(--line)`.

---

### 2. Mi plantilla (`/plantilla`)
H1 "Mi plantilla" + subtítulo con el recuento ("16 jugadores · 2 porteros (uno virtual) · presupuesto libre 24,5 M").

**Cuatro tarjetas KPI** en fila (`flex:1 1 190px`, `--surface`, borde `--line`, radio 16px, padding `15px 17px`):
etiqueta 9px uppercase, valor `--fh` 27px, delta 11.5px/600 (verde `--good`, rojo `--bad` o `--text2`).
Contenido: Puntos totales `172.5` (+46.5 en la J4) · Media por jornada `43.1` (liga: 39.4) ·
Valor de plantilla `141 M` (+6.5 M desde el draft) · Bajas y dudas `2` (Budimir, Balde).

**Tabla** en tarjeta `--surface` radio 18px `overflow:hidden`.
`grid-template-columns: 46px 1.7fr 88px 84px 74px 74px 88px; gap:10px`.
Cabecera: padding `12px 18px`, 9px uppercase `letter-spacing:.16em` `--text2` 700 —
Pos · Jugador · Club · Estado · Pts · Media · Precio.
Filas: padding `11px 18px`, borde inferior `--line`, 13px, `cursor:pointer`, hover `background:var(--surface2)`.
Badge de posición idéntico al del banquillo (radio 6px, blanco sobre color de posición).
Precio en `--fm`/700 `--accent`. Estado: `OK` → `--text2`; `Virtual` → `--por`; `Duda`/`Lesión` → `--bad`.
Orden: por posición (POR, DEF, MED, DEL) y dentro por puntos descendentes.
Click en fila → abre la ficha de jugador.

---

### 3. Mercado y fichajes (`/mercado` + `/fichajes`)
H1 "Mercado y fichajes" + subtítulo que explica la regla real de desempate:
"Pide hasta dos jugadores por prioridad. Si otro equipo pide al mismo, decide: no fichó la semana pasada
→ peor clasificado → menos puntos totales."
A la derecha, **tarjeta de deadline**: borde `1px solid var(--accent)`, radio 13px, padding `11px 17px`,
etiqueta 9px uppercase + `martes 23:59` en `--fm` 16px/700 `--accent`.

**Columna izquierda — tabla de libres** (`flex:1 1 640px`):
- Barra de filtros: etiqueta "Libres" + 5 píldoras (`Todos`, `POR`, `DEF`, `MED`, `DEL`),
  padding `6px 13px`, radio 999px, 12px/600; activa con fondo `--accent`.
- `grid-template-columns: 46px 1.7fr 88px 74px 74px 96px`. Columnas: Pos · Jugador · Club · Media · Precio · acción.
- Botón de acción por fila: 11.5px/700, radio 8px, padding `6px 0`. Estado normal `Pedir`
  (transparente, borde `--line`); pedido `Pedido` (fondo `--accent`, texto `--accent-ink`).
  Máximo 2 peticiones activas: el tercer click no hace nada.

**Columna derecha:**
- **Mis peticiones**: contador `N/2` en `--fm`. Cada petición: círculo de prioridad 22px
  (`--accent` / `--accent-ink`, 11px/700), nombre 13px/700, meta 10.5px `--text2`
  ("DEL · Betis · 8.0 M"), botón `✕` 26×26 radio 7px con texto `--bad`.
  Estado vacío: "Todavía no has pedido a nadie esta semana." (12.5px `--text2`).
  Pie separado por `border-top`: `Presupuesto tras fichar` (etiqueta 9px) con la cifra en `--fm` 17px/700
  — verde `--good` si ≥0, rojo `--bad` si negativo — y botón `Enviar` primario.
- **Quién pide a quién**: filas con nombre del jugador (12.5px/600), equipos que lo piden (11px `--text2`)
  y número de peticiones en `--fm`/700 (rojo si ≥3, `--por` si 2, `--text2` si ≤1).

---

### 4. Clasificación (`/clasificacion`)
H1 + subtítulo "Liga · tras la jornada 4. Premios de liga: 160 / 110 / 50 € al 1º, 2º y 3º."
Tabla en tarjeta, `grid-template-columns: 44px 1.9fr 62px 62px 62px 78px 90px 88px`,
columnas `# · Equipo · V · E · D · Puntos · Fantasy · Beneficio`.
- Marca de podio: barra vertical 3×20px radio 2px en `--accent` para las tres primeras posiciones,
  transparente para el resto; a su lado el número en `--fm`/700.
- Fila del equipo propio resaltada: `background: color-mix(in oklab, var(--accent) 8%, var(--surface))`.
- V/E/D en `--fm` color `--text2`; Puntos en `--fm`/700; Fantasy en `--fm` `--text2`.
- Beneficio con signo (`+30 €`, `-25 €`) en `--fm`/700: verde `--good` si >0, rojo `--bad` si <0,
  `--text2` si 0.

---

### 5. Estadísticas de la liga (`/puntuaciones`)
H1 + subtítulo "Jornadas 1 a 4 · 12 equipos · 264 jugadores en juego."
Rejilla `grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap:16px` con cuatro tarjetas:

1. **Más puntuados de la liga** — 6 filas: badge de posición 34px, nombre (`flex:0 0 128px`, 13px/700),
   barra de progreso (9px de alto, radio 99px, pista `--surface2`, relleno `--accent`, ancho = pts/max),
   puntos en `--fm` 13px/700 alineados a la derecha. Click → ficha del jugador.
2. **Puntos por jornada** — 4 barras verticales, contenedor de 200px de alto,
   `align-items:flex-end; gap:14px`. Barra: `border-radius:8px 8px 0 0`, altura proporcional al máximo;
   fondo `--accent` si el valor está por encima del umbral, `--surface2` si no.
   Valor encima en `--fm` 12px/700, etiqueta `J1…J4` debajo (10.5px `--text2`).
   Pie: "Tu media: 43,1 pts · media de la liga: 39,4 pts."
3. **Récords** — 5 filas con etiqueta 12.5px/700 + meta 10.5px `--text2` a la izquierda y valor
   `--fm` 16px/700 `--accent` a la derecha; separador inferior `--line`.
4. **Cómo se puntúa** — rejilla `1fr auto`, 12.5px: etiqueta en `--text2`, valor en `--fm`/700
   (verde `--good` los positivos, rojo `--bad` los negativos). Tabla de puntuación tal cual está
   documentada en `docs/2026-06-13-motor-scoring-v2.md`: victoria +2, empate +1, gol POR +5, DEF +4,
   MED +3, DEL +2, penalti +2, portería a cero POR +2 / DEF +1, roja −3, gol en propia POR/DEF −1.

---

### 6. Ficha de jugador (modal)
Overlay `position:fixed; inset:0; z-index:60; background:rgba(0,0,0,.55); backdrop-filter:blur(3px)`,
centrado con padding 24px. Click en el overlay cierra; click dentro no propaga.

Panel: `max-width:520px`, `--surface`, borde `--line`, radio 20px, `overflow:hidden`,
entrada `animation: rise .28s cubic-bezier(.2,.7,.2,1) both` (`@keyframes rise` = `opacity:0` +
`translateY(8px)` → estado final).
- **Cabecera**: padding `20px 22px`, fondo = degradado del club, texto = tinta del club.
  Círculo 56px con iniciales (`--fh` 18px), nombre `--fh` 22px, meta 11.5px uppercase
  `letter-spacing:.12em` `opacity:.9` ("DEL · Barcelona · 14.0 M"), botón `✕` 30×30 radio 9px
  con fondo `rgba(255,255,255,.2)`.
- **4 KPI** en `grid-template-columns: repeat(4,1fr); gap:10px`: fondo `--surface2`, borde `--line`,
  radio 12px, padding `10px 11px`; etiqueta 8.5px uppercase `letter-spacing:.14em` `--text2`,
  valor `--fm` 17px/700. Contenido: Puntos · Media · Titular (`4/4`) · Precio.
- **Últimas jornadas**: cabecera 9px uppercase `--text2`; 5 barras verticales en 96px de alto,
  radio `6px 6px 0 0`, `--accent` si destacada, `--surface2` si no.
- **Detalle**: rejilla `1fr auto`, 12.5px, separada por `border-top:1px solid var(--line)`:
  Goles · Asistencias · Porterías a cero · Tarjetas rojas · Propiedad (equipo FALM o "Libre").

---

## Interactions & Behavior

### Alineación
- **Drag & drop**: las filas del banquillo y las cartas del campo son `draggable`; en `dragstart` se
  escribe el id del jugador en `dataTransfer` (`text/plain`). Los huecos hacen `preventDefault()` en
  `dragover` y leen el id en `drop`.
- **Alternativa táctil (obligatoria, móvil)**: tocar un jugador del banquillo lo selecciona (fondo teñido
  de acento); tocar después un hueco lo coloca. Tocar un hueco sin selección muestra el aviso
  "Toca primero un jugador del banquillo."
- **Validación de posición**: si el jugador soltado no es de la línea del hueco, no se coloca y se
  muestra "Ese hueco es de DEF y <nombre> no lo cubre."
- **Sustitución en hueco ocupado**: el jugador que estaba sale al banquillo y entra el nuevo.
- **Click en carta del campo**: saca al jugador al banquillo.
- **Cambio de formación**: recalcula cupos (`POR:1` + los tres números de la formación) y recorta cada
  línea a su nuevo cupo conservando **los de mayor media** (comportamiento ya implementado en
  `alineacion.component.ts`, mantenerlo).
- **`Once óptimo`**: por cada línea toma los de mayor media **saltando lesionados** y avisa
  "Once por media, saltando lesionados. Revisa y guarda."
- **`↩ Repetir última`**: carga la alineación de la jornada anterior y avisa
  "↩ Cargada tu alineación de la J4. Revisa y guarda."
- **`Enviar alineación`**: si faltan titulares → "Te faltan N titulares por colocar." Si está completa →
  "✓ Alineación enviada. Puedes cambiarla hasta el sábado a las 14:00." y el botón pasa a `✓ Enviada`.
- **Chips de cobertura**: `stopPropagation` para no arrastrar la fila; máximo 2 suplentes por línea;
  no se puede quitar la última línea de un suplente.
- **Jornada partida (PARCIAL)**: pendiente de aplicar en producción — los jugadores de equipos LFP que ya
  jugaron deben salir bloqueados (hueco y fila no arrastrables, `opacity` reducida y tooltip explicando
  el bloqueo). El prototipo no lo representa.

### Resto
- Nav: cambio de pantalla, limpia el aviso activo.
- Filtros de mercado y de formación: selección única.
- Peticiones: tope de 2; el botón alterna Pedir/Pedido; `✕` en la lista la retira.
- Modal: cierra con click en overlay o en `✕`. Añadir `Esc` y foco atrapado al implementar.
- Hover general: filas de tabla → `background:var(--surface2)`; botones secundarios → `border-color:var(--accent)`;
  primarios → `opacity:.88`; cartas del campo → `filter:brightness(1.08)`. Sin transiciones largas:
  el prototipo solo anima la entrada del modal.
- **Responsive**: la cabecera y las dos columnas usan `flex-wrap:wrap`. En móvil la columna del campo
  mantiene `min-width:540px`, así que **hay que rehacerla** por debajo de ~600px: campo a ancho completo
  con huecos más pequeños (≈76px), banquillo en hoja inferior (`bottom sheet`) como ya hace
  `alineacion.component.ts`, y tablas convertidas en tarjetas apiladas.

## State Management
Estado local de la vista de alineación (en el prototipo, `signal()` en Angular):
- `tema: 'prensa' | 'nocturno' | 'carbon'` — solo si se conserva el conmutador.
- `tipografia` — solo exploración de diseño, no va a producción.
- `pantalla` — la ruta, en producción la resuelve el router.
- `formacion: string` (`'4-4-2'`…), `once: string[]` (ids de titulares),
  `cobertura: Record<id, ('DEF'|'MED'|'DEL')[]>`, `seleccionado: id | null`,
  `aviso: string`, `guardado: boolean`.
- `ficha: id | null` (modal), `filtroPos`, `peticiones: id[]` (máx. 2).

Derivados (computados, no almacenados): cupos por línea, titulares por línea, huecos,
media prevista (suma de medias del once), valor en campo (suma de precios), presupuesto restante.

Datos a traer del backend existente (`FalmService`): `miEquipo()`, `miPlantilla()`, `puntosEquipo()`,
`competiciones()`, `jornadas()`, `getAlineacion()`, `ultimaAlineacion()`, `guardarAlineacion()`,
jugadores libres y peticiones de fichaje, clasificación y estadísticas por jornada.

## Assets
Ninguno nuevo. El prototipo no usa imágenes: las caras de jugador y los escudos se sustituyen por
iniciales sobre el color del club. En producción se mantienen las fotos y escudos actuales
(`fut-card.component.ts` ya los gestiona con fallback a escudo y a inicial).
Iconografía: solo caracteres de texto (`+`, `✕`, `↩`, `✓`). Sin librería de iconos.

## Files
- `Liga Fantasy.dc.html` — el prototipo completo (las seis vistas, tres paletas, tres tipografías).
  Ábrelo en el navegador para inspeccionar cualquier medida o estado. Requiere `support.js` al lado.
- `support.js` — runtime del entorno de diseño. No es parte del diseño ni debe portarse.

### Ficheros del repo a modificar
| Vista | Fichero destino |
|---|---|
| Tokens y tipografía | `frontend/src/styles.css` |
| Alineación | `frontend/src/app/features/equipo/alineacion.component.ts` |
| Carta de jugador | `frontend/src/app/shared/fut-card.component.ts` |
| Colores de club | `frontend/src/app/shared/club-colors.ts` (sin cambios) |
| Mi plantilla | `frontend/src/app/features/equipo/plantilla.component.ts` |
| Mercado | `frontend/src/app/features/mercado/mercado.component.ts` |
| Fichajes | `frontend/src/app/features/fichajes/fichajes.component.ts` |
| Clasificación | `frontend/src/app/features/competicion/clasificacion.component.ts` |
| Estadísticas | `frontend/src/app/features/estadisticas/puntuaciones.component.ts` |
| Ficha de jugador | `frontend/src/app/shared/ficha-jugador.component.ts` |

## Nota sobre los datos del prototipo
Nombres de jugadores, equipos FALM, puntuaciones, precios y presupuestos son **datos de ejemplo**
puestos para que el diseño se lea con contenido realista. No reflejan la liga real ni deben migrarse.
