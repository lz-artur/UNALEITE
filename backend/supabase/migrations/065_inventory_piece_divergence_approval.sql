-- Correção: divergências somente de peças também exigem aprovação. Reabre
-- sessões encerradas indevidamente por versões anteriores da regra.
with corrected_items as (
  update public.inventory_count_items
  set status = 'aguardando_aprovacao',
      submitted_at = coalesce(submitted_at, now()),
      updated_at = now()
  where tracks_pieces = true
    and coalesce(difference_pieces, 0) <> 0
    and status = 'confere'
  returning inventory_session_id, id
), reopened_sessions as (
  update public.inventory_sessions s
  set status = 'aguardando_aprovacao', completed_at = null, updated_at = now()
  where exists (select 1 from corrected_items c where c.inventory_session_id = s.id)
  returning s.id
)
insert into public.inventory_audit_logs (inventory_session_id, action, actor_name, details)
select id, 'divergencia_de_pecas_reaberta', 'Sistema',
  jsonb_build_object('motivo', 'Divergência de peças reenviada para aprovação após correção da regra')
from reopened_sessions;
