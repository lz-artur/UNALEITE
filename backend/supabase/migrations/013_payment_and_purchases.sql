-- Tabela de Formas de Pagamento (ex: Pix, Dinheiro, Boleto)
create table if not exists payment_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid null,
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

-- Tabela de Tipos de Pagamento (ex: À vista, A prazo)
create table if not exists payment_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid null,
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

-- Popular dados iniciais para Formas de Pagamento
INSERT INTO payment_methods (name) VALUES
('Pix'),
('Dinheiro'),
('Boleto'),
('Transferência Bancária')
ON CONFLICT DO NOTHING;

-- Popular dados iniciais para Tipos de Pagamento
INSERT INTO payment_types (name) VALUES
('À vista'),
('Dividido/A prazo')
ON CONFLICT DO NOTHING;

-- Adicionar colunas contábeis e financeiras na tabela purchases
ALTER TABLE public.purchases
ADD COLUMN IF NOT EXISTS payment_method_id uuid references payment_methods(id),
ADD COLUMN IF NOT EXISTS payment_type_id uuid references payment_types(id),
ADD COLUMN IF NOT EXISTS cost_center_id uuid references cost_centers(id),
ADD COLUMN IF NOT EXISTS accounting_category_id uuid references accounting_categories(id),
ADD COLUMN IF NOT EXISTS accounting_subcategory_id uuid references accounting_subcategories(id),
ADD COLUMN IF NOT EXISTS bank_account_id uuid references bank_accounts(id);
