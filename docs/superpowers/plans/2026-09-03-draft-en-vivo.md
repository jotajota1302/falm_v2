# Draft en vivo — plan de implementación

> **Para ejecutores:** implementar tarea a tarea. Los pasos usan checkbox (`- [ ]`) para seguimiento.

**Goal:** Que los 10 mánagers de FALM hagan el draft desde la web, cada uno desde su dispositivo, viendo en tiempo real los fichajes de los demás.

**Architecture:** El motor de draft ya existe en Postgres (`draft_crear`, `draft_pick`, `draft_estado`, `draft_consolidar`). Se endurece `draft_pick`, se añade wishlist y deshacer, se habilita Supabase Realtime sobre `draft` y `draft_pick`, y se construye la pantalla `/draft` en Angular que se suscribe por WebSocket.

**Tech Stack:** Angular 18 standalone + signals, `@supabase/supabase-js` v2, Postgres (Supabase, proyecto `rgpzrbwpyaewughahpgo`, schema `falm`).

**Spec:** `docs/superpowers/specs/2026-09-03-draft-en-vivo-design.md`

## Restricciones globales

- Schema de BD: **`falm`** (el cliente JS ya apunta ahí; `client.from('draft')` resuelve `falm.draft`).
- Toda función nueva o modificada: `security definer` + `set search_path to 'public', 'falm'`, como las existentes.
- Rondas: **23 por equipo**, 10 equipos, **230 picks**.
- Mínimo **2 porterías** (activos `tipo='DEFENSA'`) por equipo, dentro de los 23.
- Catálogo: **`v_activo_libre`** tal cual (494 filas). No se toca la vista: ya excluye porteros individuales y no-primer-equipo.
- Angular: componentes `standalone`, estado con `signal`/`computed`, estilos con las variables CSS del proyecto (`--surface-2`, `--ink`, `--border`, `--muted`).
- Idioma de toda la UI y los mensajes de error: castellano.
- No hay framework de tests en el repo. El ciclo de verificación es: bloque SQL de aserciones para la BD (ejecutable y repetible), y `npm run build` + prueba manual a dos navegadores para el frontend.

---

### Tarea 1: Migración SQL — wishlist, Realtime y RLS

**Files:**
- Create: `tools/sql/draft_en_vivo.sql` (migración idempotente, se aplica con el MCP de Supabase)

**Interfaces:**
- Produce: tabla `falm.draft_wishlist(draft_id, equipo_falm_id, activo_id, prioridad, nota, created_at)`; políticas RLS de lectura en `draft`, `draft_orden`, `draft_pick`; publicación Realtime activa en `draft` y `draft_pick`.

- [ ] **Paso 1: Comprobar qué políticas RLS existen ya**

```sql
select tablename, policyname, cmd, roles
from pg_policies where schemaname='falm' and tablename in ('draft','draft_orden','draft_pick','draft_wishlist')
order by tablename, policyname;
```

Anotar el resultado: si ya hay `select` para `authenticated` en alguna, no duplicarla.

- [ ] **Paso 2: Escribir la migración**

```sql
-- tools/sql/draft_en_vivo.sql
-- Draft en vivo: wishlist privada por equipo, lectura del tablero y Realtime.

create table if not exists falm.draft_wishlist (
  draft_id       uuid not null references falm.draft(id) on delete cascade,
  equipo_falm_id uuid not null references falm.equipo_falm(id) on delete cascade,
  activo_id      uuid not null references falm.activo(id) on delete cascade,
  prioridad      int  not null,
  nota           text,
  created_at     timestamptz not null default now(),
  primary key (draft_id, equipo_falm_id, activo_id),
  constraint draft_wishlist_prioridad_unica
    unique (draft_id, equipo_falm_id, prioridad) deferrable initially deferred
);

alter table falm.draft_wishlist enable row level security;

-- Cada equipo solo ve y toca su propia cola.
drop policy if exists wishlist_propia on falm.draft_wishlist;
create policy wishlist_propia on falm.draft_wishlist for all to authenticated
  using (exists (select 1 from falm.equipo_falm e
                  where e.id = draft_wishlist.equipo_falm_id and e.usuario_id = auth.uid()))
  with check (exists (select 1 from falm.equipo_falm e
                       where e.id = draft_wishlist.equipo_falm_id and e.usuario_id = auth.uid()));

-- Lectura del tablero para cualquier usuario autenticado (Realtime respeta RLS:
-- sin SELECT no llegan eventos).
drop policy if exists draft_lectura on falm.draft;
create policy draft_lectura on falm.draft for select to authenticated using (true);

drop policy if exists draft_orden_lectura on falm.draft_orden;
create policy draft_orden_lectura on falm.draft_orden for select to authenticated using (true);

drop policy if exists draft_pick_lectura on falm.draft_pick;
create policy draft_pick_lectura on falm.draft_pick for select to authenticated using (true);

-- Realtime.
alter table falm.draft_pick replica identity full;
alter table falm.draft      replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname='supabase_realtime' and schemaname='falm' and tablename='draft_pick') then
    alter publication supabase_realtime add table falm.draft_pick;
  end if;
  if not exists (select 1 from pg_publication_tables
                  where pubname='supabase_realtime' and schemaname='falm' and tablename='draft') then
    alter publication supabase_realtime add table falm.draft;
  end if;
end $$;
```

- [ ] **Paso 3: Aplicar la migración**

Con `mcp__plugin_supabase_supabase__apply_migration`, nombre `draft_en_vivo`.

- [ ] **Paso 4: Verificar que quedó aplicada**

```sql
select
  (select count(*) from information_schema.tables
    where table_schema='falm' and table_name='draft_wishlist') as tabla_wishlist,
  (select count(*) from pg_policies where schemaname='falm' and tablename='draft_wishlist') as politicas_wishlist,
  (select count(*) from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='falm') as tablas_realtime;
```

Esperado: `tabla_wishlist = 1`, `politicas_wishlist >= 1`, `tablas_realtime = 2`.

- [ ] **Paso 5: Commit**

```bash
git add tools/sql/draft_en_vivo.sql
git commit -m "feat(draft): wishlist privada, RLS de lectura del tablero y Realtime"
```

---

### Tarea 2: `draft_pick` v2 y `draft_pick_deshacer`

**Files:**
- Create: `tools/sql/draft_pick_v2.sql`

**Interfaces:**
- Consume: `falm.draft_estado(p_draft uuid) returns jsonb` (existente), `falm.v_activo_libre`.
- Produce: `falm.draft_pick(p_draft uuid, p_activo uuid, p_equipo uuid) returns jsonb` (reescrita, misma firma) y `falm.draft_pick_deshacer(p_draft uuid) returns jsonb`.

