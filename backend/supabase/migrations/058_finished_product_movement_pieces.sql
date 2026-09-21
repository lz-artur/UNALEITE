-- Rastreia a medida física em cada venda/devolução. Mantemos nulo para
-- produtos que não controlam peças e para históricos anteriores.
alter table public.sales_order_fulfillments
  add column if not exists pieces_quantity integer null check (pieces_quantity is null or pieces_quantity > 0);

alter table public.sales_returns
  add column if not exists returned_pieces integer null check (returned_pieces is null or returned_pieces > 0);

alter table public.production_order_finished_product_consumptions
  add column if not exists pieces_consumed integer null check (pieces_consumed is null or pieces_consumed > 0);

alter table public.stock_movements
  add column if not exists pieces_quantity integer null check (pieces_quantity is null or pieces_quantity > 0);
