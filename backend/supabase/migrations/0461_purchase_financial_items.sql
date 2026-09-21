-- Mantém a origem do rateio para que Contas a Pagar mostre cada produto da compra.
alter table public.financial_entry_items
  add column if not exists supply_item_id uuid references public.supply_items(id);

create index if not exists financial_entry_items_supply_item_id_idx
  on public.financial_entry_items(supply_item_id);