- [ ] **Paso 1: Escribir el bloque de aserciones ANTES que la función**

Guardar como `tools/sql/draft_pick_v2_test.sql`. Crea un draft de prueba, ejecuta los casos límite y revierte con `rollback` al final, de forma que se pueda correr las veces que haga falta sin ensuciar nada.

```sql
-- tools/sql/draft_pick_v2_test.sql — verificación de draft_pick v2. Termina en ROLLBACK.
begin;

do $$
declare
  v_temp uuid; v_draft uuid; v_eq1 uuid; v_eq2 uuid;
  v_porteria uuid; v_porteria2 uuid; v_campo uuid; v_portero_indiv uuid;
  v_turno_eq uuid; v_msg text;
begin
  select id into v_temp from falm.temporada where activa limit 1;
  select falm.draft_crear(v_temp, 'TEST draft', 3) into v_draft;
  if v_draft is null then
    select id into v_draft from falm.draft where temporada_id=v_temp order by created_at desc limit 1;
  end if;

  select equipo_falm_id into v_turno_eq from falm.draft_orden
   where draft_id=v_draft and not completado order by orden_global limit 1;
  select id into v_eq1 from falm.equipo_falm where id=v_turno_eq;
  select id into v_eq2 from falm.equipo_falm where temporada_id=v_temp and id<>v_eq1 limit 1;

  select activo_id into v_porteria  from falm.v_activo_libre where tipo='DEFENSA' limit 1;
  select activo_id into v_porteria2 from falm.v_activo_libre where tipo='DEFENSA' and activo_id<>v_porteria limit 1;
  select activo_id into v_campo     from falm.v_activo_libre where tipo='JUGADOR' limit 1;
  select a.id into v_portero_indiv from falm.activo a
    join falm.jugador_lfp j on j.id=a.jugador_lfp_id
   where j.posicion='PORTERO' limit 1;

  -- CASO 1: pick fuera de turno -> debe fallar
  begin
    perform falm.draft_pick(v_draft, v_campo, v_eq2);
    raise exception 'FALLO C1: aceptó un pick fuera de turno';
  exception when others then
    if position('turno' in lower(sqlerrm))=0 and position('otro equipo' in lower(sqlerrm))=0 then
      raise exception 'FALLO C1: error inesperado: %', sqlerrm;
    end if;
  end;

  -- CASO 2: activo no fichable (portero individual) -> debe fallar
  begin
    perform falm.draft_pick(v_draft, v_portero_indiv, v_eq1);
    raise exception 'FALLO C2: aceptó un portero individual';
  exception when others then
    if position('disponible' in lower(sqlerrm))=0 then
      raise exception 'FALLO C2: error inesperado: %', sqlerrm;
    end if;
  end;

  -- CASO 3: pick válido en turno -> debe pasar
  perform falm.draft_pick(v_draft, v_campo, v_eq1);
  if not exists (select 1 from falm.draft_pick where draft_id=v_draft and activo_id=v_campo) then
    raise exception 'FALLO C3: el pick válido no se guardó';
  end if;

  -- CASO 4: activo ya elegido -> debe fallar
  select equipo_falm_id into v_turno_eq from falm.draft_orden
   where draft_id=v_draft and not completado order by orden_global limit 1;
  begin
    perform falm.draft_pick(v_draft, v_campo, v_turno_eq);
    raise exception 'FALLO C4: aceptó un activo ya elegido';
  exception when others then
    if position('elegido' in lower(sqlerrm))=0 and position('disponible' in lower(sqlerrm))=0 then
      raise exception 'FALLO C4: error inesperado: %', sqlerrm;
    end if;
  end;

  -- CASO 5: deshacer devuelve el turno
  perform falm.draft_pick_deshacer(v_draft);
  if exists (select 1 from falm.draft_pick where draft_id=v_draft and activo_id=v_campo) then
    raise exception 'FALLO C5: el pick no se deshizo';
  end if;
  select equipo_falm_id into v_turno_eq from falm.draft_orden
   where draft_id=v_draft and not completado order by orden_global limit 1;
  if v_turno_eq <> v_eq1 then
    raise exception 'FALLO C5: el turno no volvió al equipo original';
  end if;

  raise notice 'OK: todos los casos pasaron';
end $$;

rollback;
```

Nota sobre el CASO 1 y el mínimo de porterías: la validación de identidad (`auth.uid()`) no se puede ejercitar desde el MCP porque ejecuta como `postgres` (sin `auth.uid()`), así que **se verifica desde el navegador** en la Tarea 7, no aquí. Los picks del bloque pasan la comprobación de identidad porque para un rol sin `auth.uid()` la función deja pasar si el llamante es superusuario — ver la cláusula de la función en el Paso 3.

- [ ] **Paso 2: Ejecutar el bloque y verlo fallar**

Ejecutar `tools/sql/draft_pick_v2_test.sql` con el MCP.
Esperado: falla en el CASO 2 con "FALLO C2: aceptó un portero individual" (la función actual no valida `v_activo_libre`) o en el CASO 5 (`draft_pick_deshacer` no existe todavía).

- [ ] **Paso 3: Escribir las funciones**

