create table if not exists financial_entry_items (
  id uuid primary key default gen_random_uuid(),
  financial_entry_id uuid not null references financial_entries(id) on delete cascade,
  amount numeric(14,4) not null,
  cost_center_id uuid references cost_centers(id),
  accounting_category_id uuid references accounting_categories(id),
  accounting_subcategory_id uuid references accounting_subcategories(id),
  cost_type text,
  created_at timestamptz not null default now(),
  created_by uuid null,
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

create index if not exists financial_entry_items_entry_id_idx on financial_entry_items(financial_entry_id);
create index if not exists financial_entry_items_category_id_idx on financial_entry_items(accounting_category_id);
create index if not exists financial_entry_items_cost_center_idx on financial_entry_items(cost_center_id);
