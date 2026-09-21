-- Cada ajuste aprovado precisa produzir uma movimentação auditável tanto de
-- peso quanto de peças. Esta versão preserva a proteção contra saldo alterado
-- depois da contagem e complementa a trilha de estoque.
create or replace function public.approve_inventory_count_item(
  p_item_id uuid,
  p_approver_id uuid,
  p_approver_name text,
  p_review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.inventory_count_items%rowtype;
  v_session public.inventory_sessions%rowtype;
  v_current_quantity numeric(14,4);
  v_received_quantity numeric(14,4);
  v_produced_quantity numeric(14,4);
  v_current_pieces integer;
  v_difference numeric(14,4);
  v_difference_pieces integer;
begin
  select * into v_item from public.inventory_count_items where id = p_item_id for update;
  if not found then raise exception 'Item de inventário não encontrado'; end if;
  if v_item.status <> 'aguardando_aprovacao' then raise exception 'Este item não está aguardando aprovação'; end if;
  if v_item.counted_quantity is null then raise exception 'A quantidade física não foi informada'; end if;
  if v_item.tracks_pieces and v_item.counted_pieces is null then raise exception 'A quantidade de peças físicas não foi informada'; end if;

  select * into v_session from public.inventory_sessions where id = v_item.inventory_session_id for update;
  if v_session.status <> 'aguardando_aprovacao' then raise exception 'Esta sessão não está aguardando aprovação'; end if;

  if v_item.lot_type = 'Insumo' then
    select available_quantity, received_quantity into v_current_quantity, v_received_quantity
    from public.supply_lots where id = v_item.lot_id for update;
  else
    select available_quantity, quantity_produced, available_pieces
    into v_current_quantity, v_produced_quantity, v_current_pieces
    from public.finished_product_lots where id = v_item.lot_id for update;
  end if;
  if not found then raise exception 'O lote contado não existe mais no estoque'; end if;
  if v_current_quantity <> v_item.system_quantity then raise exception 'O saldo deste lote mudou após a contagem. Inicie uma nova contagem para aprovar o ajuste.'; end if;
  if v_item.tracks_pieces and v_current_pieces <> v_item.system_pieces then raise exception 'O saldo de peças deste lote mudou após a contagem. Inicie uma nova contagem para aprovar o ajuste.'; end if;

  v_difference := v_item.counted_quantity - v_item.system_quantity;
  v_difference_pieces := case when v_item.tracks_pieces then v_item.counted_pieces - v_item.system_pieces else null end;

  if v_item.lot_type = 'Insumo' then
    update public.supply_lots
    set available_quantity = v_item.counted_quantity,
        received_quantity = greatest(v_received_quantity, v_item.counted_quantity),
        status = case when v_item.counted_quantity = 0 then 'Totalmente Utilizado' when v_item.counted_quantity < greatest(v_received_quantity, v_item.counted_quantity) then 'Parcialmente Utilizado' else 'Disponivel' end,
        updated_at = now(), updated_by = p_approver_id
    where id = v_item.lot_id;
    update public.supply_items set current_stock = greatest(0, current_stock + v_difference), updated_at = now(), updated_by = p_approver_id where id = v_item.product_id;
  else
    update public.finished_product_lots
    set available_quantity = v_item.counted_quantity,
        quantity_produced = greatest(v_produced_quantity, v_item.counted_quantity),
        available_pieces = case when v_item.tracks_pieces then v_item.counted_pieces else available_pieces end,
        updated_at = now(), updated_by = p_approver_id
    where id = v_item.lot_id;
  end if;

  update public.inventory_count_items
  set status = 'aprovado', difference_quantity = v_difference, difference_pieces = v_difference_pieces,
      reviewed_at = now(), reviewed_by = p_approver_id, reviewed_by_name = p_approver_name,
      review_note = p_review_note, updated_at = now()
  where id = v_item.id;

  insert into public.stock_movements (movement_type, lot_type, lot_id, quantity, pieces_quantity, reference_table, reference_id, created_by, updated_by)
  values (case when v_difference >= 0 then 'entrada_ajuste_inventario' else 'saida_ajuste_inventario' end,
          v_item.lot_type, v_item.lot_id, abs(v_difference), abs(v_difference_pieces),
          'inventory_count_items', v_item.id, p_approver_id, p_approver_id);

  insert into public.inventory_audit_logs (inventory_session_id, inventory_count_item_id, action, actor_id, actor_name, details)
  values (v_item.inventory_session_id, v_item.id, 'ajuste_aprovado', p_approver_id, p_approver_name,
          jsonb_build_object('previous_quantity', v_item.system_quantity, 'new_quantity', v_item.counted_quantity,
            'difference', v_difference, 'previous_pieces', v_item.system_pieces, 'new_pieces', v_item.counted_pieces,
            'difference_pieces', v_difference_pieces, 'review_note', p_review_note));

  if not exists (select 1 from public.inventory_count_items where inventory_session_id = v_item.inventory_session_id and status in ('nao_contado', 'aguardando_aprovacao')) then
    update public.inventory_sessions set status = 'concluido', completed_at = now(), updated_at = now() where id = v_item.inventory_session_id;
  end if;
  return row_to_json(v_item)::jsonb;
end;
$$;