```sql
-- tools/sql/draft_pick_v2.sql
create or replace function falm.draft_pick(p_draft uuid, p_activo uuid, p_equipo uuid)
returns jsonb language plpgsql security definer set search_path to 'public', 'falm' as $function$
declare
  v_turno falm.draft_orden;
  v_estado falm.draft_estado;
  v_uid uuid := auth.uid();
  v_dueno uuid;
  v_rol text;
  v_es_porteria boolean;
  v_porterias int;
  v_restantes int;
  v_faltan int;
begin
  select estado into v_estado from falm.draft where id = p_draft;
  if v_estado is null then raise exception 'Draft no encontrado'; end if;
  if v_estado not in ('CREADO','EN_CURSO') then raise exception 'El draft no está en curso'; end if;

  -- Identidad: solo tu equipo, salvo ADMIN/GESTOR ("fichar en nombre de").
  -- v_uid nulo = ejecución desde SQL de mantenimiento (MCP/psql), se permite.
  if v_uid is not null then
    select usuario_id into v_dueno from falm.equipo_falm where id = p_equipo;
    select rol::text into v_rol from falm.usuario_perfil where usuario_id = v_uid;
    if v_dueno is distinct from v_uid and coalesce(v_rol,'USUARIO') not in ('ADMIN','GESTOR') then
      raise exception 'No puedes fichar en nombre de otro equipo';
    end if;
  end if;

  -- Turno bloqueado: dos peticiones simultáneas se serializan aquí.
  select * into v_turno from falm.draft_orden
   where draft_id = p_draft and not completado
   order by orden_global limit 1 for update;
  if v_turno.id is null then raise exception 'No quedan turnos'; end if;
  if v_turno.equipo_falm_id <> p_equipo then raise exception 'No es el turno de ese equipo'; end if;

  if exists (select 1 from falm.draft_pick where draft_id = p_draft and activo_id = p_activo) then
    raise exception 'Ese activo ya fue elegido en este draft';
  end if;
  if not exists (select 1 from falm.v_activo_libre where activo_id = p_activo) then
    raise exception 'Ese activo no está disponible';
  end if;

  -- Mínimo de 2 porterías dentro de los 23 turnos.
  select (a.tipo = 'DEFENSA') into v_es_porteria from falm.activo a where a.id = p_activo;
  select count(*) into v_porterias
    from falm.draft_pick dp join falm.activo a on a.id = dp.activo_id
   where dp.draft_id = p_draft and dp.equipo_falm_id = p_equipo and a.tipo = 'DEFENSA';
  select count(*) into v_restantes
    from falm.draft_orden
   where draft_id = p_draft and equipo_falm_id = p_equipo and not completado;
  v_faltan := 2 - v_porterias;
  if v_faltan > 0 and v_restantes <= v_faltan and not v_es_porteria then
    raise exception 'Te quedan % turnos y te faltan % porterías: solo puedes elegir portería',
      v_restantes, v_faltan;
  end if;

  insert into falm.draft_pick(draft_id, activo_id, equipo_falm_id, ronda, orden_seleccion)
    values (p_draft, p_activo, p_equipo, v_turno.ronda, v_turno.orden_global);
  update falm.draft_orden set completado = true where id = v_turno.id;
  update falm.draft set estado = 'EN_CURSO' where id = p_draft and estado = 'CREADO';
  if not exists (select 1 from falm.draft_orden where draft_id = p_draft and not completado) then
    update falm.draft set estado = 'COMPLETADO' where id = p_draft;
  end if;
  return falm.draft_estado(p_draft);
end $function$;

create or replace function falm.draft_pick_deshacer(p_draft uuid)
returns jsonb language plpgsql security definer set search_path to 'public', 'falm' as $function$
declare
  v_uid uuid := auth.uid();
  v_rol text;
  v_estado falm.draft_estado;
  v_pick falm.draft_pick;
begin
  if v_uid is not null then
    select rol::text into v_rol from falm.usuario_perfil where usuario_id = v_uid;
    if coalesce(v_rol,'USUARIO') not in ('ADMIN','GESTOR') then
      raise exception 'Solo un administrador puede deshacer un pick';
    end if;
  end if;

  select estado into v_estado from falm.draft where id = p_draft;
  if v_estado is null then raise exception 'Draft no encontrado'; end if;
  if v_estado = 'CONSOLIDADO' then raise exception 'El draft ya está consolidado'; end if;

  select * into v_pick from falm.draft_pick
   where draft_id = p_draft order by orden_seleccion desc limit 1;
  if v_pick.id is null then raise exception 'No hay picks que deshacer'; end if;

  delete from falm.draft_pick where id = v_pick.id;
  update falm.draft_orden set completado = false
   where draft_id = p_draft and orden_global = v_pick.orden_seleccion;
  update falm.draft set estado = 'EN_CURSO' where id = p_draft and estado = 'COMPLETADO';
  return falm.draft_estado(p_draft);
end $function$;

grant execute on function falm.draft_pick(uuid, uuid, uuid) to authenticated;
grant execute on function falm.draft_pick_deshacer(uuid) to authenticated;
```

- [ ] **Paso 4: Aplicar y volver a ejecutar el bloque de aserciones**

Esperado: `NOTICE: OK: todos los casos pasaron`, y `rollback` al final deja la BD intacta.

- [ ] **Paso 5: Comprobar que el draft de prueba no quedó**

```sql
select count(*) as drafts_test from falm.draft where nombre = 'TEST draft';
```

Esperado: `0`.

- [ ] **Paso 6: Commit**

```bash
git add tools/sql/draft_pick_v2.sql tools/sql/draft_pick_v2_test.sql
git commit -m "feat(draft): draft_pick valida identidad, disponibilidad y minimo de porterias; anade deshacer"
```

---

### Tarea 3: `draft.service.ts` — datos, estado y Realtime

**Files:**
- Create: `frontend/src/app/features/draft/draft.service.ts`

**Interfaces:**
- Consume: `SupabaseService.client`, `FalmService.miEquipo()`, `SeasonService.ensure()`.
- Produce:
  - Tipos `DraftEstado`, `DraftTurno`, `DraftOrdenFila`, `DraftPickFila`, `ItemCola`.
  - Signals `draft`, `orden`, `picks`, `catalogo`, `cola`, `miEquipoId`, `conectado`, `cargando`, `error`.
  - Computed `turno()`, `esMiTurno()`, `tomadoPor()`, `misPicks()`, `misPorterias()`, `misTurnosRestantes()`, `debeElegirPorteria()`, `picksHastaMiTurno()`, `equipoPorId()`.
  - Métodos `cargar()`, `suscribir()`, `desuscribir()`, `fichar(activoId, equipoId?)`, `refrescarPicks()`, `agregarCola(activoId)`, `quitarCola(activoId)`, `moverCola(activoId, delta)`.

- [ ] **Paso 1: Crear el servicio**

