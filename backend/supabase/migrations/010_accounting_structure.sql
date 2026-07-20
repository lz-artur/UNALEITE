-- Tabela de Centros de Custo
create table if not exists cost_centers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid null,
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

-- Tabela de Contas Bancárias (preparada para emissão de boletos e NFe)
create table if not exists bank_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  bank_name text,
  agency text,
  agency_digit text,
  account_number text,
  account_digit text,
  document_type text, -- 'CPF' ou 'CNPJ'
  document_number text,
  pix_key text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid null,
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

-- Tabela de Categorias Contábeis
create table if not exists accounting_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  entry_type text not null, -- 'Receber' ou 'Pagar'
  show_in_dre boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid null,
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

-- Tabela de Subcategorias Contábeis
create table if not exists accounting_subcategories (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references accounting_categories(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid null,
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

-- Adicionar relacionamentos na tabela financial_entries
ALTER TABLE public.financial_entries
ADD COLUMN IF NOT EXISTS cost_center_id uuid references cost_centers(id),
ADD COLUMN IF NOT EXISTS bank_account_id uuid references bank_accounts(id),
ADD COLUMN IF NOT EXISTS accounting_category_id uuid references accounting_categories(id),
ADD COLUMN IF NOT EXISTS accounting_subcategory_id uuid references accounting_subcategories(id);

-- Popular dados iniciais básicos
INSERT INTO accounting_categories (name, entry_type, show_in_dre) VALUES
('Fornecedores', 'Pagar', true),
('Insumos', 'Pagar', true),
('Matéria Prima', 'Pagar', true),
('Folha de Pagamento', 'Pagar', true),
('Impostos', 'Pagar', true),
('Utilidades', 'Pagar', true),
('Manutenção', 'Pagar', true),
('Outros', 'Pagar', true),
('Vendas', 'Receber', true),
('Rendimentos', 'Receber', true),
('Serviços', 'Receber', true),
('Outros', 'Receber', true)
ON CONFLICT DO NOTHING;
