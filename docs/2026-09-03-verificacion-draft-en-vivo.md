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

## 8. Auditoría del panel de admin (2026-09-03) — ✅

Revisión opción a opción de qué servía y qué no.

### Operaciones — estaba rota

**Tres de los cuatro botones fallaban siempre.** El componente llamaba a las
funciones sin argumentos (`ejecutar(op.rpc)`), pero `procesar_fichajes(p_jornada)`,
`heredar_alineaciones(p_jornada)` y `calcular_premios_jornada(p_jornada, …)`
exigen la jornada y no tienen default. Solo `expirar_ofertas()` funcionaba, y era
redundante: hay un cron que la ejecuta cada hora.

Además la pantalla anunciaba horarios falsos ("martes 22:59"): eso ya no existe.
Los cron reales son tres, todos activos y en verde:

| Cron | Horario | Qué hace |
|---|---|---|
| `falm-expirar-ofertas` | cada hora, minuto 0 | `expirar_ofertas()` |
| `falm-tareas-jornada` | cada hora, minuto 10 | `tareas_previas_jornada()`, que es **quien llama a `procesar_fichajes` y `heredar_alineaciones`** con márgenes de 12 h y 1 h |
| `falm-procesar-jornada` | cada hora, minuto 25 | `procesar_jornada_auto()` |

**Ahora**: la pantalla muestra ese estado real (horario, última ejecución y
resultado, vía la nueva `falm.estado_crons()`), y la ejecución manual pide la
jornada sobre la que actuar. Los botones que la necesitan están apagados hasta
elegirla, y el desplegable marca las jornadas cuyos fichajes o alineaciones ya
se procesaron.

### Jugadores — edición completa

Antes solo precio y posición. Ahora nombre, apellido, posición, club, dorsal,
precio y **`primer_equipo`**, que es la bandera que decide si un jugador aparece
en mercado y draft (`v_activo_libre` filtra por ella): sin eso no había forma de
hacer fichable a un canterano que sube. La ficha avisa de que el scraper
sobrescribe nombre, apellido, club y dorsal en la siguiente ingesta, y que
posición, precio y primer equipo se respetan.

### Equipos — nombre y presupuesto editables

Antes solo tenía un botón "Asignar dueño" que no hacía nada (mostraba un aviso
de que se habilitaría con invitaciones). Se mantiene ese aviso, pero ya se puede
renombrar un equipo y ajustar su presupuesto.

### Agujero de RLS en `equipo_falm` — cerrado

La política `wr_dueno` permitía a cada mánager hacer `UPDATE` sobre su propia
fila. Como RLS no filtra por columna y el `GRANT` es de tabla completa, eso
incluía `presupuesto`, `puntos_clasif`, `victorias` y `beneficio`: **cualquier
mánager podía falsear su clasificación desde la consola del navegador**.

Sustituida por `wr_equipo_admin` (solo `es_admin()`). No rompe nada: el único
UPDATE del frontend es el del panel de admin, y las funciones que tocan la
clasificación son `SECURITY DEFINER` y se saltan RLS.

### Simulación — fuera del menú

`montar_temporada_prueba` copia equipos y plantillas de la temporada activa para
probar el motor de puntos. Hoy no sirve: las plantillas están vacías y
`puntuacion` tiene 0 filas, así que monta diez equipos sin jugadores y da una
clasificación de ceros. Se quita del menú pero **se conserva la ruta**
(`/admin/simulacion`), porque después del draft y de la primera ingesta es la
única herramienta para validar el motor con datos reales antes de la primera
jornada oficial.

Verificado de paso que el cambio de firma de `generar_calendario_liga` no la
rompió: `montar_temporada_prueba` sigue montando sus 10 equipos, 3 jornadas y 30
alineaciones.

### Sin tocar

`recalcular_clasificacion`, `draft_consolidar`, `editar_puntos` y `activar_temporada`:
revisadas y correctas.

## 9. Precios planos y presupuesto del draft (2026-09-03) — ✅

