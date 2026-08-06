create table if not exists finished_product_manual_exits (
  id uuid primary key default gen_random_uuid(),
  finished_product_lot_id uuid not null references finished_product_lots(id),
  quantity numeric(14,4) not null,
  reason text not null,
  notes text,
  exit_date timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid null,
  updated_at timestamptz not null default now(),
  updated_by uuid null,
  check (quantity > 0)
);

create index if not exists finished_product_manual_exits_lot_id_idx on finished_product_manual_exits(finished_product_lot_id);
