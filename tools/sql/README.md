# tools/sql

Scripts de la base de datos (Supabase, proyecto `rgpzrbwpyaewughahpgo`, schema `falm`).

## Reglas de la casa

1. **Todo lo que hay aquí refleja lo que está aplicado.** Si cambias una función
   en la base, actualiza su fichero en el mismo commit. Un fichero desfasado es
   peor que no tenerlo: alguien lo ejecuta y revierte protecciones sin enterarse.
2. **Todos son idempotentes**: `create or replace`, `add column if not exists`,
   `drop policy if exists`. Se pueden volver a ejecutar sin romper nada.
3. **Los `*_test.sql` se revierten solos.** Terminan lanzando una excepción a
   propósito (`TEST OK: …`), de modo que Postgres deshace todo lo que tocaron.
   Pasan si el error final empieza por `TEST OK`; fallan si empieza por `FALLO`.
4. **Las funciones administrativas llevan guardia de rol** (`falm.puede_gestionar()`),
   y las internas no tienen `execute` para `public`. En Postgres toda función
   nace con `EXECUTE` para `PUBLIC`, así que quitárselo solo a `authenticated`
   no cierra nada.

## Reglas de juego de la temporada 2026-27

- Plantilla de **23 jugadores**. **No se juega con dinero**: el presupuesto no se
  valida ni se descuenta (la columna sigue en la base, sin usar).
- **Mínimo 2 porterías** por equipo, dentro de esos 23.
- **Tope por club**: 2 del Real Madrid, Barcelona o Atlético; 3 de cualquier otro.
  La portería de un club cuenta como uno de los suyos. Vive en
  `equipo_lfp.limite_plantilla`, así que se ajusta con un `update`.
- Los **premios en euros** sí siguen: eso es dinero real, no el presupuesto de fichajes.

## Qué hay aquí

### Reglas de juego y motor

| Fichero | Contiene |
|---|---|
| `draft_pick_v2.sql` | `draft_pick`, `draft_pick_deshacer`, `draft_consolidar` |
| `draft_pick_correcciones.sql` | `draft_pick_corregir` y `draft_pick_anular`: arreglar un pick suelto |
| `draft_orden_manual.sql` | `draft_crear`, `draft_reordenar`, `draft_generar_orden`, `draft_validar_orden` |
| `draft_en_vivo.sql` | Tabla `draft_wishlist`, RLS del tablero y publicación de Realtime |
| `limite_por_club.sql` | `equipo_lfp.limite_plantilla`, `club_de_activo`, vista `v_activo_libre` |
| `intercambios.sql` | `oferta_responder` (traspaso real) y políticas de `oferta_intercambio` |
| `pretemporada_protecciones.sql` | Protecciones de jornadas y calendario, y edición puntual |
| `calendario_liga_lectura.sql` | `calendario_liga`, lectura para el editor del panel |
| `bloqueo_y_congelacion.sql` | `guardar_alineacion`, bloqueos y congelación por jornada |

### Operación y datos

| Fichero | Contiene |
|---|---|
| `carga_inicial_2026-27.sql` | Carga inicial del catálogo |
| `calendario_lfp.sql`, `refrescar_catalogo_ff.sql` | Ingesta de calendario y catálogo |
| `ingestar_jornada_ff_marcadores.sql` | Ingesta de puntuaciones de una jornada |
| `procesar_jornada_auto.sql`, `tareas_previas_jornada.sql` | Lo que ejecutan los cron |
| `liga_falm_calendario.sql` | `generar_liga_falm` (mantenimiento; revocada a los usuarios) |
| `admin_operaciones.sql` | `estado_crons` y el cierre de escritura en `equipo_falm` |
| `funciones_admin_cerradas.sql` | `puede_gestionar` y guardias de las funciones de admin |
| `revocar_funciones_internas.sql` | Revocación de funciones internas y RLS de las tablas de respaldo |
| `precios_15m.sql` | Precios planos y presupuesto (histórico; el dinero ya no se usa) |

### Pruebas

| Fichero | Cubre |
|---|---|
| `draft_pick_v2_test.sql` | 7 casos del motor de picks |
| `draft_pick_correcciones_test.sql` | 8 casos de corregir y anular un pick |
| `pretemporada_protecciones_test.sql` | 11 casos de protecciones y edición del calendario |
| `draft_orden_manual_test.sql` | 4 casos del orden manual del sorteo |

## Dónde está la verdad

Lo aplicado está versionado en las migraciones de Supabase
(`supabase_migrations.schema_migrations`). Estos ficheros son la copia legible y
ejecutable de eso mismo. Si alguna vez discrepan, manda la base: compruébalo con
`pg_get_functiondef('falm.<funcion>(<args>)'::regprocedure)` y actualiza el fichero.
