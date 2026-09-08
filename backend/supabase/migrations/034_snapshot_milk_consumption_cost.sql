-- The price paid for milk is an operational fact at the time it is consumed.
-- Keep it on the consumption record so later corrections to a reception do not
-- change a production order's historical cost.
alter table production_order_milk_consumptions
  add column if not exists unit_cost numeric(12,4);

-- Preserve the currently registered operational cost for every historical
-- consumption.  Legacy rows without a cost stay null and can still use the
-- legacy pricing fallback in the report.
update production_order_milk_consumptions as consumption
set unit_cost = lot.cost_per_liter
from milk_lots as lot
where lot.id = consumption.milk_lot_id
  and consumption.unit_cost is null
  and lot.cost_per_liter is not null;

comment on column production_order_milk_consumptions.unit_cost is
  'Cost per liter captured when the milk lot was consumed in production.';