```ts
import { Injectable, computed, signal } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';
import { ActivoLibre, FalmService } from '../../core/falm.service';
import { SupabaseService } from '../../core/supabase.service';

export interface DraftTurno {
  ronda: number; posicion_en_ronda: number; orden_global: number;
  equipo_falm_id: string; equipo: string;
}
export interface DraftEstado {
  id: string; nombre: string; estado: string; total_rondas: number;
  picks_hechos: number; picks_totales: number; turno: DraftTurno | null;
}
export interface DraftOrdenFila {
  equipo_falm_id: string; ronda: number; posicion_en_ronda: number;
  orden_global: number; completado: boolean;
}
export interface DraftPickFila {
  id: string; activo_id: string; equipo_falm_id: string;
  ronda: number; orden_seleccion: number;
}
export interface ItemCola { activo_id: string; prioridad: number }

const MIN_PORTERIAS = 2;

/** Estado del draft en vivo: carga inicial, Realtime y acciones del mánager. */
@Injectable()
export class DraftService {
  readonly draft = signal<DraftEstado | null>(null);
  readonly orden = signal<DraftOrdenFila[]>([]);
  readonly picks = signal<DraftPickFila[]>([]);
  readonly catalogo = signal<ActivoLibre[]>([]);
  readonly cola = signal<ItemCola[]>([]);
  readonly equipos = signal<{ id: string; nombre: string }[]>([]);
  readonly miEquipoId = signal<string | null>(null);
  readonly conectado = signal(true);
  readonly cargando = signal(true);
  readonly error = signal('');

  private canal: RealtimeChannel | null = null;
  private sondeo: any = null;

  constructor(private sb: SupabaseService, private falm: FalmService) {}

  /** activo_id -> equipo que lo fichó. */
  readonly tomadoPor = computed(() => {
    const m = new Map<string, string>();
    for (const p of this.picks()) m.set(p.activo_id, p.equipo_falm_id);
    return m;
  });

  readonly equipoPorId = computed(() => {
    const m = new Map<string, string>();
    for (const e of this.equipos()) m.set(e.id, e.nombre);
    return m;
  });

  /** Turno actual: la primera fila del orden sin completar. */
  readonly turno = computed<DraftOrdenFila | null>(
    () => this.orden().find((o) => !o.completado) ?? null
  );

  readonly esMiTurno = computed(() => {
    const t = this.turno(); const yo = this.miEquipoId();
    return !!t && !!yo && t.equipo_falm_id === yo;
  });

  readonly misPicks = computed(() => {
    const yo = this.miEquipoId();
    return yo ? this.picks().filter((p) => p.equipo_falm_id === yo) : [];
  });

  readonly misPorterias = computed(() => {
    const cat = new Map(this.catalogo().map((a) => [a.activo_id, a]));
    return this.misPicks().filter((p) => cat.get(p.activo_id)?.tipo === 'DEFENSA').length;
  });

  readonly misTurnosRestantes = computed(() => {
    const yo = this.miEquipoId();
    return yo ? this.orden().filter((o) => !o.completado && o.equipo_falm_id === yo).length : 0;
  });

  /** Cierto cuando ya solo caben porterías en los turnos que me quedan. */
  readonly debeElegirPorteria = computed(() => {
    const faltan = MIN_PORTERIAS - this.misPorterias();
    return faltan > 0 && this.misTurnosRestantes() <= faltan;
  });

  /** Cuántos picks ajenos faltan hasta que me toque (0 = es mi turno). */
  readonly picksHastaMiTurno = computed(() => {
    const yo = this.miEquipoId(); if (!yo) return -1;
    const pend = this.orden().filter((o) => !o.completado);
    const i = pend.findIndex((o) => o.equipo_falm_id === yo);
    return i;
  });

  async cargar(): Promise<void> {
    this.cargando.set(true); this.error.set('');
    try {
      const eq = await this.falm.miEquipo();
      this.miEquipoId.set(eq?.id ?? null);
      this.equipos.set(await this.falm.equiposFalm());

      const { data: d } = await this.sb.client
        .from('draft').select('id')
        .in('estado', ['CREADO', 'EN_CURSO', 'COMPLETADO'])
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (!d) { this.draft.set(null); return; }

      await this.refrescarEstado((d as any).id);
      await this.refrescarOrden((d as any).id);
      await this.refrescarPicks();
      this.catalogo.set(await this.falm.mercadoLibre());
      await this.refrescarCola();
    } catch (e: any) {
      this.error.set(e?.message ?? 'No se pudo cargar el draft.');
    } finally {
      this.cargando.set(false);
    }
  }

  private async refrescarEstado(draftId: string) {
    const { data, error } = await this.sb.client.rpc('draft_estado', { p_draft: draftId });
    if (error) throw error;
    this.draft.set((typeof data === 'string' ? JSON.parse(data) : data) as DraftEstado);
  }

  private async refrescarOrden(draftId: string) {
    const { data, error } = await this.sb.client
      .from('draft_orden')
      .select('equipo_falm_id, ronda, posicion_en_ronda, orden_global, completado')
      .eq('draft_id', draftId).order('orden_global', { ascending: true });
    if (error) throw error;
    this.orden.set((data ?? []) as DraftOrdenFila[]);
  }

  /** Relee los picks y recalcula qué turnos están completados. Se usa al reconciliar. */
  async refrescarPicks(): Promise<void> {
    const d = this.draft(); if (!d) return;
    const { data, error } = await this.sb.client
      .from('draft_pick')
      .select('id, activo_id, equipo_falm_id, ronda, orden_seleccion')
      .eq('draft_id', d.id).order('orden_seleccion', { ascending: true });
    if (error) throw error;
    const filas = (data ?? []) as DraftPickFila[];
    this.picks.set(filas);
    const hechos = new Set(filas.map((p) => p.orden_seleccion));
    this.orden.update((o) => o.map((f) => ({ ...f, completado: hechos.has(f.orden_global) })));
    this.draft.update((x) => (x ? { ...x, picks_hechos: filas.length } : x));
  }

  private async refrescarCola() {
    const d = this.draft(); const yo = this.miEquipoId();
    if (!d || !yo) return;
    const { data } = await this.sb.client
      .from('draft_wishlist').select('activo_id, prioridad')
      .eq('draft_id', d.id).eq('equipo_falm_id', yo)
      .order('prioridad', { ascending: true });
    this.cola.set((data ?? []) as ItemCola[]);
  }

  /** Aplica un pick recibido por Realtime sin volver a consultar nada. */
  private aplicarPick(p: DraftPickFila) {
    if (this.picks().some((x) => x.id === p.id)) return;
    this.picks.update((v) => [...v, p]);
    this.orden.update((o) =>
      o.map((f) => (f.orden_global === p.orden_seleccion ? { ...f, completado: true } : f))
    );
    this.draft.update((d) => (d ? { ...d, picks_hechos: d.picks_hechos + 1 } : d));
  }

  suscribir(): void {
    const d = this.draft(); if (!d || this.canal) return;
    this.canal = this.sb.client
      .channel(`draft:${d.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'falm', table: 'draft_pick', filter: `draft_id=eq.${d.id}` },
        (m) => this.aplicarPick(m.new as DraftPickFila))
      .on('postgres_changes',
        { event: 'DELETE', schema: 'falm', table: 'draft_pick', filter: `draft_id=eq.${d.id}` },
        () => this.refrescarPicks())
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'falm', table: 'draft', filter: `id=eq.${d.id}` },
        (m) => this.draft.update((x) => (x ? { ...x, estado: (m.new as any).estado } : x)))
      .subscribe((estado) => {
        if (estado === 'SUBSCRIBED') {
          this.conectado.set(true);
          this.pararSondeo();
          this.refrescarPicks();
        } else if (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT' || estado === 'CLOSED') {
          this.conectado.set(false);
          this.arrancarSondeo();
        }
      });
  }

  desuscribir(): void {
    this.pararSondeo();
    if (this.canal) { this.sb.client.removeChannel(this.canal); this.canal = null; }
  }

  private arrancarSondeo() {
    if (this.sondeo) return;
    this.sondeo = setInterval(() => this.refrescarPicks(), 5000);
  }
  private pararSondeo() {
    if (this.sondeo) { clearInterval(this.sondeo); this.sondeo = null; }
  }

  /** Ficha un activo. equipoId solo se pasa desde el panel de admin. */
  async fichar(activoId: string, equipoId?: string): Promise<void> {
    const d = this.draft(); const eq = equipoId ?? this.miEquipoId();
    if (!d || !eq) throw new Error('No hay draft o equipo.');
    const { error } = await this.sb.client.rpc('draft_pick', {
      p_draft: d.id, p_activo: activoId, p_equipo: eq,
    });
    if (error) throw new Error(this.traducir(error.message));
    await this.refrescarPicks();
    await this.quitarCola(activoId).catch(() => {});
  }

  /** Mensajes de Postgres → castellano de andar por casa. */
  private traducir(msg: string): string {
    const m = msg.toLowerCase();
    if (m.includes('ya fue elegido')) return 'Te lo han quitado hace un segundo.';
    if (m.includes('no es el turno')) return 'Ya no es tu turno.';
    if (m.includes('no está disponible')) return 'Ese jugador no está disponible.';
    if (m.includes('nombre de otro equipo')) return 'No puedes fichar por otro equipo.';
    if (m.includes('porterías')) return msg;
    return msg;
  }

  async agregarCola(activoId: string): Promise<void> {
    const d = this.draft(); const yo = this.miEquipoId();
    if (!d || !yo) return;
    const prio = (this.cola().at(-1)?.prioridad ?? 0) + 1;
    const { error } = await this.sb.client.from('draft_wishlist')
      .insert({ draft_id: d.id, equipo_falm_id: yo, activo_id: activoId, prioridad: prio });
    if (error) throw error;
    this.cola.update((c) => [...c, { activo_id: activoId, prioridad: prio }]);
  }

  async quitarCola(activoId: string): Promise<void> {
    const d = this.draft(); const yo = this.miEquipoId();
    if (!d || !yo) return;
    const { error } = await this.sb.client.from('draft_wishlist').delete()
      .eq('draft_id', d.id).eq('equipo_falm_id', yo).eq('activo_id', activoId);
    if (error) throw error;
    this.cola.update((c) => c.filter((x) => x.activo_id !== activoId));
  }

  /** Sube (-1) o baja (+1) un elemento de la cola y reescribe las prioridades. */
  async moverCola(activoId: string, delta: number): Promise<void> {
    const d = this.draft(); const yo = this.miEquipoId();
    if (!d || !yo) return;
    const items = [...this.cola()];
    const i = items.findIndex((x) => x.activo_id === activoId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j], items[i]];
    const filas = items.map((x, k) => ({
      draft_id: d.id, equipo_falm_id: yo, activo_id: x.activo_id, prioridad: k + 1,
    }));
    // Un solo upsert = una transacción: el unique diferido se valida al commit.
    const { error } = await this.sb.client.from('draft_wishlist')
      .upsert(filas, { onConflict: 'draft_id,equipo_falm_id,activo_id' });
    if (error) throw error;
    this.cola.set(filas.map((f) => ({ activo_id: f.activo_id, prioridad: f.prioridad })));
  }
}
```

- [ ] **Paso 2: Compilar**

Run: `cd frontend && npm run build`
Expected: compila sin errores de TypeScript.

- [ ] **Paso 3: Commit**

```bash
git add frontend/src/app/features/draft/draft.service.ts
git commit -m "feat(draft): servicio de draft en vivo con Realtime y wishlist"
```

---

### Tarea 4: `draft.component.ts` — el tablero

**Files:**
- Create: `frontend/src/app/features/draft/draft.component.ts`
- Modify: `frontend/src/app/app.routes.ts` (añadir la ruta `draft`)
- Modify: `frontend/src/app/app.component.ts:107-114` (añadir el ítem de menú)

**Interfaces:**
- Consume: todo lo que produce `DraftService` (Tarea 3).
- Produce: componente `DraftComponent` (selector `app-draft`), registrado en la ruta `/draft`.

- [ ] **Paso 1: Crear el componente**

Estructura: cabecera pegajosa con el turno, filtros, lista del catálogo y panel lateral con orden/plantilla/cola. Provee `DraftService` a nivel de componente (no root: se descarta al salir).

```ts
import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivoLibre } from '../../core/falm.service';
import { DraftService } from './draft.service';

