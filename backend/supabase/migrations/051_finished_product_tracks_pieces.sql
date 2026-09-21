alter table public.finished_products
add column if not exists tracks_pieces boolean not null default false;

update public.finished_products
set tracks_pieces = true
where category = 'Queijo';