| | |
|---|---|
| **Antes** | Jugadores entre 5 y 7M (media 5,71) y porterías a 1,50M. Presupuesto de 100M por equipo. `draft_consolidar` metía los picks en la plantilla **sin descontar nada**, así que el presupuesto quedaba intacto tras el draft y el límite no tenía ningún efecto real. |
| **Ahora** | Todos los activos a **15M** (incluidas las porterías, para que la cuenta cuadre) y presupuesto de **345M** = 23 × 15. `draft_consolidar` descuenta lo que cuesta cada pick, así que al acabar el draft cada equipo queda **a cero** y los movimientos posteriores dependen de premios y ventas. |
| **Test real** | Draft de prueba de 2 rondas: 20 picks, consolidación con 20 altas y 300M gastados, presupuesto de los 10 equipos 345 → 315, plantilla con 20 filas y draft en CONSOLIDADO. **TEST OK**, revertido al terminar. |
| **Respaldo** | `falm._backup_precios_20260903` y `falm._backup_presupuestos_20260903` guardan los valores anteriores. La forma de revertir está en la cabecera de `tools/sql/precios_15m.sql`. |
| **Nota** | Con precios planos, el mínimo de porterías hace imposible cualquier pick en drafts de menos de 2 rondas (te faltan 2 porterías y no te quedan turnos). Irrelevante para el draft real de 23, pero hay que tenerlo en cuenta al montar pruebas. |

## 10. Guardias de rol en las funciones de admin (2026-09-03) — ✅

Lo destapó la revisión automática de seguridad sobre `estado_crons`, y resultó ser
un patrón repetido: **nueve funciones administrativas eran `SECURITY DEFINER`,
con `grant execute to authenticated` y sin comprobar rol**. Cualquier mánager
podía llamarlas desde la consola del navegador:

| Función | Qué permitía |
|---|---|
| `activar_temporada` | Cambiar la temporada activa de toda la app |
| `editar_puntos` | Falsear puntuaciones, y con ellas la clasificación |
| `crear_temporada` | Crear temporadas |
| `draft_crear` | Crear un draft |
| `generar_jornadas_liga`, `generar_calendario_liga` | Regenerar jornadas y calendario (dentro de lo que permitan las protecciones) |
| `montar_temporada_prueba` | Borrar y recrear la temporada de pruebas |
| `estado_crons` | Leer los cron de toda la base, **incluido el comando**: hoy no hay secretos ahí, pero `refrescar_calendario_fd(p_token text, …)` existe y el día que se programe con el token dentro se filtraría |
| `recalcular_clasificacion` | Recalcular la temporada activa |

Todas llevan ya la misma guardia que `draft_pick`: `auth.uid()` nulo (mantenimiento
por SQL o cron) pasa; un usuario autenticado tiene que ser `es_gestor()`.
`recalcular_clasificacion` es el único caso con matiz: la app la llama al guardar
alineación en temporadas de pruebas, así que solo exige rol si la temporada es la
activa. Se eliminó además la sobrecarga `crear_temporada(text)` de un argumento,
que quedaba como camino sin guardia.

**Verificación**: las 15 funciones administrativas comprueban rol, y los dos
bloques de test anteriores (7 casos del draft y 11 de la pretemporada) siguen
pasando sin cambios.

## 11. Sin dinero y con tope por club (2026-09-03) — ✅

Esta temporada no se juega con dinero: lo que limita una plantilla es el número
de jugadores y de qué clubes son.

### Fuera el dinero

| | |
|---|---|
| **Antes** | Precios por jugador, presupuesto por equipo, `procesar_fichajes` daba el jugador "al primero que pudiera pagarlo" y descontaba del presupuesto. |
| **Ahora** | El presupuesto ya no se valida ni se descuenta (la columna sigue en la base, sin usar). `procesar_fichajes` da el jugador al primer solicitante **que tenga hueco**: menos de 23 en plantilla y cupo libre en ese club. `draft_consolidar` ya no descuenta. |
| **UI** | Fuera el precio del mercado, del tablero de draft, de la plantilla y de la petición de fichaje; fuera el presupuesto de la plantilla, de fichajes y del panel de equipos; fuera el precio del editor de jugadores. También las ordenaciones internas por precio, que con todos a 15M no ordenaban nada. |
| **Se queda** | Los premios en euros y el beneficio por equipo: eso es dinero real que os repartís, no el presupuesto ficticio de fichajes. |