const POS = ['PORTERO', 'DEFENSA', 'MEDIO', 'DELANTERO'];
const ABR: Record<string, string> = { PORTERO: 'POR', DEFENSA: 'DEF', MEDIO: 'MED', DELANTERO: 'DEL' };

/** Tablero del draft en vivo: catálogo, turno en tiempo real y cola de favoritos. */
@Component({
  selector: 'app-draft',
  standalone: true,
  imports: [FormsModule],
  providers: [DraftService],
  template: `
    @if (d.cargando()) {
      <p class="muted">Cargando draft…</p>
    } @else if (!d.draft()) {
      <p class="muted">No hay ningún draft activo.</p>
    } @else {
      @if (!d.conectado()) {
        <div class="aviso">Reconectando… los fichajes pueden tardar unos segundos en aparecer.</div>
      }

      <div class="turno" [class.mio]="d.esMiTurno()">
        @if (d.esMiTurno()) {
          <strong>TE TOCA</strong>
        } @else {
          <span>Turno de <strong>{{ nombreEquipo(d.turno()?.equipo_falm_id) }}</strong></span>
          @if (d.picksHastaMiTurno() > 0) {
            <span class="faint">· te toca en {{ d.picksHastaMiTurno() }}</span>
          }
        }
        <span class="faint num">Pick {{ (d.draft()!.picks_hechos) + 1 }}/{{ d.draft()!.picks_totales }}
          · Ronda {{ d.turno()?.ronda ?? '—' }}</span>
        <span class="cupo num">{{ d.misPicks().length }}/23 · porterías {{ d.misPorterias() }}/2</span>
      </div>

      @if (d.debeElegirPorteria()) {
        <div class="aviso">Te quedan {{ d.misTurnosRestantes() }} turnos y te faltan
          {{ 2 - d.misPorterias() }} porterías: solo puedes elegir portería.</div>
      }
      @if (msg()) { <div class="aviso err">{{ msg() }}</div> }

      <div class="cols">
        <section class="cat">
          <input class="buscar" type="search" placeholder="Buscar jugador o club…"
                 [ngModel]="texto()" (ngModelChange)="texto.set($event)" />
          <div class="filtros">
            <button [class.on]="!posFiltro()" (click)="posFiltro.set('')">Todos</button>
            @for (p of pos; track p) {
              <button [class.on]="posFiltro() === p" (click)="posFiltro.set(p)">{{ abr(p) }}</button>
            }
            <button [class.on]="soloLibres()" (click)="soloLibres.set(!soloLibres())">Solo libres</button>
            <button [class.on]="soloCola()" (click)="soloCola.set(!soloCola())">★ Mi cola</button>
          </div>

          <ul class="lista">
            @for (a of visibles().slice(0, limite()); track a.activo_id) {
              <li [class.tomado]="tomado(a)">
                <button class="estrella" (click)="alternarCola(a)"
                        [attr.aria-label]="enCola(a) ? 'Quitar de mi cola' : 'Añadir a mi cola'">
                  {{ enCola(a) ? '★' : '☆' }}
                </button>
                <span class="nom">{{ a.nombre }}</span>
                <span class="pos">{{ abr(a.posicion) }}</span>
                <span class="club faint">{{ a.club }}</span>
                @if (tomado(a)) {
                  <span class="por faint">{{ nombreEquipo(tomado(a)) }}</span>
                } @else {
                  <button class="btn" [disabled]="!puedeFichar(a)" (click)="fichar(a)">Fichar</button>
                }
              </li>
            }
          </ul>
          @if (visibles().length > limite()) {
            <button class="mas" (click)="limite.set(limite() + 50)">
              Ver más ({{ visibles().length - limite() }})
            </button>
          }
        </section>

        <aside class="lat">
          <h3>Mi cola ({{ colaVisible().length }})</h3>
          @if (colaVisible().length === 0) {
            <p class="muted">Marca jugadores con ★ para tenerlos aquí.</p>
          } @else {
            <p class="faint num">{{ colaFichados() }} de tus {{ d.cola().length }} ya fichados</p>
            <ol class="cola">
              @for (a of colaVisible(); track a.activo_id) {
                <li [class.tomado]="tomado(a)">
                  <span class="nom">{{ a.nombre }}</span>
                  <span class="pos">{{ abr(a.posicion) }}</span>
                  <button (click)="d.moverCola(a.activo_id, -1)" aria-label="Subir">↑</button>
                  <button (click)="d.moverCola(a.activo_id, 1)" aria-label="Bajar">↓</button>
                </li>
              }
            </ol>
          }

          <h3>Orden del draft</h3>
          <ol class="orden">
            @for (o of ordenRonda(); track o.orden_global) {
              <li [class.ahora]="o.orden_global === d.turno()?.orden_global"
                  [class.yo]="o.equipo_falm_id === d.miEquipoId()">
                {{ nombreEquipo(o.equipo_falm_id) }}
              </li>
            }
          </ol>
        </aside>
      </div>
    }
  `,
  styles: [`
    .turno { position: sticky; top: 0; z-index: 5; display: flex; gap: 10px; align-items: center;
             flex-wrap: wrap; padding: 10px 12px; background: var(--surface-2);
             border: 1px solid var(--border); border-radius: 10px; margin-bottom: 12px; }
    .turno.mio { border-color: #2ecc71; box-shadow: 0 0 0 1px #2ecc71 inset; }
    .turno strong { font-size: 1.1rem; }
    .cupo { margin-left: auto; }
    .aviso { padding: 8px 12px; border-radius: 8px; background: var(--surface-2);
             border: 1px solid var(--border); margin-bottom: 10px; }
    .aviso.err { border-color: #e74c3c; }
    .cols { display: grid; grid-template-columns: 1fr 300px; gap: 16px; align-items: start; }
    .buscar { width: 100%; margin-bottom: 8px; }
    .filtros { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
    .filtros button.on { background: var(--acc, #a855f7); color: #fff; }
    .lista { list-style: none; padding: 0; margin: 0; }
    .lista li { display: flex; gap: 10px; align-items: center; padding: 8px 6px;
                border-bottom: 1px solid var(--border); }
    .lista li.tomado { opacity: .45; text-decoration: line-through; }
    .lista .nom { flex: 1; }
    .estrella { background: none; border: 0; cursor: pointer; font-size: 1.1rem; }
    .cola, .orden { list-style: none; padding: 0; margin: 0 0 16px; }
    .cola li, .orden li { display: flex; gap: 6px; align-items: center; padding: 5px 4px;
                          border-bottom: 1px solid var(--border); }
    .cola li.tomado { opacity: .45; text-decoration: line-through; }
    .orden li.ahora { font-weight: 700; border-left: 3px solid #2ecc71; padding-left: 6px; }
    .orden li.yo { color: var(--acc, #a855f7); }
    @media (max-width: 860px) { .cols { grid-template-columns: 1fr; } }
  `],
})
export class DraftComponent implements OnInit, OnDestroy {
  pos = POS;
  texto = signal('');
  posFiltro = signal('');
  soloLibres = signal(true);
  soloCola = signal(false);
  limite = signal(50);
  msg = signal('');

