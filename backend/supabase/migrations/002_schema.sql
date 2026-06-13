create table if not exists units (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  symbol text not null,
  unit_type text not null,
  decimals integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid null,
  updated_at timestamptz not null default now(),
  updated_by uuid null,
  unique (name),
  unique (symbol)
);

create table if not exists stock_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  stock_type text not null,
  capacity numeric(14,3),
  capacity_unit_id uuid references units(id),
  ideal_temperature numeric(6,2),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid null,
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

create table if not exists transporters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  document text not null unique,
  driver_name text,
  vehicle_plate text,
  vehicle_type text,
  capacity numeric(14,3),
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid null,
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

create table if not exists routes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  region text,
  default_driver text,
  default_transporter_id uuid references transporters(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid null,
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

create table if not exists producers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  document text not null unique,
  farm_name text not null,
  route_id uuid references routes(id),
  phone text not null,
  email text,
  address text,
  banking_data text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid null,
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

create table if not exists milk_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  unit_id uuid not null references units(id),
  max_usage_hours integer not null,
  ideal_reception_temperature numeric(6,2),
  max_reception_temperature numeric(6,2) not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid null,
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

create table if not exists quality_parameters (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  data_type text not null,
  unit_label text,
  min_value numeric(14,4),
  max_value numeric(14,4),
  required boolean not null default false,
  auto_block boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid null,
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

create table if not exists milk_price_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null,
  end_date date not null,
  base_price numeric(12,4) not null,
  fat_bonus numeric(12,4) not null default 0,
  protein_bonus numeric(12,4) not null default 0,
  acidity_penalty numeric(12,4) not null default 0,
  cbt_penalty numeric(12,4) not null default 0,
  ccs_penalty numeric(12,4) not null default 0,
  temperature_penalty numeric(12,4) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid null,
  updated_at timestamptz not null default now(),
  updated_by uuid null,
  check (end_date >= start_date),
  exclude using gist (
    daterange(start_date, end_date, '[]') with &&
  ) where (active)
);

create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  document text not null unique,
  supplier_type text not null,
  phone text,
  email text,
  address text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid null,
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

create table if not exists supply_items (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  category text not null,
  unit_id uuid not null references units(id),
  minimum_stock numeric(14,3) not null default 0,
  default_supplier_id uuid references suppliers(id),
  tracks_expiration boolean not null default false,
  tracks_lot boolean not null default true,
  default_cost numeric(12,4) not null default 0,
  current_stock numeric(14,3) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid null,
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

create table if not exists finished_products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  category text not null,
  unit_id uuid not null references units(id),
  standard_weight numeric(14,3),
  shelf_life_days integer not null,
  storage_temperature numeric(6,2),
  theoretical_yield numeric(14,4) not null,
  production_line text,
  sale_price numeric(12,4),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid null,
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

create table if not exists product_specs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references finished_products(id),
  standard_milk_amount numeric(14,4) not null,
  ideal_fat numeric(8,4),
  ideal_protein numeric(8,4),
  theoretical_yield numeric(14,4) not null,
  expected_loss numeric(14,4),
  production_notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid null,
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

create unique index if not exists product_specs_active_unique
  on product_specs(product_id)
  where active;

create table if not exists product_spec_items (
  id uuid primary key default gen_random_uuid(),
  product_spec_id uuid not null references product_specs(id) on delete cascade,
  supply_item_id uuid not null references supply_items(id),
  quantity numeric(14,4) not null,
  unit_id uuid not null references units(id),
  created_at timestamptz not null default now(),
  created_by uuid null,
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

create unique index if not exists product_spec_items_unique
  on product_spec_items(product_spec_id, supply_item_id);

create table if not exists block_reasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  target_type text not null,
  auto_block boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid null,
  updated_at timestamptz not null default now(),
  updated_by uuid null,
  unique (name, target_type)
);

create table if not exists supply_lots (
  id uuid primary key default gen_random_uuid(),
  supply_item_id uuid not null references supply_items(id),
  supplier_id uuid not null references suppliers(id),
  supplier_lot_number text,
  internal_lot_code text not null unique,
  entry_date timestamptz not null,
  manufacture_date date,
  expiration_date date,
  received_quantity numeric(14,4) not null,
  available_quantity numeric(14,4) not null,
  unit_cost numeric(12,4) not null,
  total_value numeric(14,4) not null,
  location_id uuid not null references stock_locations(id),
  status text not null,
  block_reason_id uuid references block_reasons(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid null,
  updated_at timestamptz not null default now(),
  updated_by uuid null,
  check (received_quantity > 0),
  check (available_quantity >= 0),
  check (available_quantity <= received_quantity)
);

create table if not exists milk_receptions (
  id uuid primary key default gen_random_uuid(),
  producer_id uuid not null references producers(id),
  route_id uuid not null references routes(id),
  transporter_id uuid not null references transporters(id),
  milk_type_id uuid not null references milk_types(id),
  volume_liters numeric(14,4) not null,
  temperature numeric(6,2) not null,
  received_at timestamptz not null,
  created_at timestamptz not null default now(),
  created_by uuid null,
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

create table if not exists milk_lots (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  milk_reception_id uuid not null references milk_receptions(id),
  producer_id uuid not null references producers(id),
  route_id uuid not null references routes(id),
  transporter_id uuid not null references transporters(id),
  milk_type_id uuid not null references milk_types(id),
  volume_liters numeric(14,4) not null,
  available_volume_liters numeric(14,4) not null,
  temperature numeric(6,2) not null,
  received_at timestamptz not null,
  status text not null,
  latest_analysis_id uuid,
  cost_per_liter numeric(12,4),
  total_value numeric(14,4),
  created_at timestamptz not null default now(),
  created_by uuid null,
  updated_at timestamptz not null default now(),
  updated_by uuid null,
  check (available_volume_liters >= 0),
  check (available_volume_liters <= volume_liters)
);

create table if not exists milk_lot_analyses (
  id uuid primary key default gen_random_uuid(),
  milk_lot_id uuid not null references milk_lots(id),
  analyzed_at timestamptz not null,
  alizarol text not null,
  acidez numeric(12,4),
  crioscopia numeric(12,4),
  densidade numeric(12,4),
  antibioticos text not null,
  gordura numeric(12,4),
  proteina numeric(12,4),
  cbt numeric(14,4),
  ccs numeric(14,4),
  temperatura numeric(12,4),
  approved boolean not null,
  observacoes text,
  created_at timestamptz not null default now(),
  created_by uuid null,
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

create table if not exists milk_lot_pricing (
  id uuid primary key default gen_random_uuid(),
  milk_lot_id uuid not null references milk_lots(id),
  producer_id uuid not null references producers(id),
  milk_price_rule_id uuid not null references milk_price_rules(id),
  base_price numeric(12,4) not null,
  fat_bonus numeric(12,4) not null default 0,
  protein_bonus numeric(12,4) not null default 0,
  acidity_penalty numeric(12,4) not null default 0,
  cbt_penalty numeric(12,4) not null default 0,
  ccs_penalty numeric(12,4) not null default 0,
  temperature_penalty numeric(12,4) not null default 0,
  final_price numeric(12,4) not null,
  total_value numeric(14,4) not null,
  created_at timestamptz not null default now(),
  created_by uuid null,
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

create table if not exists production_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  milk_lot_id uuid not null references milk_lots(id),
  product_id uuid not null references finished_products(id),
  liters_planned numeric(14,4) not null,
  expected_yield numeric(14,4),
  fat_adjustment_kg numeric(14,4),
  actual_quantity_produced numeric(14,4),
  actual_yield numeric(14,4),
  status text not null,
  started_at timestamptz not null,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid null,
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

create table if not exists production_order_milk_consumptions (
  id uuid primary key default gen_random_uuid(),
  production_order_id uuid not null references production_orders(id) on delete cascade,
  milk_lot_id uuid not null references milk_lots(id),
  liters_consumed numeric(14,4) not null,
  created_at timestamptz not null default now(),
  created_by uuid null,
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

create table if not exists production_order_supply_consumptions (
  id uuid primary key default gen_random_uuid(),
  production_order_id uuid not null references production_orders(id) on delete cascade,
  supply_lot_id uuid not null references supply_lots(id),
  quantity_consumed numeric(14,4) not null,
  created_at timestamptz not null default now(),
  created_by uuid null,
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

create table if not exists finished_product_lots (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references finished_products(id),
  production_order_id uuid not null references production_orders(id),
  lot_code text not null unique,
  quantity_produced numeric(14,4) not null,
  available_quantity numeric(14,4) not null,
  produced_at timestamptz not null,
  expiration_date timestamptz not null,
  storage_location_id uuid not null references stock_locations(id),
  created_at timestamptz not null default now(),
  created_by uuid null,
  updated_at timestamptz not null default now(),
  updated_by uuid null,
  check (available_quantity >= 0),
  check (available_quantity <= quantity_produced)
);

create table if not exists stock_movements (
  id uuid primary key default gen_random_uuid(),
  movement_type text not null,
  lot_type text not null,
  lot_id uuid not null,
  quantity numeric(14,4) not null,
  reference_table text,
  reference_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid null,
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

create table if not exists financial_entries (
  id uuid primary key default gen_random_uuid(),
  entry_type text not null,
  description text not null,
  amount numeric(14,4) not null,
  due_date timestamptz not null,
  payment_date timestamptz,
  status text not null,
  category text not null,
  supplier_id uuid references suppliers(id),
  client_id uuid,
  producer_id uuid references producers(id),
  reference_table text,
  reference_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid null,
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

create unique index if not exists financial_entries_reference_unique
  on financial_entries(reference_table, reference_id, category)
  where reference_table is not null and reference_id is not null;

create table if not exists lot_block_events (
  id uuid primary key default gen_random_uuid(),
  lot_type text not null,
  lot_id uuid not null,
  block_reason_id uuid references block_reasons(id),
  reason_snapshot text not null,
  automatic boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid null,
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

drop view if exists supply_lots_with_item;

create view supply_lots_with_item as
select
  sl.*,
  si.name as supply_item_name,
  si.category as supply_item_category,
  si.minimum_stock
from supply_lots sl
join supply_items si on si.id = sl.supply_item_id;
