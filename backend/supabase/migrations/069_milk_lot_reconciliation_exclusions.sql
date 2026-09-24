-- Exceções de reconciliação são explícitas e auditáveis: nunca escondem uma
-- divergência sem identificar o lote e a justificativa.
create table if not exists public.milk_lot_reconciliation_exclusions (
  milk_lot_id uuid primary key references public.milk_lots(id) on delete restrict,
  reason text not null check (length(trim(reason)) >= 3),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id),
  updated_by uuid references public.app_users(id)
);

alter table public.milk_lot_reconciliation_exclusions enable row level security;

insert into public.milk_lot_reconciliation_exclusions (milk_lot_id, reason)
select id, 'Saldo zerado por ajuste manual após validação operacional; não considerar na reconciliação automática.'
from public.milk_lots
where code in ('LT-2026-001', 'LT-2026-002')
on conflict (milk_lot_id) do update
set reason = excluded.reason,
    active = true,
    updated_at = now();
