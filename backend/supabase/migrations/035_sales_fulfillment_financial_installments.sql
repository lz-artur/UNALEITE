-- Cada atendimento de venda gera sua(s) própria(s) parcela(s). A combinação
-- de grupo e número permite mais de um atendimento parcelado para a mesma venda.
drop index if exists public.financial_entries_reference_unique;

create unique index financial_entries_reference_unique
  on public.financial_entries(
    reference_table,
    reference_id,
    category,
    installment_group_id,
    installment_number
  )
  where reference_table is not null
    and reference_id is not null
    and installment_group_id is not null
    and installment_number is not null;
