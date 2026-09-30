-- Uma devolução física torna a quantidade devolvida pendente novamente no
-- pedido. Antes, ela voltava apenas para o estoque, enquanto o pedido seguia
-- considerando a quantidade como atendida.

alter table public.sales_order_fulfillments
  add column if not exists returned_quantity numeric(14,4) not null default 0
    check (returned_quantity >= 0 and returned_quantity <= quantity);

-- Distribui o histórico de devoluções entre os atendimentos mais antigos do
-- mesmo pedido/produto/lote. Isso corrige os saldos já existentes sem apagar o
-- histórico de expedição ou de devolução.
with return_totals as (
  select sr.sales_order_id, sr.product_id, sr.finished_product_lot_id,
         sum(sr.returned_quantity) as returned_quantity
    from public.sales_returns sr
   group by sr.sales_order_id, sr.product_id, sr.finished_product_lot_id
), fulfillment_capacity as (
  select sof.id,
         coalesce(rt.returned_quantity, 0) as total_returned,
         coalesce(sum(sof.quantity) over (
           partition by sof.sales_order_id, soi.product_id, sof.finished_product_lot_id
           order by sof.fulfilled_at, sof.id
           rows between unbounded preceding and 1 preceding
         ), 0) as prior_quantity,
         sof.quantity
    from public.sales_order_fulfillments sof
    join public.sales_order_items soi on soi.id = sof.sales_order_item_id
    left join return_totals rt
      on rt.sales_order_id = sof.sales_order_id
     and rt.product_id = soi.product_id
     and rt.finished_product_lot_id = sof.finished_product_lot_id
)
update public.sales_order_fulfillments sof
   set returned_quantity = greatest(0, least(fc.quantity, fc.total_returned - fc.prior_quantity))
  from fulfillment_capacity fc
 where fc.id = sof.id;

