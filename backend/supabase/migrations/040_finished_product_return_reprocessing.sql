-- The origin keeps commercial stock and returned stock separate in a production order.
alter table production_order_finished_product_consumptions
  add column if not exists consumption_source text not null default 'Disponivel'
  check (consumption_source in ('Disponivel', 'Devolucao'));

create index if not exists production_order_finished_product_consumptions_source_idx
  on production_order_finished_product_consumptions(production_order_id, consumption_source);
