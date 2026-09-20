-- Produtos vendidos por peças podem exigir a dupla conferência: quantidade
-- física de peças e peso em KG. A tolerância pertence ao produto, evitando
-- regras diferentes para o mesmo item entre pedidos.
alter table public.finished_products
  add column if not exists tracks_quantity_and_weight boolean not null default false,
  add column if not exists weight_variance_percent numeric(7,4) not null default 0
    check (weight_variance_percent >= 0 and weight_variance_percent <= 100);

-- Mantém o comportamento dos queijos já cadastrados: quem já controla peças
-- passa a exigir a conferência das duas medidas nas novas movimentações.
update public.finished_products
set tracks_quantity_and_weight = true
where tracks_pieces = true;

comment on column public.finished_products.tracks_quantity_and_weight is
  'Exige quantidade física (peças) e peso em toda movimentação do produto acabado.';
comment on column public.finished_products.weight_variance_percent is
  'Variação percentual máxima de peso aceita na expedição, para mais ou para menos.';