create or replace function public.recalculate_sales_order_return_progress(
  p_sales_order_id uuid,
  p_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_all_fulfilled boolean;
  v_any_fulfilled boolean;
begin
  -- Mantém o valor dos atendimentos como o valor líquido ainda entregue. Isso
  -- permite uma nova expedição sem que a validação financeira some duas vezes
  -- a mercadoria que voltou.
  -- A tabela não aceita itens de atendimento com quantidade zero. Quando a
  -- devolução é total, o registro de expedição continua em fulfillments e o
  -- item comercial zerado é removido do atendimento.
  delete from public.sale_attendance_items sai
    using (
      select sof.attendance_id, sof.sales_order_item_id,
             sum(sof.quantity - sof.returned_quantity) as net_quantity
        from public.sales_order_fulfillments sof
       where sof.sales_order_id = p_sales_order_id
         and sof.attendance_id is not null
       group by sof.attendance_id, sof.sales_order_item_id
    ) source
   where sai.attendance_id = source.attendance_id
     and sai.sales_order_item_id = source.sales_order_item_id
     and source.net_quantity <= 0;

  update public.sale_attendance_items sai
     set quantity = source.net_quantity,
         total_value = round(source.net_quantity * sai.unit_price, 4)
    from (
      select sof.attendance_id, sof.sales_order_item_id,
             sum(sof.quantity - sof.returned_quantity) as net_quantity
        from public.sales_order_fulfillments sof
       where sof.sales_order_id = p_sales_order_id
         and sof.attendance_id is not null
       group by sof.attendance_id, sof.sales_order_item_id
    ) source
   where sai.attendance_id = source.attendance_id
     and sai.sales_order_item_id = source.sales_order_item_id
     and source.net_quantity > 0;

  update public.sale_attendances sa
     set total_value = coalesce((
           select sum(sai.total_value)
             from public.sale_attendance_items sai
            where sai.attendance_id = sa.id
         ), 0),
         updated_at = now(),
         updated_by = p_user_id
   where sa.sales_order_id = p_sales_order_id
     and sa.status <> 'Cancelado';

  update public.sales_order_items soi
     set fulfilled_quantity = coalesce((
           select sum(sof.quantity - sof.returned_quantity)
             from public.sales_order_fulfillments sof
             left join public.sale_attendances sa on sa.id = sof.attendance_id
            where sof.sales_order_item_id = soi.id
              and (sa.id is null or sa.status <> 'Cancelado')
         ), 0),
         updated_by = p_user_id
   where soi.sales_order_id = p_sales_order_id;

  update public.sales_order_items
     set status = case
           when fulfilled_quantity >= ordered_quantity then 'Atendido'
           when fulfilled_quantity > 0 then 'Parcialmente Atendido'
           else 'Aberto'
         end
   where sales_order_id = p_sales_order_id;

  select bool_and(fulfilled_quantity >= ordered_quantity), bool_or(fulfilled_quantity > 0)
    into v_all_fulfilled, v_any_fulfilled
    from public.sales_order_items
   where sales_order_id = p_sales_order_id;

  update public.sales_orders
     set status = case
           when coalesce(v_all_fulfilled, false) then 'Atendido'
           when coalesce(v_any_fulfilled, false) then 'Parcialmente Atendido'
           else 'Aberto'
         end,
         updated_at = now(),
         updated_by = p_user_id
   where id = p_sales_order_id;
end;
$$;

-- Aplica o novo saldo líquido aos pedidos que já possuíam devolução.
do $$
declare
  v_order_id uuid;
begin
  for v_order_id in select distinct sales_order_id from public.sales_returns loop
    perform public.recalculate_sales_order_return_progress(v_order_id, null);
  end loop;
end;
$$;

alter function public.process_sales_return(uuid, timestamptz, jsonb, numeric, text, uuid)
  rename to process_sales_return_inventory_v1;

create function public.process_sales_return(
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
  v_item jsonb;
  v_remaining_quantity numeric;
  v_remaining_pieces integer;
  v_fulfillment public.sales_order_fulfillments%rowtype;
  v_quantity_to_apply numeric;
  v_pieces_to_apply integer;
begin
  -- Preserva todas as validações, o retorno ao estoque e o tratamento
  -- financeiro já existentes.
  perform public.process_sales_return_inventory_v1(
    p_sales_order_id, p_return_date, p_items, p_discount_amount,
    p_excess_handling_strategy, p_user_id
  );

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_remaining_quantity := (v_item->>'returnedQuantity')::numeric;
    v_remaining_pieces := nullif(v_item->>'returnedPieces', '')::integer;

    -- A devolução é atribuída aos registros de atendimento daquele item e
    -- lote. A ordem inversa prioriza a expedição mais recente em caso de uma
    -- nova expedição do mesmo lote.
    for v_fulfillment in
      select *
        from public.sales_order_fulfillments
       where sales_order_id = p_sales_order_id
         and sales_order_item_id = (v_item->>'salesOrderItemId')::uuid
         and finished_product_lot_id = (v_item->>'lotId')::uuid
         and quantity > returned_quantity
       order by fulfilled_at desc, id desc
       for update
    loop
      exit when v_remaining_quantity <= 0;

      v_quantity_to_apply := least(v_remaining_quantity, v_fulfillment.quantity - v_fulfillment.returned_quantity);
      v_pieces_to_apply := case
        when v_remaining_pieces is null then null
        else least(
          v_remaining_pieces,
          greatest(0, coalesce(v_fulfillment.pieces_quantity, 0) - coalesce(v_fulfillment.returned_pieces, 0))
        )
      end;

      update public.sales_order_fulfillments
         set returned_quantity = returned_quantity + v_quantity_to_apply,
             returned_pieces = case
               when v_pieces_to_apply is null then returned_pieces
               else coalesce(returned_pieces, 0) + v_pieces_to_apply
             end,
             updated_at = now(),
             updated_by = p_user_id
       where id = v_fulfillment.id;

      v_remaining_quantity := v_remaining_quantity - v_quantity_to_apply;
      if v_remaining_pieces is not null then
        v_remaining_pieces := v_remaining_pieces - coalesce(v_pieces_to_apply, 0);
      end if;
    end loop;

    if v_remaining_quantity > 0 then
      raise exception 'Não foi possível vincular toda a quantidade devolvida ao atendimento original';
    end if;
    if v_remaining_pieces is not null and v_remaining_pieces > 0 then
      raise exception 'Não foi possível vincular todas as peças devolvidas ao atendimento original';
    end if;
  end loop;

  perform public.recalculate_sales_order_return_progress(p_sales_order_id, p_user_id);
end;
$$;

revoke execute on function public.process_sales_return(uuid, timestamptz, jsonb, numeric, text, uuid) from public, anon, authenticated;
grant execute on function public.process_sales_return(uuid, timestamptz, jsonb, numeric, text, uuid) to service_role;
