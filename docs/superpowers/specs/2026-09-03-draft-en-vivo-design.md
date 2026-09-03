# Draft en vivo — diseño

Fecha: 2026-09-03
Estado: aprobado, pendiente de plan de implementación

## 1. Objetivo

Permitir que los 10 mánagers de FALM hagan el draft inicial desde la web, en una
quedada mixta (unos presenciales con su móvil, otros en remoto), viendo en tiempo
real cómo desaparecen los jugadores según los fichan los demás.

Hoy el motor de draft ya existe en Supabase pero solo es operable desde el panel
de admin: `pretemporada.component.ts:189` deja escrito que "el pick se realiza
desde el tablero del equipo en su turno (próximo paso de la UI de draft)". Este
diseño es ese paso.

## 2. Reglas acordadas

| Regla | Decisión |
|---|---|
| Ritmo | En vivo síncrono, **sin reloj**. El turno bloquea hasta que ese equipo elige. |
| Orden | Sorteo aleatorio + serpiente, ya implementado en `draft_crear`. |
| Rondas | 23 picks por equipo (230 en total). |
| Composición | Mínimo **2 porterías**; los otros 21 libres. Las porterías cuentan dentro de los 23. |
| Porterías | Son los activos `tipo='DEFENSA'` (uno por club LFP). Engloban a todos los porteros del club: puntúa lo que haga el portero que juegue esa jornada. |
| Porteros individuales | **No fichables.** Siguen en la BD porque el scraper les asigna puntos y de ahí se propagan a la portería del club (`insercion = SINCRONIZADO_PORTERIA`). |
| Presenciales | Cada uno ficha desde su móvil. El admin puede fichar en nombre de otro equipo. |
| Pantalla de proyección | Fuera de alcance. |

## 3. Estado actual del sistema

Ya existe y funciona (verificado en el proyecto `rgpzrbwpyaewughahpgo`, schema `falm`):

- Tablas `draft` (estados CREADO → EN_CURSO → COMPLETADO → CONSOLIDADO → CANCELADO,
  `total_rondas` por defecto 23), `draft_orden` (serpiente, con flag `completado`)
  y `draft_pick`.
- Funciones `draft_crear`, `draft_pick`, `draft_estado`, `draft_consolidar`, `draft_auto`.
- `draft_pick` valida: draft en curso, es el turno de ese equipo, el activo no fue
  elegido antes, el activo está libre. Avanza el turno y marca COMPLETADO al acabar.
- Vista `v_activo_libre`, ya usada por el mercado.
- 10 equipos, 860 activos (840 jugadores + 20 porterías), de los cuales 103 son
  porteros individuales.

Carencias que este trabajo cubre:

1. **Agujero de seguridad**: `draft_pick` es `SECURITY DEFINER` y recibe `p_equipo`
   como parámetro sin comprobar que ese equipo sea el del usuario autenticado.
   Cualquier usuario logueado puede fichar en nombre del equipo al que le toque.
2. No hay wishlist.
3. Realtime no está habilitado para ninguna tabla de `falm`.
4. No hay UI de draft para el mánager, ni forma de deshacer un pick.
5. Los 103 porteros individuales son fichables.

## 4. Arquitectura

Sin backend nuevo. Angular 18 (standalone + signals) contra Supabase directamente,
igual que el resto de la app. El tiempo real se resuelve con **Supabase Realtime
(Postgres Changes)** sobre WebSocket: los clientes se suscriben a los `INSERT` de
`draft_pick` y a los `UPDATE` de `draft`. No se usa SSE: el frontend es estático
en Vercel y un SSE exigiría una función serverless con conexión abierta, peor en
todo (timeouts, coste, unidireccional).

Fallback: si el canal cae, polling cada 5 s hasta reconectar.

La fuente de verdad es siempre la BD. Todo evento recibido se aplica sobre el
estado local, y hay tres puntos de reconciliación (suscripción, reconexión y
vuelta de la pestaña a primer plano) que refrescan los picks completos.

## 5. Cambios en Supabase

