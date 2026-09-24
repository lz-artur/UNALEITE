-- Atendimentos anteriores ao controle de peças possuem pieces_quantity nulo.
-- Nesses casos, a devolução ainda deve registrar as peças contadas fisicamente,
-- mas não há um total histórico confiável contra o qual validar um limite.
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
  v_product_id uuid;
  v_tracks boolean;
  v_pieces integer;
  v_fulfilled integer;
  v_returned integer;
begin
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    select i.product_id, coalesce(p.tracks_quantity_and_weight, p.tracks_pieces, false)
      into v_product_id, v_tracks
      from sales_order_items i
      join finished_products p on p.id = i.product_id
      where i.id = (v_item->>'salesOrderItemId')::uuid;

    if v_tracks then
      v_pieces := (v_item->>'returnedPieces')::integer;
      if v_pieces is null or v_pieces <= 0 then
        raise exception 'Informe as peças devolvidas para este produto';
      end if;

      select coalesce(sum(pieces_quantity), 0)
        into v_fulfilled
        from sales_order_fulfillments
        where sales_order_id = p_sales_order_id
          and sales_order_item_id = (v_item->>'salesOrderItemId')::uuid
          and finished_product_lot_id = (v_item->>'lotId')::uuid;

      select coalesce(sum(returned_pieces), 0)
        into v_returned
        from sales_returns
        where sales_order_id = p_sales_order_id
          and product_id = v_product_id
          and finished_product_lot_id = (v_item->>'lotId')::uuid;

      if v_fulfilled > 0 and v_pieces > v_fulfilled - v_returned then
        raise exception 'Peças devolvidas excedem as peças atendidas';
      end if;
    elsif v_item ? 'returnedPieces' and nullif(v_item->>'returnedPieces', '') is not null then
      raise exception 'Este produto não controla peças';
    end if;
  end loop;

  perform process_sales_return_quantity_v1(
    p_sales_order_id,
    p_return_date,
    p_items,
    p_discount_amount,
    p_excess_handling_strategy,
    p_user_id
  );

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    select coalesce(p.tracks_quantity_and_weight, p.tracks_pieces, false)
      into v_tracks
      from sales_order_items i
      join finished_products p on p.id = i.product_id
      where i.id = (v_item->>'salesOrderItemId')::uuid;

    update finished_product_lots
      set available_quantity = available_quantity + (v_item->>'returnedQuantity')::numeric,
          available_pieces = case
            when v_tracks then coalesce(available_pieces, 0) + (v_item->>'returnedPieces')::integer
            else available_pieces
          end,
          updated_at = now(),
          updated_by = p_user_id
      where id = (v_item->>'lotId')::uuid;

    if v_tracks then
      v_pieces := (v_item->>'returnedPieces')::integer;
      update sales_returns
        set returned_pieces = v_pieces
        where id = (
          select id
            from sales_returns
            where sales_order_id = p_sales_order_id
              and finished_product_lot_id = (v_item->>'lotId')::uuid
            order by created_at desc
            limit 1
        );
    end if;
  end loop;
end;
$$;
