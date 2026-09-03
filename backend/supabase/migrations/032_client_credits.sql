-- Add discount_amount to financial_entries for keeping return history
alter table financial_entries 
add column if not exists discount_amount numeric(14,4) not null default 0;

-- Add credit_balance to clients
alter table clients
add column if not exists credit_balance numeric(14,4) not null default 0;

-- Create client_credits table to track history
create table if not exists client_credits (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  amount numeric(14,4) not null, -- positive for credit gained, negative for credit used
  transaction_type text not null check (transaction_type in ('Credit_Earned', 'Credit_Used')),
  reference_type text, -- e.g., 'sales_orders', 'financial_entries'
  reference_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid null
);

-- Index for faster queries on client credits
create index if not exists idx_client_credits_client_id on client_credits(client_id);
