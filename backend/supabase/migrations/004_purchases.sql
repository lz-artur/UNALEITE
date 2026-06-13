create table if not exists purchases (
  id uuid primary key default gen_random_uuid(),
  purchase_number text not null unique,
  supplier_id uuid not null references suppliers(id),
  purchase_date timestamptz not null,
  due_date timestamptz not null,
  status text not null,
  total_amount numeric(14,4) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid null,
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

create table if not exists purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references purchases(id) on delete cascade,
  supply_item_id uuid not null references supply_items(id),
  ordered_quantity numeric(14,4) not null,
  received_quantity numeric(14,4) not null default 0,
  unit_cost numeric(12,4) not null,
  total_value numeric(14,4) not null,
  status text not null default 'Aberta',
  created_at timestamptz not null default now(),
  created_by uuid null,
  updated_at timestamptz not null default now(),
  updated_by uuid null,
  check (ordered_quantity > 0),
  check (received_quantity >= 0),
  check (received_quantity <= ordered_quantity)
);

alter table supply_lots
  add column if not exists purchase_id uuid references purchases(id),
  add column if not exists purchase_item_id uuid references purchase_items(id);

create index if not exists purchase_items_purchase_id_idx
  on purchase_items(purchase_id);

create index if not exists purchase_items_supply_item_id_idx
  on purchase_items(supply_item_id);

create index if not exists supply_lots_purchase_id_idx
  on supply_lots(purchase_id);

drop view if exists supply_lots_with_item;

create view supply_lots_with_item as
select
  sl.*,
  si.name as supply_item_name,
  si.category as supply_item_category,
  si.minimum_stock,
  si.unit_id,
  s.name as supplier_name,
  p.purchase_number
from supply_lots sl
join supply_items si on si.id = sl.supply_item_id
join suppliers s on s.id = sl.supplier_id
left join purchases p on p.id = sl.purchase_id;