  constructor(public d: DraftService) {}

  async ngOnInit() {
    await this.d.cargar();
    this.d.suscribir();
    document.addEventListener('visibilitychange', this.alVolver);
  }
  ngOnDestroy() {
    document.removeEventListener('visibilitychange', this.alVolver);
    this.d.desuscribir();
  }
  private alVolver = () => { if (!document.hidden) this.d.refrescarPicks(); };

  abr(p: string) { return ABR[p] ?? p; }
  nombreEquipo(id?: string | null) { return id ? this.d.equipoPorId().get(id) ?? '—' : '—'; }
  tomado(a: ActivoLibre) { return this.d.tomadoPor().get(a.activo_id) ?? null; }
  enCola(a: ActivoLibre) { return this.d.cola().some((c) => c.activo_id === a.activo_id); }

  puedeFichar(a: ActivoLibre) {
    if (!this.d.esMiTurno() || this.tomado(a)) return false;
    return !this.d.debeElegirPorteria() || a.tipo === 'DEFENSA';
  }

  readonly visibles = computed(() => {
    const t = this.texto().trim().toLowerCase();
    const p = this.posFiltro();
    const soloL = this.soloLibres();
    const soloC = this.soloCola();
    const cola = new Set(this.d.cola().map((c) => c.activo_id));
    const tom = this.d.tomadoPor();
    return this.d.catalogo().filter((a) => {
      if (p && a.posicion !== p) return false;
      if (soloL && tom.has(a.activo_id)) return false;
      if (soloC && !cola.has(a.activo_id)) return false;
      if (t && !(`${a.nombre} ${a.club}`.toLowerCase().includes(t))) return false;
      return true;
    });
  });

