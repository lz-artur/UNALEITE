-- =====================================================
-- 038: Inventário com aprovação e trilha de auditoria
-- =====================================================

create table if not exists public.inventory_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  status text not null default 'em_contagem'
    check (status in ('em_contagem', 'aguardando_aprovacao', 'concluido')),
  created_by uuid not null,
  created_by_name text not null,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_count_items (
  id uuid primary key default gen_random_uuid(),
  inventory_session_id uuid not null references public.inventory_sessions(id) on delete cascade,
  lot_type text not null check (lot_type in ('Insumo', 'Produto Acabado')),
  lot_id uuid not null,
  product_id uuid not null,
  product_name text not null,
  product_code text,
  lot_code text not null,
  unit_symbol text,
  system_quantity numeric(14,4) not null check (system_quantity >= 0),
  counted_quantity numeric(14,4) check (counted_quantity >= 0),
  difference_quantity numeric(14,4),
  notes text,
  status text not null default 'nao_contado'
    check (status in ('nao_contado', 'confere', 'aguardando_aprovacao', 'aprovado', 'recusado')),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid,
  reviewed_by_name text,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (inventory_session_id, lot_type, lot_id)
);

create table if not exists public.inventory_audit_logs (
  id uuid primary key default gen_random_uuid(),
  inventory_session_id uuid not null references public.inventory_sessions(id) on delete cascade,
  inventory_count_item_id uuid references public.inventory_count_items(id) on delete set null,
  action text not null,
  actor_id uuid,
  actor_name text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_inventory_sessions_status on public.inventory_sessions(status, started_at desc);
create index if not exists idx_inventory_sessions_created_by on public.inventory_sessions(created_by, started_at desc);
create index if not exists idx_inventory_count_items_session on public.inventory_count_items(inventory_session_id);
create index if not exists idx_inventory_count_items_pending on public.inventory_count_items(status) where status = 'aguardando_aprovacao';
create index if not exists idx_inventory_audit_logs_session on public.inventory_audit_logs(inventory_session_id, created_at desc);

-- Aprova um item do inventário de modo atômico. A conferência do saldo atual
-- impede que uma movimentação ocorrida após a contagem seja sobrescrita.
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
  v_difference numeric(14,4);
  v_received_quantity numeric(14,4);
  v_produced_quantity numeric(14,4);
begin
  select * into v_item
  from public.inventory_count_items
  where id = p_item_id
  for update;

  if not found then
    raise exception 'Item de inventário não encontrado';
  end if;

  if v_item.status <> 'aguardando_aprovacao' then
    raise exception 'Este item não está aguardando aprovação';
  end if;

  if v_item.counted_quantity is null then
    raise exception 'A quantidade física não foi informada';
  end if;

  select * into v_session
  from public.inventory_sessions
  where id = v_item.inventory_session_id
  for update;

  if v_session.status <> 'aguardando_aprovacao' then
    raise exception 'Esta sessão não está aguardando aprovação';
  end if;

  if v_item.lot_type = 'Insumo' then
    select available_quantity, received_quantity
    into v_current_quantity, v_received_quantity
    from public.supply_lots
    where id = v_item.lot_id
    for update;
  else
    select available_quantity, quantity_produced
    into v_current_quantity, v_produced_quantity
    from public.finished_product_lots
    where id = v_item.lot_id
    for update;
  end if;

  if not found then
    raise exception 'O lote contado não existe mais no estoque';
  end if;

  if v_current_quantity <> v_item.system_quantity then
    raise exception 'O saldo deste lote mudou após a contagem. Inicie uma nova contagem para aprovar o ajuste.';
  end if;

  v_difference := v_item.counted_quantity - v_item.system_quantity;

  if v_item.lot_type = 'Insumo' then
    update public.supply_lots
    set available_quantity = v_item.counted_quantity,
        received_quantity = greatest(v_received_quantity, v_item.counted_quantity),
        status = case
          when v_item.counted_quantity = 0 then 'Totalmente Utilizado'
          when v_item.counted_quantity < greatest(v_received_quantity, v_item.counted_quantity) then 'Parcialmente Utilizado'
          else 'Disponivel'
        end,
        updated_at = now(),
        updated_by = p_approver_id
    where id = v_item.lot_id;

    update public.supply_items
    set current_stock = greatest(0, current_stock + v_difference),
        updated_at = now(),
        updated_by = p_approver_id
    where id = v_item.product_id;
  else
    update public.finished_product_lots
    set available_quantity = v_item.counted_quantity,
        quantity_produced = greatest(v_produced_quantity, v_item.counted_quantity),
        updated_at = now(),
        updated_by = p_approver_id
    where id = v_item.lot_id;
  end if;

  update public.inventory_count_items
  set status = 'aprovado',
      difference_quantity = v_difference,
      reviewed_at = now(),
      reviewed_by = p_approver_id,
      reviewed_by_name = p_approver_name,
      review_note = p_review_note,
      updated_at = now()
  where id = p_item_id;

  insert into public.stock_movements (
    movement_type,
    lot_type,
    lot_id,
    quantity,
    reference_table,
    reference_id,
    created_by,
    updated_by
  ) values (
    case when v_difference >= 0 then 'entrada_ajuste_inventario' else 'saida_ajuste_inventario' end,
    v_item.lot_type,
    v_item.lot_id,
    abs(v_difference),
    'inventory_count_items',
    v_item.id,
    p_approver_id,
    p_approver_id
  );

  insert into public.inventory_audit_logs (
    inventory_session_id,
    inventory_count_item_id,
    action,
    actor_id,
    actor_name,
    details
  ) values (
    v_item.inventory_session_id,
    v_item.id,
    'ajuste_aprovado',
    p_approver_id,
    p_approver_name,
    jsonb_build_object(
      'quantidade_sistema', v_item.system_quantity,
      'quantidade_fisica', v_item.counted_quantity,
      'diferenca', v_difference,
      'observacao', p_review_note
    )
  );

  if not exists (
    select 1
    from public.inventory_count_items
    where inventory_session_id = v_item.inventory_session_id
      and status = 'aguardando_aprovacao'
  ) then
    update public.inventory_sessions
    set status = 'concluido', completed_at = now(), updated_at = now()
    where id = v_item.inventory_session_id;
  end if;

  return jsonb_build_object('item_id', p_item_id, 'difference', v_difference);
end;
$$;
