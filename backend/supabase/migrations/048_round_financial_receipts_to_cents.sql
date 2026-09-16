-- A liquidação financeira ocorre em centavos. Títulos antigos podem ter quatro
-- casas por rateio; o resíduo abaixo de um centavo não deve manter o título aberto.
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
  v_entry_amount numeric(14,2);
  v_received numeric(14,2);
  v_receipt_id uuid;
  v_new_status text;
begin
  p_amount := round(p_amount, 2);
  if p_amount is null or p_amount <= 0 then
    raise exception 'O valor do recebimento deve ser maior que zero.';
  end if;
  if nullif(trim(p_payment_method), '') is null then
    raise exception 'A forma de recebimento é obrigatória.';
  end if;

  select * into v_entry from public.financial_entries where id = p_entry_id for update;
  if not found then raise exception 'Lançamento financeiro não encontrado.'; end if;
  if v_entry.status = 'Cancelado' then raise exception 'Não é possível receber um lançamento cancelado.'; end if;

  v_entry_amount := round(v_entry.amount - coalesce(v_entry.discount_amount, 0), 2);
  select round(coalesce(sum(amount), 0), 2) into v_received
  from public.financial_entry_receipts where financial_entry_id = p_entry_id;

  if v_received + p_amount > v_entry_amount then
    raise exception 'O valor informado ultrapassa o saldo a receber.';
  end if;

  insert into public.financial_entry_receipts (financial_entry_id, amount, payment_date, payment_method, bank_account_id, attachment_url, notes, created_by)
  values (p_entry_id, p_amount, coalesce(p_payment_date, now()), trim(p_payment_method), p_bank_account_id, p_attachment_url, nullif(trim(p_notes), ''), p_created_by)
  returning id into v_receipt_id;

  v_received := v_received + p_amount;
  v_new_status := case when v_received >= v_entry_amount then 'Pago' else 'Parcial' end;
  update public.financial_entries
  set status = v_new_status,
      payment_date = case when v_new_status = 'Pago' then coalesce(p_payment_date, now()) else null end,
      updated_at = now(), updated_by = p_created_by
  where id = p_entry_id;
  return v_receipt_id;
end;
$$;

revoke execute on function public.register_financial_receipt(uuid, numeric, timestamptz, text, uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.register_financial_receipt(uuid, numeric, timestamptz, text, uuid, text, text, uuid)
  to service_role;
