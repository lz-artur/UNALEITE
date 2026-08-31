-- Histórico de recebimentos/pagamentos parciais de um lançamento financeiro.
-- O lançamento continua representando o valor total da obrigação; cada baixa
-- passa a ser registrada separadamente com sua própria forma, conta e data.
create table if not exists public.financial_entry_receipts (
  id uuid primary key default gen_random_uuid(),
  financial_entry_id uuid not null references public.financial_entries(id) on delete cascade,
  amount numeric(14,4) not null check (amount > 0),
  payment_date timestamptz not null default now(),
  payment_method text not null,
  bank_account_id uuid references public.bank_accounts(id),
  attachment_url text,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid null,
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

alter table public.financial_entry_receipts enable row level security;

create index if not exists financial_entry_receipts_entry_id_idx
  on public.financial_entry_receipts(financial_entry_id);

create index if not exists financial_entry_receipts_payment_date_idx
  on public.financial_entry_receipts(payment_date);

-- Converte baixas integrais antigas para o novo histórico sem duplicá-las.
insert into public.financial_entry_receipts (
  financial_entry_id,
  amount,
  payment_date,
  payment_method,
  bank_account_id,
  attachment_url,
  created_at,
  created_by
)
select
  fe.id,
  fe.amount,
  coalesce(fe.payment_date, fe.updated_at, now()),
  coalesce(nullif(fe.payment_method, ''), 'Não informado'),
  fe.bank_account_id,
  fe.attachment_url,
  coalesce(fe.updated_at, fe.created_at, now()),
  fe.updated_by
from public.financial_entries fe
where fe.status = 'Pago'
  and not exists (
    select 1
    from public.financial_entry_receipts fer
    where fer.financial_entry_id = fe.id
  );

-- Registra uma baixa com bloqueio da obrigação para impedir recebimentos
-- concorrentes que ultrapassem o valor do lançamento.
create or replace function public.register_financial_receipt(
  p_entry_id uuid,
  p_amount numeric,
  p_payment_date timestamptz,
  p_payment_method text,
  p_bank_account_id uuid default null,
  p_attachment_url text default null,
  p_notes text default null,
  p_created_by uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry public.financial_entries%rowtype;
  v_received numeric(14,4);
  v_receipt_id uuid;
  v_new_status text;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'O valor do recebimento deve ser maior que zero.';
  end if;

  if nullif(trim(p_payment_method), '') is null then
    raise exception 'A forma de recebimento é obrigatória.';
  end if;

  select * into v_entry
  from public.financial_entries
  where id = p_entry_id
  for update;

  if not found then
    raise exception 'Lançamento financeiro não encontrado.';
  end if;

  if v_entry.status = 'Cancelado' then
    raise exception 'Não é possível receber um lançamento cancelado.';
  end if;

  select coalesce(sum(amount), 0) into v_received
  from public.financial_entry_receipts
  where financial_entry_id = p_entry_id;

  if v_received + p_amount > v_entry.amount then
    raise exception 'O valor informado ultrapassa o saldo a receber.';
  end if;

  insert into public.financial_entry_receipts (
    financial_entry_id, amount, payment_date, payment_method,
    bank_account_id, attachment_url, notes, created_by
  ) values (
    p_entry_id, p_amount, coalesce(p_payment_date, now()), trim(p_payment_method),
    p_bank_account_id, p_attachment_url, nullif(trim(p_notes), ''), p_created_by
  ) returning id into v_receipt_id;

  v_received := v_received + p_amount;
  v_new_status := case when v_received >= v_entry.amount then 'Pago' else 'Parcial' end;

  update public.financial_entries
  set status = v_new_status,
      payment_date = case when v_new_status = 'Pago' then coalesce(p_payment_date, now()) else null end,
      updated_at = now(),
      updated_by = p_created_by
  where id = p_entry_id;

  return v_receipt_id;
end;
$$;

revoke execute on function public.register_financial_receipt(uuid, numeric, timestamptz, text, uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.register_financial_receipt(uuid, numeric, timestamptz, text, uuid, text, text, uuid)
  to service_role;

create or replace function public.delete_financial_receipt(
  p_entry_id uuid,
  p_receipt_id uuid,
  p_updated_by uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry public.financial_entries%rowtype;
  v_received numeric(14,4);
  v_last_payment_date timestamptz;
begin
  select * into v_entry
  from public.financial_entries
  where id = p_entry_id
  for update;

  if not found then
    raise exception 'Lançamento financeiro não encontrado.';
  end if;

  delete from public.financial_entry_receipts
  where id = p_receipt_id and financial_entry_id = p_entry_id;

  if not found then
    raise exception 'Recebimento não encontrado.';
  end if;

  select coalesce(sum(amount), 0), max(payment_date)
  into v_received, v_last_payment_date
  from public.financial_entry_receipts
  where financial_entry_id = p_entry_id;

  update public.financial_entries
  set status = case
        when v_received = 0 then 'Aberto'
        when v_received >= amount then 'Pago'
        else 'Parcial'
      end,
      payment_date = case when v_received >= amount then v_last_payment_date else null end,
      updated_at = now(),
      updated_by = p_updated_by
  where id = p_entry_id;
end;
$$;

revoke execute on function public.delete_financial_receipt(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.delete_financial_receipt(uuid, uuid, uuid)
  to service_role;

-- Um lançamento com histórico financeiro não pode ter seu total reduzido
-- para menos do que já foi efetivamente recebido.
create or replace function public.validate_financial_entry_amount()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_received numeric(14,4);
begin
  select coalesce(sum(amount), 0) into v_received
  from public.financial_entry_receipts
  where financial_entry_id = new.id;

  if new.amount is distinct from old.amount then
    if new.amount < v_received then
      raise exception 'O valor total não pode ser menor que o valor já recebido.';
    end if;
  end if;

  if v_received > 0 then
    new.status := case when new.amount = v_received then 'Pago' else 'Parcial' end;
    if new.status <> 'Pago' then
      new.payment_date := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists validate_financial_entry_amount_trigger on public.financial_entries;
create trigger validate_financial_entry_amount_trigger
before update of amount, status on public.financial_entries
for each row execute function public.validate_financial_entry_amount();

-- Mantém os indicadores do dashboard baseados no saldo, e não no valor
-- original inteiro de títulos parcialmente liquidados.
create or replace function public.get_dashboard_summary()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  summary json;
begin
  select json_build_object(
    'milkReceivedMonth', (
      select coalesce(sum(volume_liters), 0) from milk_lots
      where date_trunc('month', received_at) = date_trunc('month', now())
    ),
    'approvedLots', (select count(*) from milk_lots where status = 'Aprovado'),
    'blockedLots', (select count(*) from milk_lots where status = 'Bloqueado'),
    'pendingAnalysisCount', (
      select count(*) from milk_lots where status in ('Aguardando Análise', 'Aguardando Analise')
    ),
    'openOrders', (select count(*) from production_orders where status = 'Em Andamento'),
    'finishedOrders', (select count(*) from production_orders where status = 'Finalizada'),
    'averageCostPerLiter', (
      select coalesce(sum(cost_per_liter) / nullif(count(cost_per_liter), 0), 0)
      from milk_lots where cost_per_liter is not null
    ),
    'averageCostPerKg', (
      select coalesce(sum(ml.cost_per_liter * po.liters_planned) / nullif(sum(po.actual_quantity_produced), 0), 0)
      from production_orders po
      join milk_lots ml on ml.id = po.milk_lot_id
      where po.status = 'Finalizada' and po.actual_quantity_produced is not null
    ),
    'accountsPayable', (
      select coalesce(sum(greatest(fe.amount - coalesce(r.received, 0), 0)), 0)
      from financial_entries fe
      left join (
        select financial_entry_id, sum(amount) received
        from financial_entry_receipts group by financial_entry_id
      ) r on r.financial_entry_id = fe.id
      where fe.entry_type = 'Pagar' and fe.status <> 'Cancelado'
    ),
    'accountsReceivable', (
      select coalesce(sum(greatest(fe.amount - coalesce(r.received, 0), 0)), 0)
      from financial_entries fe
      left join (
        select financial_entry_id, sum(amount) received
        from financial_entry_receipts group by financial_entry_id
      ) r on r.financial_entry_id = fe.id
      where fe.entry_type = 'Receber' and fe.status <> 'Cancelado'
    ),
    'milkPayroll', (
      select coalesce(sum(amount), 0) from financial_entries
      where upper(category) like '%MATÉRIA-PRIMA%' or upper(category) like '%MATÉRIA PRIMA%'
    ),
    'overdueEntries', (
      select count(*)
      from financial_entries fe
      left join (
        select financial_entry_id, sum(amount) received
        from financial_entry_receipts group by financial_entry_id
      ) r on r.financial_entry_id = fe.id
      where fe.status <> 'Cancelado'
        and fe.due_date < now()
        and fe.amount > coalesce(r.received, 0)
    ),
    'overdueAmount', (
      select coalesce(sum(greatest(fe.amount - coalesce(r.received, 0), 0)), 0)
      from financial_entries fe
      left join (
        select financial_entry_id, sum(amount) received
        from financial_entry_receipts group by financial_entry_id
      ) r on r.financial_entry_id = fe.id
      where fe.status <> 'Cancelado'
        and fe.due_date < now()
    ),
    'lowStockItemsCount', (select count(*) from supply_items where current_stock < minimum_stock),
    'analysesCount', (select count(*) from milk_lot_analyses)
  ) into summary;

  return summary;
end;
$$;
