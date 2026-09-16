-- Supports the automatic delinquency lookup performed whenever clients are listed.
create index if not exists financial_entries_client_receivable_due_date_idx
  on public.financial_entries (client_id, due_date)
  where entry_type = 'Receber' and status <> 'Cancelado';
