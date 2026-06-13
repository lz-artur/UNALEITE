create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name text not null,
  trade_name text,
  document text not null unique,
  state_registration text,
  phone text,
  email text,
  address text,
  city text,
  state text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid null,
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

create table if not exists sales_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  client_id uuid not null references clients(id),
  order_date timestamptz not null,
  due_date timestamptz not null,
  status text not null,
  total_amount numeric(14,4) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid null,
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

create table if not exists sales_order_items (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references sales_orders(id) on delete cascade,
  product_id uuid not null references finished_products(id),
  ordered_quantity numeric(14,4) not null,
  fulfilled_quantity numeric(14,4) not null default 0,
  unit_price numeric(12,4) not null,
  total_value numeric(14,4) not null,
  status text not null default 'Aberto',
  created_at timestamptz not null default now(),
  created_by uuid null,
  updated_at timestamptz not null default now(),
  updated_by uuid null,
  check (ordered_quantity > 0),
  check (fulfilled_quantity >= 0),
  check (fulfilled_quantity <= ordered_quantity)
);

create table if not exists sales_order_fulfillments (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references sales_orders(id) on delete cascade,
  sales_order_item_id uuid not null references sales_order_items(id) on delete cascade,
  finished_product_lot_id uuid not null references finished_product_lots(id),
  quantity numeric(14,4) not null,
  fulfilled_at timestamptz not null,
  created_at timestamptz not null default now(),
  created_by uuid null,
  updated_at timestamptz not null default now(),
  updated_by uuid null,
  check (quantity > 0)
);

create index if not exists clients_document_idx
  on clients(document);

create index if not exists sales_orders_client_id_idx
  on sales_orders(client_id);

create index if not exists sales_orders_status_idx
  on sales_orders(status);

create index if not exists sales_order_items_sales_order_id_idx
  on sales_order_items(sales_order_id);

create index if not exists sales_order_items_product_id_idx
  on sales_order_items(product_id);

create index if not exists sales_order_fulfillments_sales_order_id_idx
  on sales_order_fulfillments(sales_order_id);

create index if not exists sales_order_fulfillments_lot_id_idx
  on sales_order_fulfillments(finished_product_lot_id);
