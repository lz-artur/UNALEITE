alter table clients
add column if not exists address_number text;

alter table sales_orders
add column if not exists delivery_date date;

alter table financial_entries
add column if not exists payment_method text,
add column if not exists installments integer;