### 5.1 `activo.fichable`

Columna nueva `boolean not null default true`. Se pone a `false` en los 103
porteros individuales. Se filtra en `v_activo_libre`, con lo que desaparecen a la
vez del draft y del mercado sin dejar de existir para la puntuación.

Se usa un flag explícito en vez de filtrar por `posicion='PORTERO'` para poder
excluir otros activos en el futuro con un `update` en vez de una migración.

### 5.2 `falm.draft_wishlist`

```
draft_id        uuid not null references falm.draft(id) on delete cascade
equipo_falm_id  uuid not null references falm.equipo_falm(id)
activo_id       uuid not null references falm.activo(id)
prioridad       int  not null
nota            text
primary key (draft_id, equipo_falm_id, activo_id)
unique (draft_id, equipo_falm_id, prioridad) deferrable initially deferred
```

El único diferido permite reordenar la cola en una sola transacción sin colisiones
intermedias de prioridad.

RLS: `select`, `insert`, `update` y `delete` solo si `equipo_falm_id` corresponde
al equipo de `auth.uid()`. Nadie puede leer la cola de otro equipo.

Vive en BD y no en `localStorage` para que la cola preparada en el PC esté
disponible desde el móvil durante la quedada.

### 5.3 `draft_pick` v2

Se reescribe la función existente conservando sus validaciones y añadiendo:

