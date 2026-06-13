# Modelo de datos V2 — Bloque AUTH + RLS

> **Fecha:** 2026-06-13 · **Estado:** diseño validado · **Cierra la seguridad de todo el schema.**
> Sustituye el login por nombre + permisos hardcodeados del frontend por Supabase Auth
> (email real) + roles en BD + Row Level Security.

## Decisiones (validadas)

1. **Login con email real** vía Supabase Auth (recuperación de contraseña, verificación, JWT estándar).
2. **Roles en tabla** `falm.usuario_perfil(usuario_id, rol)` + funciones helper que consultan las políticas RLS. 3 roles: `USUARIO`, `GESTOR`, `ADMIN`.
3. **RLS activado en todas las tablas.** El modelo es "liga de información compartida": cualquier usuario autenticado **lee** casi todo (plantillas, clasificación, jornadas, puntuaciones, premios…); la **escritura** está restringida por dueño/rol.
4. **Las Edge Functions usan `service_role`** → **saltan RLS**. Toda la lógica transaccional (procesar fichajes, scoring, calcular premios, mover plantillas) corre ahí; las políticas RLS protegen el acceso directo desde el cliente (`supabase-js`).

## Nuevos objetos

- Enum `rol`: USUARIO / GESTOR / ADMIN.
- Tabla `usuario_perfil(usuario_id PK→auth.users, rol, nombre)`.
- FK `equipo_falm.usuario_id → auth.users(id)` (antes quedó sin FK).
- Funciones `security definer`: `falm.es_admin()`, `falm.es_gestor()`, `falm.es_mi_equipo(uuid)` (bypassan RLS al leer `usuario_perfil`/`equipo_falm`, evitando recursión).

## Matriz de acceso

| Grupo de tablas | SELECT | Escritura |
|---|---|---|
| temporada, competicion, jornada_falm, jornada_lfp, jornada_lfp_bloqueo, mapeo_jornada, equipo_lfp, enfrentamiento, puntuacion, plantilla, premio | autenticado | **ADMIN** |
| jugador_lfp, activo | autenticado | **GESTOR** (incluye admin) |
| equipo_falm | autenticado | **dueño** (update) / admin |
| alineacion, alineacion_activo | autenticado | **dueño** del equipo / admin |
| peticion_fichaje, peticion_fichaje_opcion, fichaje_extra | autenticado | **dueño** / admin |
| oferta_intercambio, oferta_activo | autenticado | **oferente** (crear/cancelar), **receptor** (responder) / admin |
| usuario_perfil | self + admin | **ADMIN** |

> "Dueño" = el equipo cuyo `usuario_id = auth.uid()`. Los plazos (martes 23:59, ventana de alineación) **no** se imponen en RLS sino en la capa de aplicación/Edge Function, porque dependen de fechas y reglas que cambian.

## Nota de seguridad

Tras esta migración, las 22 tablas `falm` tienen **RLS habilitado con políticas** (verificado con `get_advisors`): **0 errores**, ningún `rls_disabled`/`rls_enabled_no_policy`, y las funciones helper no generan warnings.

**Único aviso pendiente (WARN, bajo riesgo):** `auth_allow_anonymous_sign_ins` en las 22 tablas. Se debe a que el proyecto **compartido** tiene habilitado "Allow anonymous sign-ins" en la config de Auth → el rol `authenticated` incluiría usuarios anónimos. Como las políticas usan `to authenticated`, un anónimo podría leer la liga. Cierre recomendado (cuando FALM tenga proyecto propio, para no afectar a las otras apps): **deshabilitar anonymous sign-ins** en Auth, o endurecer las políticas a "miembros con perfil" (exigir fila en `usuario_perfil`). No es crítico (datos de fantasy, no PII).

(El aviso sobre las tablas de `public` de tus otras apps sigue abierto y es independiente de FALM.)
