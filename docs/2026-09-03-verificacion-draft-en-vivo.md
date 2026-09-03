# Verificación funcional — Draft en vivo (2026-09-03)

Diseño: `docs/superpowers/specs/2026-09-03-draft-en-vivo-design.md`
Plan: `docs/superpowers/plans/2026-09-03-draft-en-vivo.md`

## 1. Motor de picks (BD) — ✅

| | |
|---|---|
| **Antes** | `draft_pick(p_draft, p_activo, p_equipo)` validaba draft en curso, turno, activo no repetido y activo fuera de plantilla. Como es `SECURITY DEFINER` y no comprobaba `auth.uid()`, **cualquier usuario logueado podía fichar en nombre del equipo al que le tocaba el turno**. |
| **Ahora** | Añadidas tres validaciones: identidad (`es_mi_equipo` o `es_gestor`), disponibilidad real vía `v_activo_libre`, y mínimo de 2 porterías dentro de los turnos de cada equipo. Más `for update` sobre el turno para serializar peticiones simultáneas. Nueva `draft_pick_deshacer(p_draft)` restringida a ADMIN/GESTOR. |
| **Test real** | `tools/sql/draft_pick_v2_test.sql`, 7 casos: pick fuera de turno, portero individual (no fichable), pick válido, activo ya elegido, deshacer devuelve el turno al equipo original, jugador de campo rechazado cuando ya solo caben porterías, y portería aceptada en esa misma situación. Resultado: **TEST OK: todos los casos pasaron**. El bloque se revierte solo (`draft`, `draft_pick` y `draft_orden` quedaron a 0 filas). |
| **Nota** | La validación de identidad no se puede ejercitar desde SQL de mantenimiento: `auth.uid()` es nulo ahí y la función lo trata como ejecución de mantenimiento. Se verifica desde el navegador (sección 4). |

## 2. Permisos y Realtime — ✅

| | |
|---|---|
| **Antes** | Ninguna tabla de `falm` en la publicación `supabase_realtime`. La política `wr_pick` permitía a un mánager **insertar picks directamente en `draft_pick`** con tal de que fueran de su equipo, saltándose el turno. |
| **Ahora** | `falm.draft` y `falm.draft_pick` en la publicación, con `replica identity full`. `wr_pick` restringida a ADMIN/GESTOR: los picks de los mánagers pasan obligatoriamente por la RPC. Nueva tabla `draft_wishlist` con RLS `es_mi_equipo` (nadie ve la cola ajena). |
| **Test real** | Consultado tras aplicar: `draft_wishlist` creada con 1 política, 2 tablas de `falm` en `supabase_realtime`, `wr_pick` con `with_check = (es_admin() or es_gestor())`. `EXECUTE` para `authenticated` confirmado en `draft_pick`, `draft_pick_deshacer`, `draft_estado`, `es_gestor`, `es_admin` y `es_mi_equipo`. |
| **Nota** | Las políticas de SELECT (`sel_auth`) ya existían en `draft`, `draft_orden` y `draft_pick`, así que no se tocaron. Realtime respeta RLS y con esas basta. |

## 3. Frontend — ✅ compila, ⏳ pendiente de prueba en navegador

| | |
|---|---|
| **Antes** | No había UI de draft para el mánager. `pretemporada.component.ts:189` tenía un `picar()` que solo mostraba un aviso. |
| **Ahora** | Ruta `/draft` (`features/draft/`): catálogo de 494 activos cargado de una vez y filtrado en cliente, turno en vivo por Realtime con fallback de polling a 5 s, cola de favoritos privada con reordenación y pre-pick, aviso de turno (sonido + notificación + título parpadeante), y modo administrador para fichar en nombre del equipo en turno. En admin: enlace al tablero y botón de deshacer. |
| **Test real** | `npm run build` limpio; se genera el chunk `draft-component`. **La prueba a dos navegadores no está hecha**: requiere credenciales de dos mánagers, que no están disponibles en esta sesión. |
| **Nota** | Corregido de paso: las porterías aparecían como `?` en "Últimas elecciones" del panel de admin, porque la consulta solo leía `jugador_lfp` y un activo `DEFENSA` no tiene jugador asociado. |

## 4. Pendiente de verificar (necesita sesiones reales)

Con `npm start` y dos navegadores con dos mánagers distintos, uno de ellos el del turno:

1. **Realtime**: al fichar uno, la fila se tacha en el otro sin recargar, y el contador `Pick n/230` avanza en ambos.
2. **Turno**: el que tiene el turno ve `TE TOCA`; el otro ve "Turno de X · te toca en N" y el botón Fichar deshabilitado en todas las filas.
3. **Identidad** (el agujero que se cerró): un mánager sin rol de gestor no puede fichar por otro equipo. Debe salir `No puedes fichar por otro equipo.`
4. **Mínimo de porterías**: sobre un draft de 3 rondas, gastar los turnos de un equipo en jugadores de campo hasta que la app filtre el catálogo a porterías.
5. **Reconexión**: cortar la red 10 s con el tablero abierto; debe aparecer el banner ámbar y recuperarse sin perder picks.
6. **Móvil**: layout en una columna y aviso de turno.

Para probar hace falta crear el draft desde `/admin/pretemporada` ("Crear draft"). Ahora mismo la temporada **no tiene ningún draft** (`draft`, `draft_orden` y `draft_pick` a 0 filas), así que `/draft` muestra "No hay ningún draft activo".
