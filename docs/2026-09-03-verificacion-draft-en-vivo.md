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

## 5. Reseteo previo al draft y draft de prueba (2026-09-03) — ✅

**Puesto a cero** (eran datos de la simulación de pretemporada):

- `equipo_falm`: `puntos_clasif`, `puntos_totales`, `puntos_contra`, `victorias`,
  `victorias_min`, `empates`, `derrotas_min`, `derrotas` y `beneficio` en los 10 equipos.
  Presupuesto en 100 en todos.
- `enfrentamiento`: `puntos_local` / `puntos_visitante` a null (ya estaban).

**Ya estaba vacío**: `puntuacion`, `plantilla`, `alineacion`, `alineacion_activo`,
`premio`, `peticion_fichaje`, `oferta_intercambio`, `fichaje_extra`.

**NO se tocó**, porque son datos reales del scraper y no de prueba:

- `partido_lfp`: 380 partidos, de los que 30 tienen resultado — jornadas 1, 2 y 3
  de LaLiga (15 al 31 de agosto de 2026), estado FINISHED.
- `enfrentamiento`: los 180 cruces del calendario FALM.
- `jornada_lfp` / `jornada_falm`: el calendario. Todas las jornadas LFP en PENDIENTE.

**Draft de prueba creado**: `Draft de prueba`, id `e1f48b7a-4267-4e27-b084-ad64cffadca6`,
23 rondas, 230 picks, estado CREADO, primer turno PUSSYFISH. Serpiente verificada
(ronda 1 en un orden, ronda 2 invertida). Se probó un pick real y su deshacer sobre
este draft: ambos correctos, y quedó a 0 picks.

Para cambiarlo por el draft definitivo: `update falm.draft set estado='CANCELADO'
where nombre='Draft de prueba';` y luego "Crear draft" en `/admin/pretemporada`
(`draft_crear` rechaza crear uno si ya hay otro sin consolidar).

## 6. Orden del draft elegido a mano (2026-09-03) — ✅

El sorteo se hace físicamente en directo, así que el admin necesita meter el
orden en que salen los equipos en vez de que lo sortee la BD.

| | |
|---|---|
| **Antes** | `draft_crear(p_temporada, p_nombre, p_rondas)` sorteaba siempre con `array_agg(id order by random())`. No había forma de imponer un orden. |
| **Ahora** | `draft_crear` acepta un cuarto parámetro opcional `p_orden uuid[]`: si es null sortea al azar (comportamiento anterior intacto), y si viene lo valida y lo usa. Nuevas `draft_validar_orden` (permutación exacta de los equipos de la temporada), `draft_generar_orden` (serpiente, compartida) y `draft_reordenar(p_draft, p_orden)` para corregir el orden mientras no haya ningún pick. En el admin, componente `admin-draft-sorteo`: se pulsan los equipos en el orden en que se cantan (un clic por equipo), con "quitar el último" y "empezar de nuevo". |
| **Test real** | `tools/sql/draft_orden_manual_test.sql`, 4 casos: orden incompleto rechazado, orden con repetidos rechazado, orden válido genera ronda 1 en ese orden y ronda 2 invertida con el total de turnos correcto, y reordenar bloqueado en cuanto hay un pick. Resultado: **TEST OK: los 4 casos pasaron**, revertido al terminar. |
| **Nota** | Se sustituyó la firma de 3 argumentos de `draft_crear` por la de 4 (con default) en vez de añadir una sobrecarga, para que las llamadas de 3 argumentos sigan resolviendo a la versión nueva. |

## 7. Protecciones de la pretemporada (2026-09-03) — ✅

El panel tenía botones que, pulsados por segunda vez con la liga en marcha,
hacían daño de verdad. Diagnóstico y arreglo:

| Función | Antes | Ahora |
|---|---|---|
| `generar_calendario_liga` | **Destructiva sin aviso**: `delete` de todos los enfrentamientos de la liga y regeneración con `order by random()`. Se llevaba los `puntos_local`/`puntos_visitante` de las jornadas ya jugadas. | Con calendario existente exige `p_forzar`. Con resultados o alineaciones se niega **siempre**, incluso forzando. |
| `generar_jornadas_liga` | Con el mismo rango era idempotente (`on conflict do nothing` + índices únicos). Con otro rango añadía jornadas sin borrar las viejas → temporada incoherente. | Mismo rango: devuelve `ya_estaba` sin tocar nada. Otro rango: exige `p_forzar` y entonces rehace limpio (borra y regenera) en vez de mezclar. Bloqueada si la liga ya empezó. |
| `crear_temporada` | Creaba temporadas duplicadas con el mismo nombre. | Rechaza nombres repetidos (sin distinguir mayúsculas). |
| `activar_temporada` | `update set activa = (id = p_temporada)` en una sentencia, con el índice único parcial `uq_temporada_activa` ya existente: **fallo latente**, porque según el orden en que Postgres tocara las filas podía haber dos activas a la vez y violar el índice. Con una sola temporada nunca dio la cara. | Dos sentencias: primero desactiva, luego activa. |
| `montar_temporada_prueba` | — | Revisada: segura. Solo borra la temporada llamada `Pruebas 26-27`, nunca la real. |
| `recalcular_clasificacion` | — | Revisada: segura, recalcula datos derivados y es idempotente. |
| `draft_consolidar` | — | Revisada: segura, solo inserta y exige estado COMPLETADO. |

**Editar sin sobrescribir.** Con la liga en marcha lo que hace falta no es
regenerar, es corregir una cosa concreta. Nuevas funciones:

- `enfrentamiento_editar(p_enfrentamiento, p_local, p_visitante)`: cambia los
  equipos de un cruce (invertir la localía = llamarla al revés). Rechaza la
  jornada con resultados o alineaciones, equipos de otra temporada, equipo
  contra sí mismo y equipos que ya juegan en esa jornada.
- `jornada_editar(p_jornada_falm, p_lfp_numero, p_fecha_cierre)`: mueve una
  jornada FALM a otra jornada de LaLiga y/o cambia su cierre. Rechaza remapear
  una jornada con alineaciones o apuntar a una LFP que no existe.
- `estado_pretemporada(p_temporada)` y `calendario_liga(p_temporada)`: lectura
  para que el panel diga qué hay hecho y permita editarlo.

**En el panel**: la sección de jornadas muestra chips con el estado real
(`32 jornadas · LFP 5-36`, `180 enfrentamientos`, y en ámbar los jugados), los
botones pasan a "Regenerar" en rojo y exigen marcar *"entiendo que se borra el
calendario actual"*, y con la liga empezada salen deshabilitados con la
explicación. Debajo, el editor `admin-calendario-editor`: eliges jornada, ves
sus cinco cruces y puedes invertir localía de un clic, cambiar equipos con dos
desplegables o remapear la jornada. Las jugadas salen en solo lectura.

**Test real**: `tools/sql/pretemporada_protecciones_test.sql`, 11 casos —
estado correcto, mismo rango idempotente, rango distinto sin forzar rechazado,
calendario sin forzar rechazado, temporada duplicada rechazada, calendario con
resultados rechazado incluso forzando, edición de cruce jugado rechazada,
inversión de localía válida aplicada, equipo duplicado en jornada rechazado,
remapeo válido aplicado y remapeo a LFP inexistente rechazado. Resultado:
**TEST OK: los 11 casos pasaron**, revertido al terminar.
