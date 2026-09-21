-- Homologação e produção possuem sequências independentes. A operação decidiu
-- iniciar a série 2 de produção no número 41, preservando as notas de teste.
update public.nfe_configs
set initial_number = greatest(coalesce(initial_number, 1), 41),
    updated_at = now()
where regexp_replace(cnpj, '\D', '', 'g') = '55219063000125'
  and environment = 'producao'
  and series = 2;

insert into public.nfe_number_sequences (
  issuer_cnpj,
  environment,
  model,
  series,
  next_number
)
values ('55219063000125', 'producao', 55, 2, 41)
on conflict (issuer_cnpj, environment, model, series)
do update set
  next_number = greatest(public.nfe_number_sequences.next_number, excluded.next_number),
  updated_at = now();

-- Libera apenas a tentativa de produção rejeitada por duplicidade. Na próxima
-- autorização ela reservará o número 41; a NF-e 40 de homologação não é tocada.
update public.nfe_invoices
set number = null,
    numeric_code = null,
    access_key = null,
    issued_at = null,
    protocol_number = null,
    status = 'VALIDADA',
    rejection_code = null,
    rejection_reason = null,
    updated_at = now()
where id = 'ef1cbcbe-059e-4933-995e-09fdd813a8f5'
  and environment = 'producao'
  and series = 2
  and number = 30
  and protocol_number is null
  and status in ('RASCUNHO', 'VALIDADA', 'REJEITADA');