  readonly colaVisible = computed(() => {
    const cat = new Map(this.d.catalogo().map((a) => [a.activo_id, a]));
    return this.d.cola().map((c) => cat.get(c.activo_id)).filter((a): a is ActivoLibre => !!a);
  });

  readonly colaFichados = computed(() => {
    const tom = this.d.tomadoPor();
    return this.d.cola().filter((c) => tom.has(c.activo_id)).length;
  });

  /** Los turnos pendientes, para el panel lateral (los 12 próximos). */
  readonly ordenRonda = computed(() => this.d.orden().filter((o) => !o.completado).slice(0, 12));

  async alternarCola(a: ActivoLibre) {
    try {
      if (this.enCola(a)) await this.d.quitarCola(a.activo_id);
      else await this.d.agregarCola(a.activo_id);
    } catch (e: any) { this.msg.set(e?.message ?? 'No se pudo actualizar la cola.'); }
  }

  async fichar(a: ActivoLibre) {
    if (!confirm(`¿Fichar a ${a.nombre}?`)) return;
    this.msg.set('');
    try { await this.d.fichar(a.activo_id); }
    catch (e: any) { this.msg.set(e?.message ?? 'No se pudo fichar.'); }
  }
}
```

- [ ] **Paso 2: Registrar la ruta**

En `frontend/src/app/app.routes.ts`, dentro de `children`, junto a `mercado`:

```ts
      {
        path: 'draft',
        loadComponent: () => import('./features/draft/draft.component').then((m) => m.DraftComponent),
      },
```

- [ ] **Paso 3: Añadir el ítem de menú**

En `frontend/src/app/app.component.ts:107-114`, añadir al array `items` tras Mercado:

```ts
    { path: '/draft', icon: '🎯', label: 'Draft' },
```

- [ ] **Paso 4: Compilar**

Run: `cd frontend && npm run build`
Expected: compila sin errores.

- [ ] **Paso 5: Commit**

```bash
git add frontend/src/app/features/draft/draft.component.ts frontend/src/app/app.routes.ts frontend/src/app/app.component.ts
git commit -m "feat(draft): tablero en vivo del manager con cola de favoritos"
```

---

### Tarea 5: Aviso de turno (sonido, notificación, título)

**Files:**
- Modify: `frontend/src/app/features/draft/draft.component.ts`

**Interfaces:**
- Consume: `DraftService.esMiTurno()`.
- Produce: efecto que avisa en la transición "no era mi turno" → "es mi turno".

- [ ] **Paso 1: Añadir el aviso al componente**

Importar `effect` de `@angular/core` y añadir al constructor:

```ts
  private eraMiTurno = false;
  private tituloBase = document.title;
  private parpadeo: any = null;

  constructor(public d: DraftService) {
    effect(() => {
      const mio = this.d.esMiTurno();
      if (mio && !this.eraMiTurno) this.avisar();
      if (!mio && this.eraMiTurno) this.pararAviso();
      this.eraMiTurno = mio;
    });
  }

  private avisar() {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator(); const gan = ctx.createGain();
      osc.connect(gan); gan.connect(ctx.destination);
      osc.frequency.value = 880; gan.gain.value = 0.15;
      osc.start(); osc.stop(ctx.currentTime + 0.25);
    } catch { /* sin audio, no pasa nada */ }

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('FALM — te toca', { body: 'Es tu turno en el draft.' });
    }
    let on = false;
    this.parpadeo = setInterval(() => {
      document.title = (on = !on) ? '🎯 ¡TE TOCA!' : this.tituloBase;
    }, 1000);
  }

  private pararAviso() {
    if (this.parpadeo) { clearInterval(this.parpadeo); this.parpadeo = null; }
    document.title = this.tituloBase;
  }
```

Y en `ngOnInit`, pedir permiso al entrar:

```ts
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
```

Y en `ngOnDestroy`, `this.pararAviso();`.

- [ ] **Paso 2: Compilar**

Run: `cd frontend && npm run build`
Expected: compila sin errores.

- [ ] **Paso 3: Commit**

```bash
git add frontend/src/app/features/draft/draft.component.ts
git commit -m "feat(draft): aviso de turno con sonido, notificacion y titulo parpadeante"
```

---

### Tarea 6: Pre-pick y estados de pantalla restantes

**Files:**
- Modify: `frontend/src/app/features/draft/draft.component.ts`

**Interfaces:**
- Consume: `DraftService.cola()`, `DraftService.tomadoPor()`, `DraftService.debeElegirPorteria()`, `DraftService.fichar()`.
- Produce: signal `prePick` en `DraftComponent` y método `candidatoPrePick(): ActivoLibre | null`.

Cubre la sección 6.4 del spec (pre-pick) y los dos estados de 6.5 que faltaban: draft completado y usuario sin equipo.

- [ ] **Paso 1: Añadir el pre-pick al componente**

```ts
  prePick = signal(false);

  /** Primer elemento de la cola que sigue libre y es válido según el cupo de porterías. */
  candidatoPrePick(): ActivoLibre | null {
    const cat = new Map(this.d.catalogo().map((a) => [a.activo_id, a]));
    const tom = this.d.tomadoPor();
    const soloPorteria = this.d.debeElegirPorteria();
    for (const c of this.d.cola()) {
      const a = cat.get(c.activo_id);
      if (!a || tom.has(a.activo_id)) continue;
      if (soloPorteria && a.tipo !== 'DEFENSA') continue;
      return a;
    }
    return null;
  }

  /** Si el pre-pick está activo, ficha solo al llegar mi turno. Si no hay candidato, no hace nada. */
  private async intentarPrePick() {
    if (!this.prePick()) return;
    const a = this.candidatoPrePick();
    if (!a) { this.msg.set('Pre-pick activo, pero ningún jugador de tu cola sirve. Elige a mano.'); return; }
    try { await this.d.fichar(a.activo_id); this.msg.set(`Pre-pick: fichado ${a.nombre}.`); }
    catch (e: any) { this.msg.set(e?.message ?? 'El pre-pick no pudo completarse.'); }
  }
```

En el `effect` de la Tarea 5, dentro de la rama `if (mio && !this.eraMiTurno)`, llamar a `this.intentarPrePick();` justo después de `this.avisar();`.

En la plantilla, dentro del panel lateral, encima de la lista de la cola:

```html
          <label class="prepick">
            <input type="checkbox" [ngModel]="prePick()" (ngModelChange)="prePick.set($event)" />
            Pre-pick: fichar solo al llegar mi turno
          </label>
