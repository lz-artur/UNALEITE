-- A expedição confirma quantidades e baixa estoque; a venda só é encerrada
-- depois de o Comercial informar as condições de recebimento.

create table if not exists public.sales_order_financial_finalizations (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null unique references public.sales_orders(id) on delete cascade,
  payment_method text not null,
  bank_account_id uuid not null references public.bank_accounts(id),
  finalized_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);

create or replace function public.confirm_sale_expedition(
  p_expedition_id uuid,
  p_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expedition public.sale_expeditions%rowtype;
  v_order public.sales_orders%rowtype;
  v_line record; v_lot public.finished_product_lots%rowtype; v_order_item public.sales_order_items%rowtype;
  v_attendance_id uuid; v_attendance_number text; v_attendance_count integer;
  v_total numeric(14,4) := 0; v_progress jsonb := '{}'::jsonb;
  v_planned numeric(14,4); v_pending numeric(14,4); v_key text; v_extra numeric(14,4);
  v_all_conferred boolean; v_any_conferred boolean; v_status text;
begin
  select * into v_expedition from public.sale_expeditions where id = p_expedition_id for update;
  if not found then raise exception 'Expedição não encontrada'; end if;
  if v_expedition.status = 'expedida' then return v_expedition.attendance_id; end if;
  if v_expedition.status <> 'em_pesagem' then raise exception 'Esta expedição não pode ser confirmada'; end if;

  select * into v_order from public.sales_orders where id = v_expedition.sales_order_id for update;
  if not found or v_order.status in ('Atendido', 'Conferido', 'Cancelado') then
    raise exception 'O pedido não está disponível para expedição';
  end if;

  select count(*) into v_attendance_count from public.sale_attendances where sales_order_id = v_expedition.sales_order_id;
  v_attendance_number := 'EXP-' || (v_attendance_count + 1);
  insert into public.sale_attendances (sales_order_id, attendance_number, fulfilled_at, total_value, status, notes, created_by, updated_by)
  values (v_expedition.sales_order_id, v_attendance_number, now(), 0, 'Concluído', 'Expedição ' || v_expedition.expedition_number, p_user_id, p_user_id)
  returning id into v_attendance_id;

  for v_line in
    select l.id, l.sales_order_item_id, l.finished_product_lot_id, coalesce(sum(w.quantity), 0)::numeric(14,4) quantity
    from public.sale_expedition_lines l left join public.sale_expedition_weighings w on w.expedition_line_id = l.id
    where l.expedition_id = p_expedition_id group by l.id, l.sales_order_item_id, l.finished_product_lot_id
  loop
    if v_line.quantity <= 0 then continue; end if;
    select * into v_lot from public.finished_product_lots where id = v_line.finished_product_lot_id for update;
    if not found then raise exception 'Lote de produto não encontrado'; end if;
    if v_line.quantity > v_lot.available_quantity then raise exception 'O lote % não possui saldo suficiente para a expedição', v_lot.lot_code; end if;
    select * into v_order_item from public.sales_order_items where id = v_line.sales_order_item_id and sales_order_id = v_expedition.sales_order_id for update;
    if not found or v_order_item.product_id <> v_lot.product_id then raise exception 'O lote não pertence ao item expedido'; end if;
    v_key := v_line.sales_order_item_id::text; v_planned := coalesce((v_progress ->> v_key)::numeric, 0);
    v_pending := v_order_item.ordered_quantity - v_order_item.fulfilled_quantity - v_planned;
    if v_line.quantity > v_pending then raise exception 'A expedição excede a quantidade pendente do item'; end if;
    v_progress := jsonb_set(v_progress, array[v_key], to_jsonb(round(v_planned + v_line.quantity, 4)));
    v_total := v_total + round(v_line.quantity * v_order_item.unit_price, 4);
    insert into public.sales_order_fulfillments (sales_order_id, sales_order_item_id, finished_product_lot_id, attendance_id, quantity, fulfilled_at, created_by, updated_by)
    values (v_expedition.sales_order_id, v_line.sales_order_item_id, v_line.finished_product_lot_id, v_attendance_id, v_line.quantity, now(), p_user_id, p_user_id);
    update public.finished_product_lots set available_quantity = round(available_quantity - v_line.quantity, 4), updated_at = now(), updated_by = p_user_id where id = v_line.finished_product_lot_id;
    insert into public.stock_movements (movement_type, lot_type, lot_id, quantity, reference_table, reference_id, created_by, updated_by)
    values ('saida', 'Produto Acabado', v_line.finished_product_lot_id, v_line.quantity, 'sale_expeditions', p_expedition_id, p_user_id, p_user_id);
  end loop;
  if v_total <= 0 then raise exception 'Registre ao menos uma pesagem antes de confirmar a expedição'; end if;

  for v_key, v_extra in select key, value::text::numeric from jsonb_each(v_progress) loop
    select * into v_order_item from public.sales_order_items where id = v_key::uuid;
    insert into public.sale_attendance_items (attendance_id, sales_order_item_id, quantity, unit_price, total_value)
    values (v_attendance_id, v_key::uuid, v_extra, v_order_item.unit_price, round(v_extra * v_order_item.unit_price, 4));
    update public.sales_order_items set fulfilled_quantity = round(fulfilled_quantity + v_extra, 4),
      status = case when fulfilled_quantity + v_extra >= ordered_quantity then 'Conferido' else 'Parcialmente Conferido' end,
      updated_at = now(), updated_by = p_user_id where id = v_key::uuid;
  end loop;
  select bool_and(fulfilled_quantity >= ordered_quantity), bool_or(fulfilled_quantity > 0) into v_all_conferred, v_any_conferred from public.sales_order_items where sales_order_id = v_expedition.sales_order_id;
  v_status := case when v_all_conferred then 'Conferido' when v_any_conferred then 'Parcialmente Conferido' else 'Aberto' end;
  update public.sale_attendances set total_value = v_total where id = v_attendance_id;
  update public.sales_orders set status = v_status, updated_at = now(), updated_by = p_user_id where id = v_expedition.sales_order_id;
  update public.sale_expeditions set status = 'expedida', attendance_id = v_attendance_id, dispatched_at = now(), updated_at = now(), updated_by = p_user_id where id = p_expedition_id;
  return v_attendance_id;
end;
$$;

create or replace function public.finalize_conferred_sales_order(
  p_sales_order_id uuid, p_user_id uuid, p_payment_method text, p_bank_account_id uuid, p_installment_entries jsonb default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_order public.sales_orders%rowtype; v_finalization_id uuid; v_total numeric(14,4); v_entries jsonb;
  v_entry jsonb; v_entry_total numeric(14,4) := 0; v_count integer; v_index integer := 0; v_amount numeric; v_due_date timestamptz;
begin
  select * into v_order from public.sales_orders where id = p_sales_order_id for update;
  if not found then raise exception 'Pedido de venda não encontrado'; end if;
  if v_order.status <> 'Conferido' then raise exception 'Somente pedidos conferidos podem ser finalizados'; end if;
  if nullif(trim(p_payment_method), '') is null then raise exception 'Informe a forma de pagamento'; end if;
  if p_bank_account_id is null then raise exception 'Informe a conta de recebimento'; end if;
  select coalesce(sum(total_value), 0) into v_total from public.sale_attendances where sales_order_id = p_sales_order_id and attendance_number like 'EXP-%' and status = 'Concluído';
  if v_total <= 0 then raise exception 'Não há valores conferidos para finalizar'; end if;
  insert into public.sales_order_financial_finalizations (sales_order_id, payment_method, bank_account_id, created_by, updated_by)
  values (p_sales_order_id, trim(p_payment_method), p_bank_account_id, p_user_id, p_user_id) returning id into v_finalization_id;
  v_entries := coalesce(p_installment_entries, jsonb_build_array(jsonb_build_object('amount', v_total, 'dueDate', v_order.due_date)));
  v_count := jsonb_array_length(v_entries);
  if v_count = 0 then raise exception 'Informe ao menos uma parcela'; end if;
  for v_entry in select * from jsonb_array_elements(v_entries) loop v_entry_total := v_entry_total + (v_entry->>'amount')::numeric; end loop;
  if abs(v_entry_total - v_total) > 0.01 then raise exception 'O total das parcelas deve ser igual ao valor conferido'; end if;
  for v_entry in select * from jsonb_array_elements(v_entries) loop
    v_index := v_index + 1; v_amount := (v_entry->>'amount')::numeric; v_due_date := (v_entry->>'dueDate')::timestamptz;
    if v_amount <= 0 or v_due_date is null then raise exception 'Cada parcela deve ter valor e vencimento válidos'; end if;
    insert into public.financial_entries (entry_type, description, amount, due_date, status, category, client_id, reference_table, reference_id, payment_method, installments, installment_group_id, installment_number, bank_account_id, created_by, updated_by)
    values ('Receber', 'Venda ' || v_order.order_number || case when v_count > 1 then ' - Parcela ' || v_index || '/' || v_count else '' end,
      v_amount, v_due_date, 'Aberto', 'Vendas', v_order.client_id, 'sales_order_financial_finalizations', v_finalization_id,
      trim(p_payment_method), v_count, v_finalization_id, v_index, p_bank_account_id, p_user_id, p_user_id);
  end loop;
  update public.sales_orders set status = 'Atendido', updated_at = now(), updated_by = p_user_id where id = p_sales_order_id;
  update public.sales_order_items set status = 'Atendido', updated_at = now(), updated_by = p_user_id where sales_order_id = p_sales_order_id;
  return v_finalization_id;
exception when unique_violation then raise exception 'Este pedido já foi finalizado financeiramente';
end;
$$;

revoke execute on function public.finalize_conferred_sales_order(uuid, uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.finalize_conferred_sales_order(uuid, uuid, text, uuid, jsonb) to service_role;
