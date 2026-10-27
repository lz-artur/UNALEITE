-- Migration 076: Adiciona returned_pieces em sales_order_fulfillments e atualiza process_sales_return

-- 1. Adiciona coluna returned_pieces em sales_order_fulfillments
alter table public.sales_order_fulfillments
  add column if not exists returned_pieces integer not null default 0
    check (returned_pieces >= 0);

-- 2. Backfill seguro de returned_pieces a partir do histórico de sales_returns
with return_piece_totals as (
  select sr.sales_order_id, sr.product_id, sr.finished_product_lot_id,
         coalesce(sum(sr.returned_pieces), 0) as total_returned_pieces
    from public.sales_returns sr
   where sr.returned_pieces is not null and sr.returned_pieces > 0
   group by sr.sales_order_id, sr.product_id, sr.finished_product_lot_id
), fulfillment_capacity as (
  select sof.id,
         coalesce(rt.total_returned_pieces, 0) as total_returned_pieces,
         coalesce(sum(coalesce(sof.pieces_quantity, 0)) over (
           partition by sof.sales_order_id, soi.product_id, sof.finished_product_lot_id
           order by sof.fulfilled_at, sof.id
           rows between unbounded preceding and 1 preceding
         ), 0) as prior_pieces,
         coalesce(sof.pieces_quantity, 0) as pieces_quantity
    from public.sales_order_fulfillments sof
    join public.sales_order_items soi on soi.id = sof.sales_order_item_id
    left join return_piece_totals rt
      on rt.sales_order_id = sof.sales_order_id
     and rt.product_id = soi.product_id
     and rt.finished_product_lot_id = sof.finished_product_lot_id
)
update public.sales_order_fulfillments sof
   set returned_pieces = greatest(0, least(fc.pieces_quantity, fc.total_returned_pieces - fc.prior_pieces))
  from fulfillment_capacity fc
 where fc.id = sof.id
   and fc.total_returned_pieces > 0;

-- 3. Recriar process_sales_return com suporte completo a returned_pieces e registro em stock_movements
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

    -- Registra movimentação de entrada no estoque para rastreabilidade
    insert into public.stock_movements (
      movement_type, lot_type, lot_id, quantity, pieces_quantity,
      reference_table, reference_id, created_by, updated_by
    ) values (
      'entrada', 'Produto Acabado', (v_item->>'lotId')::uuid,
      (v_item->>'returnedQuantity')::numeric, nullif(v_item->>'returnedPieces', '')::integer,
      'sales_returns', p_sales_order_id, p_user_id, p_user_id
    );
  end loop;

  -- Atualiza o progresso do pedido original e, se aplicável, reabre o status
  -- para permitir nova expedição da quantidade devolvida.
  perform public.recalculate_sales_order_return_progress(p_sales_order_id, p_user_id);
end;
$$;
