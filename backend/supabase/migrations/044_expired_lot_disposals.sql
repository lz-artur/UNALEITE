-- Solicitações de baixa de lotes vencidos: a saída só ocorre após aprovação.
create table if not exists public.expired_lot_disposals (
  id uuid primary key default gen_random_uuid(),
  lot_type text not null check (lot_type in ('Insumo', 'Produto Acabado')),
  lot_id uuid not null,
  lot_code text not null,
  item_name text not null,
  unit_symbol text,
  quantity numeric(14,4) not null check (quantity > 0),
  unit_cost numeric(14,4) not null default 0,
  total_value numeric(14,4) not null default 0,
  destination text not null check (destination in ('repasse_custo', 'doacao_dre')),
  justification text not null,
  notes text,
  status text not null default 'aguardando_aprovacao' check (status in ('aguardando_aprovacao', 'aprovada', 'recusada')),
  requested_by uuid,
  requested_by_name text not null,
  requested_at timestamptz not null default now(),
  reviewed_by uuid,
  reviewed_by_name text,
  reviewed_at timestamptz,
  review_note text,
  financial_entry_id uuid references public.financial_entries(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists expired_lot_disposals_status_idx on public.expired_lot_disposals(status, requested_at desc);
create unique index if not exists expired_lot_disposals_pending_lot_idx
  on public.expired_lot_disposals(lot_type, lot_id) where status = 'aguardando_aprovacao';

insert into public.accounting_categories (name, entry_type, show_in_dre)
values ('Doações de lotes vencidos', 'Pagar', true), ('Repasses de lotes vencidos', 'Receber', true)
on conflict do nothing;
