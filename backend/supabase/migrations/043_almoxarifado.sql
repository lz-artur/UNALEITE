-- Itens destinados ao almoxarifado e saídas internas por setor.
alter table public.supply_items
  add column if not exists is_warehouse_item boolean not null default false;

create table if not exists public.warehouse_withdrawals (
  id uuid primary key default gen_random_uuid(),
  withdrawal_number text not null unique,
  sector text not null,
  notes text,
  withdrawal_date timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid
);

create table if not exists public.warehouse_withdrawal_items (
  id uuid primary key default gen_random_uuid(),
  warehouse_withdrawal_id uuid not null references public.warehouse_withdrawals(id) on delete cascade,
  supply_item_id uuid not null references public.supply_items(id),
  quantity numeric(14,4) not null check (quantity > 0),
  unit_cost numeric(12,4) not null default 0,
  total_value numeric(14,4) not null default 0
);

create index if not exists warehouse_withdrawals_date_idx on public.warehouse_withdrawals(withdrawal_date desc);
create index if not exists warehouse_withdrawal_items_withdrawal_idx on public.warehouse_withdrawal_items(warehouse_withdrawal_id);

create or replace function public.create_warehouse_withdrawal(
  p_sector text,
  p_notes text,
  p_withdrawal_date timestamptz,
  p_created_by uuid,
  p_items jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_withdrawal_id uuid := gen_random_uuid();
  v_number text := 'ALM-' || to_char(coalesce(p_withdrawal_date, now()), 'YYYY') || '-' || to_char(now(), 'YYYYMMDDHH24MISSMS');
  v_item jsonb;
  v_supply_item_id uuid;
  v_requested numeric;
  v_available numeric;
  v_remaining numeric;
  v_lot record;
  v_cost numeric;
begin
  if coalesce(trim(p_sector), '') = '' then
    raise exception 'Informe o setor de destino.';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Inclua ao menos um item na saída.';
  end if;

  insert into warehouse_withdrawals (id, withdrawal_number, sector, notes, withdrawal_date, created_by)
  values (v_withdrawal_id, v_number, trim(p_sector), nullif(trim(p_notes), ''), coalesce(p_withdrawal_date, now()), p_created_by);

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_supply_item_id := (v_item->>'supplyItemId')::uuid;
    v_requested := (v_item->>'quantity')::numeric;
    if v_requested <= 0 then raise exception 'A quantidade deve ser maior que zero.'; end if;

    select coalesce(sum(available_quantity), 0) into v_available
    from supply_lots sl join supply_items si on si.id = sl.supply_item_id
    where sl.supply_item_id = v_supply_item_id and sl.active and sl.status in ('Disponivel', 'Parcialmente Utilizado')
      and si.is_warehouse_item and si.active;
    if v_available < v_requested then
      raise exception 'Estoque insuficiente para o item selecionado.';
    end if;

    select coalesce(default_cost, 0) into v_cost from supply_items where id = v_supply_item_id;
    insert into warehouse_withdrawal_items (warehouse_withdrawal_id, supply_item_id, quantity, unit_cost, total_value)
    values (v_withdrawal_id, v_supply_item_id, v_requested, v_cost, v_requested * v_cost);

    v_remaining := v_requested;
    for v_lot in select id, available_quantity from supply_lots
      where supply_item_id = v_supply_item_id and active and status in ('Disponivel', 'Parcialmente Utilizado') and available_quantity > 0
      order by expiration_date nulls last, entry_date, created_at for update
    loop
      exit when v_remaining <= 0;
      v_cost := least(v_remaining, v_lot.available_quantity);
      update supply_lots set available_quantity = available_quantity - v_cost,
        status = case when available_quantity - v_cost = 0 then 'Utilizado' else 'Parcialmente Utilizado' end,
        updated_at = now(), updated_by = p_created_by where id = v_lot.id;
      insert into stock_movements (movement_type, lot_type, lot_id, quantity, reference_table, reference_id, created_by, updated_by)
      values ('saida', 'Insumo', v_lot.id, v_cost, 'warehouse_withdrawals', v_withdrawal_id, p_created_by, p_created_by);
      v_remaining := v_remaining - v_cost;
    end loop;

    update supply_items set current_stock = greatest(0, current_stock - v_requested), updated_at = now(), updated_by = p_created_by
      where id = v_supply_item_id;
  end loop;
  return v_withdrawal_id;
end;
$$;