```

- [ ] **Paso 2: Añadir los estados de pantalla que faltan**

En la plantilla, justo después de `@if (!d.draft())` y antes del bloque principal:

```html
      @if (!d.miEquipoId()) {
        <p class="muted">Tu usuario no tiene ningún equipo asignado en esta temporada.
          Habla con el administrador de la liga.</p>
      } @else if (d.draft()!.estado === 'COMPLETADO' || d.draft()!.estado === 'CONSOLIDADO') {
        <h2>Draft terminado</h2>
        <p class="faint num">Tu plantilla: {{ d.misPicks().length }} jugadores ·
          {{ d.misPorterias() }} porterías</p>
        <ol class="cola">
          @for (a of misFichados(); track a.activo_id) {
            <li><span class="nom">{{ a.nombre }}</span>
                <span class="pos">{{ abr(a.posicion) }}</span>
                <span class="club faint">{{ a.club }}</span></li>
          }
        </ol>
      } @else {
```

(y cerrar ese `@else` con `}` al final del bloque del tablero).

Con el computed que lo alimenta:

```ts
  readonly misFichados = computed(() => {
    const cat = new Map(this.d.catalogo().map((a) => [a.activo_id, a]));
    return this.d.misPicks()
      .map((p) => cat.get(p.activo_id))
      .filter((a): a is ActivoLibre => !!a);
  });
```

- [ ] **Paso 3: Compilar**

Run: `cd frontend && npm run build`
Expected: compila sin errores.

- [ ] **Paso 4: Commit**

```bash
git add frontend/src/app/features/draft/draft.component.ts
git commit -m "feat(draft): pre-pick desde la cola y pantallas de draft terminado y sin equipo"
```

---

### Tarea 7: Panel de admin — fichar en nombre de y deshacer

**Files:**
- Modify: `frontend/src/app/features/admin/pretemporada.component.ts:189` (sustituir `picar()`)
- Modify: `frontend/src/app/features/admin/admin.service.ts` (añadir `draftDeshacer`)

**Interfaces:**
- Consume: `AdminService.ejecutar(fn, params)` (patrón existente en `pretemporada.component.ts:181`).
- Produce: `AdminService.draftDeshacer(draftId: string): Promise<void>`.

- [ ] **Paso 1: Añadir el método al servicio de admin**

En `admin.service.ts`, junto a `draftPicks`:

```ts
  /** Deshace el último pick del draft (solo ADMIN/GESTOR, lo valida la función). */
  async draftDeshacer(draftId: string): Promise<void> {
    const { error } = await this.sb.client.rpc('draft_pick_deshacer', { p_draft: draftId });
    if (error) throw error;
  }
```

- [ ] **Paso 2: Sustituir el `picar()` provisional**

En `pretemporada.component.ts`, reemplazar el método de la línea 189:

```ts
  /** Ficha en nombre del equipo al que le toca (dictado en la quedada presencial). */
  async picar(activoId: string) {
    const d = this.draft(); const t = d?.turno;
    if (!d || !t) { this.aviso.set('No hay turno activo.'); return; }
    await this.accion(
      () => this.admin.ejecutar('draft_pick',
        { p_draft: d.id, p_activo: activoId, p_equipo: t.equipo_falm_id }),
      `✅ Fichado para ${t.equipo}.`
    );
  }

  /** Deshace el último pick (errores de dictado). */
  async deshacer() {
    const d = this.draft(); if (!d) return;
    if (!confirm('¿Deshacer el último pick?')) return;
    await this.accion(() => this.admin.draftDeshacer(d.id), '✅ Pick deshecho.');
  }
```

Y en la plantilla, dentro del bloque `@if (draft().turno; as t)`, añadir junto al resto de botones:

```html
            <button class="btn ghost" (click)="deshacer()">↩ Deshacer último pick</button>
```

- [ ] **Paso 3: Compilar**

Run: `cd frontend && npm run build`
Expected: compila sin errores.

- [ ] **Paso 4: Commit**

```bash
git add frontend/src/app/features/admin/
git commit -m "feat(draft): admin puede fichar en nombre del equipo en turno y deshacer picks"
```

---

### Tarea 8: Verificación end-to-end y documentación

**Files:**
- Create: `docs/2026-09-03-verificacion-draft-en-vivo.md`

- [ ] **Paso 1: Crear un draft de prueba desde el panel de admin**

Entrar en `/admin/pretemporada` y pulsar "Crear draft". Anotar el id.

- [ ] **Paso 2: Prueba a dos navegadores**

Abrir `/draft` en dos navegadores distintos con dos usuarios distintos (uno de ellos, el equipo al que le toca). Comprobar:

1. El que tiene el turno ve **TE TOCA**; el otro ve "Turno de X · te toca en N".
2. Al fichar, el otro navegador tacha esa fila **sin recargar**, en menos de un segundo.
3. El contador `Pick n/230` avanza en ambos.
4. El que no tiene turno tiene el botón Fichar deshabilitado en todas las filas.

- [ ] **Paso 3: Verificar la identidad (el agujero que se cerró)**

En la consola del navegador del usuario que **no** tiene el turno:

```js
const { error } = await window.supabase?.rpc?.('draft_pick', {}) ?? {};
```

Si no hay cliente expuesto en `window`, hacerlo desde la propia app: en el panel de admin de un usuario sin rol ADMIN, intentar fichar por otro equipo.
Expected: error `No puedes fichar en nombre de otro equipo`.

- [ ] **Paso 4: Verificar el mínimo de porterías**

Sobre un draft de 3 rondas creado a mano, gastar los 3 turnos de un equipo en jugadores de campo.
Expected: el tercer intento con jugador de campo falla con "solo puedes elegir portería", y el catálogo del tablero se muestra filtrado a porterías.

- [ ] **Paso 5: Verificar la reconexión**

Con el tablero abierto, cortar la wifi 10 segundos y volver.
Expected: aparece el banner "Reconectando…", y al volver los picks que hayan ocurrido entretanto aparecen.

- [ ] **Paso 6: Cancelar el draft de prueba**

```sql
update falm.draft set estado='CANCELADO' where nombre like 'Draft%' and id = '<id de prueba>';
```

- [ ] **Paso 7: Documentar y commitear**

Escribir `docs/2026-09-03-verificacion-draft-en-vivo.md` con el mismo formato de tabla que `docs/2026-06-14-verificacion-funcional-v2.md` (Antes / Ahora / Test real / Nota), recogiendo el resultado de los pasos 2-5.

```bash
git add docs/2026-09-03-verificacion-draft-en-vivo.md
git commit -m "docs: verificacion funcional del draft en vivo"
```
