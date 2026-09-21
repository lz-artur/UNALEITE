-- Inventário agendado: o administrador define o responsável e a janela de
-- contagem. O saldo do sistema permanece oculto ao contador operacional.
alter table public.inventory_sessions
  add column if not exists assigned_to uuid,
  add column if not exists assigned_to_name text,
  add column if not exists available_from timestamptz,
  add column if not exists available_until timestamptz,
  add column if not exists include_zero_balance_lots boolean not null default false;

update public.inventory_sessions
set assigned_to = created_by,
    assigned_to_name = coalesce(assigned_to_name, created_by_name),
    available_from = coalesce(available_from, started_at),
    available_until = coalesce(available_until, started_at + interval '24 hours')
where assigned_to is null or available_from is null or available_until is null;

alter table public.inventory_sessions
  alter column assigned_to set not null,
  alter column assigned_to_name set not null,
  alter column available_from set not null,
  alter column available_until set not null;

alter table public.inventory_sessions
  drop constraint if exists inventory_sessions_available_window_check;
alter table public.inventory_sessions
  add constraint inventory_sessions_available_window_check check (available_until > available_from);

create index if not exists idx_inventory_sessions_assignee_open
  on public.inventory_sessions (assigned_to, available_from)
  where status = 'em_contagem';