- **Identidad**: `p_equipo` debe pertenecer a `auth.uid()`, salvo que el usuario
  tenga rol `ADMIN` o `GESTOR` en `usuario_perfil` (es lo que habilita "fichar en
  nombre de"). Cierra el agujero descrito en 3.1.
- **Fichable**: el activo debe aparecer en `v_activo_libre`.
- **Mínimo de porterías**: si a ese equipo le quedan tantos turnos como porterías
  le faltan para llegar a 2, solo se le permite elegir portería.
- **`for update`** en el `select` del turno sobre `draft_orden`, para serializar
  dos peticiones simultáneas: la segunda espera y encuentra el turno ya cerrado.

### 5.4 `draft_pick_deshacer(p_draft uuid)`

Función nueva, solo para `ADMIN`/`GESTOR`. Borra el último pick del draft
(`orden_seleccion` máximo), revierte su `draft_orden.completado` a `false` y
devuelve el draft a `EN_CURSO` si estaba `COMPLETADO`. Rechaza la operación si el
draft ya está `CONSOLIDADO`.

### 5.5 Realtime y RLS

```
alter publication supabase_realtime add table falm.draft, falm.draft_pick;
alter table falm.draft_pick replica identity full;
```

Políticas `select` para `authenticated` en `draft`, `draft_orden` y `draft_pick`.
Realtime respeta RLS: sin permiso de SELECT no llegan los eventos.

## 6. Frontend

Ruta `/draft` en `app.routes.ts`, bajo `authGuard` como el resto. Feature en
`frontend/src/app/features/draft/`:

- `draft.service.ts` — carga, estado (signals), canal Realtime, reconciliación y
  fallback de polling.
- `draft.component.ts` — el tablero.
- `draft-cola.component.ts` — la wishlist.

### 6.1 Carga y filtrado

Al entrar se cargan tres cosas: el catálogo de activos fichables (~757 filas con
nombre, club, escudo, posición y precio), el estado del draft con sus picks, y las
230 filas de `draft_orden` completas.

A partir de ahí **todo el filtrado ocurre en cliente**: buscador, posición, club,
"solo libres" y "solo mi cola". Escribir en el buscador no toca el servidor.

Nota sobre el catálogo: `v_activo_libre` excluye a los que ya están en una
plantilla, y las plantillas no se crean hasta `draft_consolidar`. Así que durante
el draft devuelve los 757 completos, y quién está ya pillado se marca en cliente
cruzando con los picks. Es lo que permite pintar las filas tachadas en vez de
hacerlas desaparecer.

### 6.2 Tablero

Escritorio en dos columnas: catálogo a la izquierda; a la derecha, fijos, el orden
del draft, tu plantilla y tu cola. Móvil: la misma información en pestañas, porque
los presenciales van con el móvil.

Barra superior pegajosa con `Pick 7/230 · Ronda 1 · Turno de Rótova`, que cambia a
un **TE TOCA** destacado cuando el turno es tuyo.

El botón Fichar tiene tres estados: activo (es tu turno), apagado con el nombre del
equipo que bloquea, o fila tachada con el escudo de quien se llevó al jugador.
El pick pide confirmación: es irreversible sin intervención del admin.

Badge permanente de plantilla: `17/23 · porterías 1/2`. Si quedan justo los turnos
necesarios para cubrir las 2 porterías, el catálogo se filtra automáticamente a
porterías y se explica el motivo.

### 6.3 Aviso de turno

Al pasar a ser tu turno: sonido, notificación del navegador (con permiso pedido al
entrar) y parpadeo del título de la pestaña.

### 6.4 Cola de favoritos

Estrella en cada fila del catálogo para añadir; panel arrastrable para ordenar por
prioridad. Cuando otro equipo ficha a alguien de tu cola, se tacha solo y sube el
siguiente, sin recargar.

Elementos de ayuda a la decisión:

- Contador "4 de tus 10 ya fichados".
- Radar: "quedan 5 picks para tu turno · 4 de tu top-5 siguen libres". Son dos
  datos factuales (turnos ajenos que faltan hasta el tuyo, y cuántos de tu cola
  siguen disponibles); deliberadamente no se estima ninguna probabilidad de que te
  quiten a alguien, porque no hay forma de conocer las colas ajenas y una cifra
  inventada sería peor que ninguna.
- **Pre-pick**: si está marcado, en cuanto llegue tu turno se ficha automáticamente
  el primero de tu cola que siga libre y cumpla el mínimo de porterías. Se registra
  como un pick normal de tu equipo. Si la cola está vacía o ningún candidato es
  válido, no se hace nada: el turno sigue esperando tu decisión y se te avisa
  igualmente (sonido y notificación).

### 6.5 Estados de pantalla

Sin draft activo · draft creado sin empezar · en curso y no es tu turno · en curso
y es tu turno · desconectado (banner ámbar "Reconectando…") · completado (resumen
de tu plantilla) · usuario sin equipo asignado.

Las excepciones de Postgres se traducen a mensajes en castellano; en particular
"ese activo ya fue elegido" se muestra como "Te lo han quitado hace un segundo".

## 7. Panel de admin

En `pretemporada.component.ts` se sustituye el `picar()` de la línea 189 por:

- Selector de equipo + fichar en nombre de ese equipo.
- Deshacer último pick.
- Consolidar cuando el draft esté COMPLETADO (ya existe, se mantiene).

## 8. Verificación

El repo no usa framework de tests; se sigue la práctica de
`docs/2026-06-14-verificacion-funcional-v2.md`.

1. Bloque SQL sobre un draft de prueba que cubre: pick fuera de turno, pick de
   equipo ajeno sin ser admin, pick de equipo ajeno siendo admin, activo ya
   elegido, activo no fichable, violación del mínimo de porterías, deshacer último
   pick, y consolidación final.
2. Prueba a dos navegadores con dos usuarios distintos: comprobar que el pick de
   uno aparece en el otro sin recargar, que la cola del segundo se tacha sola, y
   que al cortar la red el banner de reconexión aparece y luego se recupera sin
   perder picks.
3. Prueba en móvil real del layout en pestañas y del aviso de turno.

## 9. Fuera de alcance

- Pantalla de proyección para la quedada.
- Temporizador de turno y autopick por expiración.
- Draft de invierno.
- Renombrar el valor de enum `activo_tipo.DEFENSA` a `PORTERIA`. Es deuda técnica
  reconocida: el código ya lo presenta como "Portería &lt;Club&gt;"
  (`falm.service.ts:314`), pero el rename toca el motor de puntuación y no aporta
  nada al draft. Se aborda por separado.
