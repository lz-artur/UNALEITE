alter table public.finished_product_manual_exits
add column if not exists pieces integer null check (pieces is null or pieces > 0);
