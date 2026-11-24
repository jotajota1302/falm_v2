-- Anular un fichaje por lesion (2026-11-24).
--
-- El gestor revisa las lesiones en Admin > Fichajes. Si una no procede (no es
-- de larga duracion, la noticia no lo dice...), la anula con un motivo que el
-- equipo ve en su pantalla. Anular es:
--   * marcarla usada, para que el reparto la salte como a cualquier usada;
--   * guardar el motivo en `anulada` (usada sin `jornada_usada_id` y con motivo
--     = anulada, no gastada);
--   * rechazar la peticion que tuviera pendiente para esa lesion.
-- Respaldo previo: bk_falm_20261124_224838_antes_de_anular_lesiones.

begin;

alter table falm.fichaje_extra add column if not exists anulada text;

create or replace function falm.anular_fichaje_extra(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path to 'public', 'falm'
as $$
declare v_usado boolean;
begin
  if not falm.puede_gestionar() then
    raise exception 'Solo el gestor puede anular un fichaje por lesion';
  end if;
  select usado into v_usado from falm.fichaje_extra where id = p_id for update;
  if not found then raise exception 'Esa lesion no existe'; end if;
  if v_usado then raise exception 'Esa lesion ya se uso o ya estaba anulada'; end if;

  update falm.fichaje_extra
     set usado = true, fecha_uso = now(),
         anulada = coalesce(nullif(trim(p_motivo), ''), 'Anulada por el gestor')
   where id = p_id;

  update falm.peticion_fichaje
     set estado = 'RECHAZADA', fecha_procesamiento = now(),
         observaciones = 'Fichaje por lesion anulado: ' ||
           coalesce(nullif(trim(p_motivo), ''), 'decision del gestor')
   where fichaje_extra_id = p_id and estado = 'PENDIENTE';
end $$;

revoke all on function falm.anular_fichaje_extra(uuid, text) from public;
grant execute on function falm.anular_fichaje_extra(uuid, text) to authenticated;

commit;
