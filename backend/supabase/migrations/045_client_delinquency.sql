-- A flag maintained by the commercial/financial team. It is intentionally a
-- warning, rather than a sales block: the seller may proceed after reviewing it.
alter table clients
add column if not exists delinquent boolean not null default false;
