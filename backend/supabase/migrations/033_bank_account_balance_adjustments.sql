-- Ajustes de saldo são exceções operacionais e precisam permanecer auditáveis.
create table if not exists public.bank_account_balance_adjustments (
  id uuid primary key default gen_random_uuid(),
  bank_account_id uuid not null references public.bank_accounts(id),
  financial_entry_id uuid not null references public.financial_entries(id),
  balance_before numeric(14,4) not null,
  target_balance numeric(14,4) not null,
  adjustment_amount numeric(14,4) not null,
  justification text not null,
  manager_approval text not null,
  effective_date timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid null
);

alter table public.bank_account_balance_adjustments enable row level security;

create index if not exists bank_account_balance_adjustments_account_idx
  on public.bank_account_balance_adjustments(bank_account_id, effective_date desc);

insert into public.accounting_categories (name, entry_type, show_in_dre)
values ('Ajuste de Saldo', 'Ajuste', false)
on conflict do nothing;
