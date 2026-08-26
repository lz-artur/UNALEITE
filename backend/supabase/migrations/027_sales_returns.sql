alter table finished_product_lots
  add column if not exists returned_quantity numeric(14,4) not null default 0;

alter table sales_orders
  add column if not exists has_return boolean not null default false;

create table if not exists sales_returns (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references sales_orders(id) on delete cascade,
  product_id uuid not null references finished_products(id),
  finished_product_lot_id uuid not null references finished_product_lots(id),
  original_quantity numeric(14,4) not null,
  returned_quantity numeric(14,4) not null,
  return_date timestamptz not null default now(),
  reason text,
  discount_amount numeric(14,4) not null default 0,
  original_sale_value numeric(14,4) not null,
  new_sale_value numeric(14,4) not null,
  created_at timestamptz not null default now(),
  created_by uuid null,
  updated_at timestamptz not null default now(),
  updated_by uuid null,
  check (returned_quantity > 0),
  check (returned_quantity <= original_quantity)
);

create index if not exists sales_returns_sales_order_id_idx on sales_returns(sales_order_id);
create index if not exists sales_returns_lot_id_idx on sales_returns(finished_product_lot_id);
