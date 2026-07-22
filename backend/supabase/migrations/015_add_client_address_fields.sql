alter table clients
add column if not exists cep text,
add column if not exists neighborhood text;
