create table if not exists product_spec_finished_product_items (
  id uuid primary key default gen_random_uuid(),
  product_spec_id uuid not null references product_specs(id) on delete cascade,
  finished_product_id uuid not null references finished_products(id),
  quantity numeric(14,4) not null,
  unit_id uuid not null references units(id),
  created_at timestamptz not null default now(),
  created_by uuid null,
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

create unique index if not exists product_spec_finished_product_items_unique
  on product_spec_finished_product_items(product_spec_id, finished_product_id);

create table if not exists production_order_finished_product_consumptions (
  id uuid primary key default gen_random_uuid(),
  production_order_id uuid not null references production_orders(id) on delete cascade,
  finished_product_lot_id uuid not null references finished_product_lots(id),
  quantity_consumed numeric(14,4) not null,
  created_at timestamptz not null default now(),
  created_by uuid null,
  updated_at timestamptz not null default now(),
  updated_by uuid null
);
