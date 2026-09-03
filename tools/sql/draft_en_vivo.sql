-- Draft en vivo: wishlist privada por equipo, escritura de picks solo por RPC y Realtime.
-- Idempotente: se puede volver a ejecutar sin efectos.
--
-- Nota: las políticas de LECTURA (sel_auth) ya existen en draft, draft_orden y
-- draft_pick, así que aquí no se tocan. Realtime respeta RLS y con esas basta.

-- ---------------------------------------------------------------------------
-- 1. Wishlist (cola de favoritos), privada por equipo.
-- ---------------------------------------------------------------------------
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

-- Cada equipo solo ve y toca su propia cola. Nadie espía la del rival.
drop policy if exists wishlist_propia on falm.draft_wishlist;
create policy wishlist_propia on falm.draft_wishlist for all to authenticated
  using (falm.es_mi_equipo(equipo_falm_id))
  with check (falm.es_mi_equipo(equipo_falm_id));

-- ---------------------------------------------------------------------------
-- 2. Endurecer la escritura de picks.
--    La política wr_pick permitía a un mánager INSERTAR un pick directamente en
--    la tabla con tal de que fuera su equipo, saltándose el turno. Los picks
--    normales van por falm.draft_pick(), que es SECURITY DEFINER y por tanto
--    ignora RLS, así que restringir la escritura directa a admin no rompe nada.
-- ---------------------------------------------------------------------------
drop policy if exists wr_pick on falm.draft_pick;
create policy wr_pick on falm.draft_pick for all to authenticated
  using (falm.es_admin() or falm.es_gestor())
  with check (falm.es_admin() or falm.es_gestor());

-- ---------------------------------------------------------------------------
-- 3. Realtime.
-- ---------------------------------------------------------------------------
alter table falm.draft_pick replica identity full;
alter table falm.draft      replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'falm'
                    and tablename = 'draft_pick') then
    alter publication supabase_realtime add table falm.draft_pick;
  end if;
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'falm'
                    and tablename = 'draft') then
    alter publication supabase_realtime add table falm.draft;
  end if;
end $$;
