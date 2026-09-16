-- A devolução altera estoque e financeiro. Executá-la em uma única função
-- garante que qualquer erro reverta integralmente a operação.
create or replace function public.process_sales_return(
  p_sales_order_id uuid,
  p_return_date timestamptz,
  p_items jsonb,
  p_discount_amount numeric,
  p_excess_handling_strategy text default null,
  p_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.sales_orders%rowtype;
  v_item jsonb;
  v_sales_item public.sales_order_items%rowtype;
  v_fulfillment public.sales_order_fulfillments%rowtype;
  v_lot public.finished_product_lots%rowtype;
  v_entry public.financial_entries%rowtype;
  v_rateio public.financial_entry_items%rowtype;
  v_return_quantity numeric;
  v_fulfilled_quantity numeric;
  v_already_returned numeric;
  v_items_value numeric := 0;
  v_item_value numeric;
  v_discount numeric := coalesce(p_discount_amount, 0);
  v_total_remaining numeric := 0;
  v_discount_remaining numeric;
  v_value_remaining numeric;
  v_entry_discount numeric;
  v_entry_remaining numeric;
  v_received numeric;
  v_excess numeric := 0;
  v_rateio_total numeric;
  v_rateio_discount_remaining numeric;
  v_rateio_value_remaining numeric;
  v_rateio_discount numeric;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Informe ao menos um item para devolução';
  end if;
  if v_discount < 0 then raise exception 'O abatimento não pode ser negativo'; end if;
  if p_excess_handling_strategy is not null
    and p_excess_handling_strategy not in ('credit', 'refund') then
    raise exception 'Estratégia de tratamento da devolução inválida';
  end if;

  select * into v_order from public.sales_orders where id = p_sales_order_id for update;
  if not found then raise exception 'Pedido de venda não encontrado'; end if;

  -- Valida todos os itens antes de alterar qualquer saldo e calcula o rateio
  -- auditável do desconto pelo valor devolvido de cada item.
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_return_quantity := (v_item->>'returnedQuantity')::numeric;
    if v_return_quantity <= 0 then raise exception 'Quantidade devolvida deve ser maior que zero'; end if;
    select * into v_sales_item from public.sales_order_items
      where id = (v_item->>'salesOrderItemId')::uuid and sales_order_id = p_sales_order_id;
    if not found then raise exception 'Item do pedido não encontrado'; end if;
    perform 1 from public.sales_order_fulfillments
      where sales_order_id = p_sales_order_id
        and sales_order_item_id = v_sales_item.id
        and finished_product_lot_id = (v_item->>'lotId')::uuid
      for update;
    if not found then raise exception 'Atendimento não encontrado para o lote %', v_item->>'lotId'; end if;
    select coalesce(sum(quantity), 0) into v_fulfilled_quantity from public.sales_order_fulfillments
      where sales_order_id = p_sales_order_id and sales_order_item_id = v_sales_item.id
        and finished_product_lot_id = (v_item->>'lotId')::uuid;
    select * into v_lot from public.finished_product_lots where id = (v_item->>'lotId')::uuid for update;
    if not found then raise exception 'Lote não encontrado'; end if;
    select coalesce(sum(returned_quantity), 0) into v_already_returned
      from public.sales_returns
      where sales_order_id = p_sales_order_id
        and product_id = v_sales_item.product_id
        and finished_product_lot_id = v_lot.id;
    if v_return_quantity > v_fulfilled_quantity - v_already_returned then
      raise exception 'Quantidade devolvida excede a quantidade atendida e não devolvida do lote';
    end if;
    v_items_value := v_items_value + round(v_return_quantity * v_sales_item.unit_price, 4);
  end loop;

  if v_discount > 0 then
    select coalesce(sum(greatest(fe.amount - coalesce(fe.discount_amount, 0), 0)), 0)
      into v_total_remaining
      from public.financial_entries fe
      where (fe.reference_table = 'sales_orders' and fe.reference_id = p_sales_order_id)
         or (fe.reference_table = 'sales_order_financial_finalizations' and fe.reference_id in (
           select id from public.sales_order_financial_finalizations where sales_order_id = p_sales_order_id
         ));
    if v_total_remaining = 0 then raise exception 'Não há título financeiro para aplicar o abatimento'; end if;
    if v_discount > v_total_remaining then
      raise exception 'O abatimento excede o saldo financeiro disponível para devolução';
    end if;
  end if;

  v_discount_remaining := v_discount;
  v_value_remaining := v_items_value;
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_return_quantity := (v_item->>'returnedQuantity')::numeric;
    select * into v_sales_item from public.sales_order_items where id = (v_item->>'salesOrderItemId')::uuid;
    select coalesce(sum(quantity), 0) into v_fulfilled_quantity from public.sales_order_fulfillments
      where sales_order_id = p_sales_order_id and sales_order_item_id = v_sales_item.id
        and finished_product_lot_id = (v_item->>'lotId')::uuid;
    select * into v_lot from public.finished_product_lots where id = (v_item->>'lotId')::uuid for update;
    v_item_value := round(v_return_quantity * v_sales_item.unit_price, 4);
    if v_value_remaining = v_item_value then v_entry_discount := v_discount_remaining;
    else v_entry_discount := round(v_discount * v_item_value / nullif(v_items_value, 0), 4); end if;
    v_discount_remaining := v_discount_remaining - v_entry_discount;
    v_value_remaining := v_value_remaining - v_item_value;
    update public.finished_product_lots set returned_quantity = returned_quantity + v_return_quantity,
      updated_at = now(), updated_by = p_user_id where id = v_lot.id;
    insert into public.sales_returns (sales_order_id, product_id, finished_product_lot_id, original_quantity,
      returned_quantity, return_date, reason, discount_amount, original_sale_value, new_sale_value, created_by, updated_by)
    values (p_sales_order_id, v_sales_item.product_id, v_lot.id, v_fulfilled_quantity, v_return_quantity,
      coalesce(p_return_date, now()), nullif(trim(v_item->>'reason'), ''), v_entry_discount, v_order.total_amount,
      v_order.total_amount - v_discount, p_user_id, p_user_id);
  end loop;

  if v_discount > 0 then
    v_discount_remaining := v_discount;
    for v_entry in
      select fe.* from public.financial_entries fe
      where (fe.reference_table = 'sales_orders' and fe.reference_id = p_sales_order_id)
         or (fe.reference_table = 'sales_order_financial_finalizations' and fe.reference_id in (
           select id from public.sales_order_financial_finalizations where sales_order_id = p_sales_order_id
         ))
      for update
    loop
      v_entry_remaining := greatest(v_entry.amount - coalesce(v_entry.discount_amount, 0), 0);
      if v_entry_remaining = 0 then continue; end if;
      if v_entry_remaining = v_total_remaining then v_entry_discount := v_discount_remaining;
      else v_entry_discount := round(v_discount * v_entry_remaining / v_total_remaining, 4); end if;
      v_discount_remaining := v_discount_remaining - v_entry_discount;
      select coalesce(sum(amount), 0) into v_received from public.financial_entry_receipts where financial_entry_id = v_entry.id;
      v_excess := v_excess + greatest(0, v_received - (v_entry_remaining - v_entry_discount))
        - greatest(0, v_received - v_entry_remaining);
      update public.financial_entries set discount_amount = coalesce(discount_amount, 0) + v_entry_discount,
        updated_at = now(), updated_by = p_user_id where id = v_entry.id;

      select coalesce(sum(amount), 0) into v_rateio_total from public.financial_entry_items where financial_entry_id = v_entry.id;
      if v_rateio_total > 0 then
        v_rateio_discount_remaining := v_entry_discount;
        v_rateio_value_remaining := v_rateio_total;
        for v_rateio in select * from public.financial_entry_items where financial_entry_id = v_entry.id for update
        loop
          if v_rateio.amount = v_rateio_value_remaining then v_rateio_discount := v_rateio_discount_remaining;
          else v_rateio_discount := round(v_entry_discount * v_rateio.amount / v_rateio_total, 4); end if;
          v_rateio_discount_remaining := v_rateio_discount_remaining - v_rateio_discount;
          v_rateio_value_remaining := v_rateio_value_remaining - v_rateio.amount;
          update public.financial_entry_items set amount = amount - v_rateio_discount where id = v_rateio.id;
        end loop;
      end if;
    end loop;
  end if;

  update public.sales_orders set has_return = true, updated_at = now(), updated_by = p_user_id where id = p_sales_order_id;
  if p_excess_handling_strategy = 'credit' and v_excess > 0 then
    if v_order.client_id is null then raise exception 'Pedido sem cliente para gerar crédito'; end if;
    update public.clients set credit_balance = credit_balance + v_excess where id = v_order.client_id;
    insert into public.client_credits (client_id, amount, transaction_type, reference_type, reference_id, notes, created_by)
      values (v_order.client_id, v_excess, 'Credit_Earned', 'sales_orders', p_sales_order_id,
        'Crédito gerado por devolução no pedido ' || p_sales_order_id, p_user_id);
  elsif p_excess_handling_strategy = 'refund' and v_discount > 0 then
    if v_order.client_id is null then raise exception 'Pedido sem cliente para gerar reembolso'; end if;
    insert into public.financial_entries (entry_type, description, amount, due_date, status, category, client_id,
      reference_table, reference_id, created_by, updated_by)
    values ('Pagar', 'Reembolso de Devolução (Pedido ' || v_order.id || ')', v_discount,
      coalesce(p_return_date, now()), 'Aberto', 'Reembolsos', v_order.client_id, 'sales_orders', p_sales_order_id,
      p_user_id, p_user_id);
  end if;
end;
$$;

revoke execute on function public.process_sales_return(uuid, timestamptz, jsonb, numeric, text, uuid) from public, anon, authenticated;
grant execute on function public.process_sales_return(uuid, timestamptz, jsonb, numeric, text, uuid) to service_role;

-- Abatimentos de devolução reduzem a previsão financeira e precisam aparecer
-- também nos indicadores do Dashboard.
create or replace function public.get_dashboard_summary()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare summary json;
begin
  select json_build_object(
    'milkReceivedMonth', (select coalesce(sum(volume_liters), 0) from milk_lots where date_trunc('month', received_at) = date_trunc('month', now())),
    'approvedLots', (select count(*) from milk_lots where status = 'Aprovado'),
    'blockedLots', (select count(*) from milk_lots where status = 'Bloqueado'),
    'pendingAnalysisCount', (select count(*) from milk_lots where status in ('Aguardando Análise', 'Aguardando Analise')),
    'openOrders', (select count(*) from production_orders where status = 'Em Andamento'),
    'finishedOrders', (select count(*) from production_orders where status = 'Finalizada'),
    'averageCostPerLiter', (select coalesce(sum(cost_per_liter) / nullif(count(cost_per_liter), 0), 0) from milk_lots where cost_per_liter is not null),
    'averageCostPerKg', (select coalesce(sum(ml.cost_per_liter * po.liters_planned) / nullif(sum(po.actual_quantity_produced), 0), 0) from production_orders po join milk_lots ml on ml.id = po.milk_lot_id where po.status = 'Finalizada' and po.actual_quantity_produced is not null),
    'accountsPayable', (select coalesce(sum(greatest(fe.amount - coalesce(fe.discount_amount, 0) - coalesce(r.received, 0), 0)), 0) from financial_entries fe left join (select financial_entry_id, sum(amount) received from financial_entry_receipts group by financial_entry_id) r on r.financial_entry_id = fe.id where fe.entry_type = 'Pagar' and fe.status <> 'Cancelado'),
    'accountsReceivable', (select coalesce(sum(greatest(fe.amount - coalesce(fe.discount_amount, 0) - coalesce(r.received, 0), 0)), 0) from financial_entries fe left join (select financial_entry_id, sum(amount) received from financial_entry_receipts group by financial_entry_id) r on r.financial_entry_id = fe.id where fe.entry_type = 'Receber' and fe.status <> 'Cancelado'),
    'milkPayroll', (select coalesce(sum(amount), 0) from financial_entries where upper(category) like '%MATÉRIA-PRIMA%' or upper(category) like '%MATÉRIA PRIMA%'),
    'overdueEntries', (select count(*) from financial_entries fe left join (select financial_entry_id, sum(amount) received from financial_entry_receipts group by financial_entry_id) r on r.financial_entry_id = fe.id where fe.status <> 'Cancelado' and fe.due_date < now() and fe.amount - coalesce(fe.discount_amount, 0) > coalesce(r.received, 0)),
    'overdueAmount', (select coalesce(sum(greatest(fe.amount - coalesce(fe.discount_amount, 0) - coalesce(r.received, 0), 0)), 0) from financial_entries fe left join (select financial_entry_id, sum(amount) received from financial_entry_receipts group by financial_entry_id) r on r.financial_entry_id = fe.id where fe.status <> 'Cancelado' and fe.due_date < now()),
    'lowStockItemsCount', (select count(*) from supply_items where current_stock < minimum_stock),
    'analysesCount', (select count(*) from milk_lot_analyses)
  ) into summary;
  return summary;
end;
$$;
