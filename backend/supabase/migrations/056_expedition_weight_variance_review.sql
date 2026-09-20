-- A expedição pode propor um peso diferente do solicitado, dentro da
-- tolerância do produto. A decisão comercial fica registrada na expedição.
alter table public.sale_expeditions
  add column if not exists has_weight_variance boolean not null default false,
  add column if not exists commercial_decision text check (commercial_decision in ('aceita', 'recusada')),
  add column if not exists commercial_decided_at timestamptz,
  add column if not exists commercial_decided_by uuid,
  add column if not exists commercial_note text;

alter table public.sale_expeditions
  drop constraint if exists sale_expeditions_status_check;
alter table public.sale_expeditions
  add constraint sale_expeditions_status_check check (status in ('em_pesagem', 'aguardando_aceite_comercial', 'expedida', 'cancelada', 'recusada_comercial'));

create table if not exists public.sale_expedition_variances (
  id uuid primary key default gen_random_uuid(),
  expedition_id uuid not null references public.sale_expeditions(id) on delete cascade,
  sales_order_item_id uuid not null references public.sales_order_items(id),
  ordered_quantity numeric(14,4) not null,
  weighed_quantity numeric(14,4) not null,
  variance_quantity numeric(14,4) not null,
  variance_percent numeric(10,4) not null,
  allowed_percent numeric(7,4) not null,
  created_at timestamptz not null default now(),
  unique (expedition_id, sales_order_item_id)
);