### Tope de jugadores por club

Regla que existía en la liga y **no estaba implementada ni recogida en las specs**:
se perdió en la reescritura V2. Nada impedía llevarse 5 del Madrid en el draft.

- **2 jugadores** como máximo del Real Madrid, Barcelona o Atlético.
- **3** de cualquier otro club.
- La **portería** de un club cuenta como uno de los suyos.

Modelado como `equipo_lfp.limite_plantilla` (3 por defecto, 2 en los tres
grandes), no como una lista de excepciones en el código: se ajusta con un
`update`. La comprobación vive en `draft_pick` y en `procesar_fichajes`, más
`falm.club_de_activo()` que resuelve el club tanto de un jugador como de una
portería.

Comprobación de viabilidad: 3 clubes × 2 + 17 × 3 = 57 plazas posibles para una
plantilla de 23.

**En el tablero**: la columna que antes era Precio ahora es **Cupo**, y muestra
`n/máximo` de ese club, en rojo cuando está lleno. El botón Fichar se apaga y el
pre-pick salta a los jugadores cuyo club esté completo, así que el tope se ve
antes de intentar el pick, no como un error después.

**Test real**: sobre un draft de prueba, entran 2 del Real Madrid y el tercero se
rechaza; entran 3 de un club normal y el cuarto se rechaza. **TEST OK**,
revertido al terminar.

## 12. Intercambios y limpieza del SQL (2026-09-03) — ✅

### Los intercambios no se ejecutaban

Al ir a añadir el cupo por club apareció algo más gordo: **aceptar una oferta solo
cambiaba el estado a ACEPTADA**. Los jugadores no se movían. No hay trigger, y la
tabla `plantilla` solo la escribe el admin (`wr_admin`), así que desde el cliente
era imposible que el traspaso ocurriera. La funcionalidad estaba a medias desde
la V2.

Y la política `wr_oferente` daba `ALL` al oferente **y** al receptor: cualquiera
de los dos podía aceptar, incluido quien hizo la oferta.

**Ahora** hay `falm.oferta_responder(p_oferta, p_estado)`, que en una sola
transacción:

- comprueba quién puede qué: el receptor acepta o rechaza, el oferente cancela;
- rechaza ofertas ya respondidas o caducadas;
- verifica que los jugadores sigan en las plantillas de origen;
- comprueba por los dos lados el tope de 23 y el **cupo por club**;
- y hace el traspaso: baja en el origen, alta en el destino, conservando histórico.

La política pasa a `insert` del oferente, `update` solo admin y `delete` del
oferente: el estado ya solo se cambia por la función.

**Test real**: A con 3 del Alavés y 1 del Betis, B con 1 del Alavés. B ofrece su
alavesista pidiendo el bético → rechazado por cupo. Cambiando la petición a un
alavesista → aceptado, los dos jugadores cambian de plantilla, y una segunda
respuesta sobre la misma oferta se rechaza. **TEST OK**.

### Limpieza de `tools/sql`

Tres ficheros contradecían a la base, y ejecutarlos habría revertido protecciones:

| Fichero | Qué revertía |
|---|---|
| `draft_pick_v2.sql` | `draft_pick` sin el tope por club |
| `admin_operaciones.sql` | `estado_crons` sin guardia de rol (fuga de los comandos de cron) |
| `liga_falm_calendario.sql` | `generar_liga_falm` sin la revocación de permisos |

Los tres alineados con lo aplicado, más `intercambios.sql` que faltaba y un
`README.md` con las reglas: los ficheros reflejan lo aplicado, son idempotentes,
los `*_test.sql` se revierten solos, y la verdad última son las migraciones de
Supabase (con el `pg_get_functiondef` para comprobarlo).
