-- ============================================================================
-- Migration 078: Correção de atendimento com múltiplos lotes e tolerância de peso/peças
-- ============================================================================

create or replace function public.create_sale_attendance(
  p_sales_order_id uuid,
  p_user_id uuid,
  p_fulfilled_at timestamptz,
  p_idempotency_key uuid,
  p_items jsonb,
  p_payment_method text default null,
  p_bank_account_id uuid default null,
  p_installment_entries jsonb default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_order_item public.sales_order_items%rowtype;
  v_tracks boolean;
  v_pieces integer;
  v_lot public.finished_product_lots%rowtype;
  v_attendance uuid;
  v_planned_pieces integer;
  v_piece_progress jsonb := '{}'::jsonb;
  v_item_pieces_progress jsonb := '{}'::jsonb;
  v_ref_pieces integer;
  v_min_pieces integer;
  v_max_pieces integer;
  v_prod public.finished_products%rowtype;
  v_tolerance_percent numeric;
  v_total_item_pieces integer;
  v_soi_id uuid;
begin
  -- Idempotência: retorna atendimento já existente
  if p_idempotency_key is not null then
    select id into v_attendance from sale_attendances where idempotency_key = p_idempotency_key;
    if found then return v_attendance; end if;
  end if;

  -- Pré-validações de peças, saldo físico por lote e acúmulo por item do pedido
  for v_item in select value from jsonb_array_elements(p_items) loop
    select i.* into v_order_item
    from sales_order_items i
    where i.id = (v_item->>'salesOrderItemId')::uuid and i.sales_order_id = p_sales_order_id
    for update;

    if not found then
      raise exception 'Item do pedido não encontrado';
    end if;

    select coalesce(p.tracks_quantity_and_weight, p.tracks_pieces, false) into v_tracks
    from finished_products p
    where p.id = v_order_item.product_id;

    if v_tracks then
      v_pieces := (v_item->>'piecesQuantity')::integer;
      if v_pieces is null or v_pieces <= 0 then
        raise exception 'Informe a quantidade de peças para o produto';
      end if;

      select * into v_lot
      from finished_product_lots
      where id = (v_item->>'finishedProductLotId')::uuid
      for update;

      if not found then
        raise exception 'Lote não encontrado';
      end if;

      -- Validação de saldo físico do lote (nunca permitir saída de peças inexistentes no lote)
      v_planned_pieces := coalesce((v_piece_progress->>v_lot.id::text)::integer, 0) + v_pieces;
      if v_planned_pieces > coalesce(v_lot.available_pieces, 0) then
        raise exception 'Saldo de peças insuficiente no lote % (Disponível: %, Solicitado: %)',
          v_lot.lot_code, coalesce(v_lot.available_pieces, 0), v_planned_pieces;
      end if;
      v_piece_progress := jsonb_set(v_piece_progress, array[v_lot.id::text], to_jsonb(v_planned_pieces));

      -- Acumula as peças por item do pedido (suporta atendimento dividido entre múltiplos lotes)
      v_total_item_pieces := coalesce((v_item_pieces_progress->>v_order_item.id::text)::integer, 0) + v_pieces;
      v_item_pieces_progress := jsonb_set(v_item_pieces_progress, array[v_order_item.id::text], to_jsonb(v_total_item_pieces));
    elsif v_item ? 'piecesQuantity' and nullif(v_item->>'piecesQuantity', '') is not null then
      raise exception 'Este produto não controla peças';
    end if;
  end loop;

  -- Validação de tolerância sobre o total acumulado de cada item do pedido
  for v_soi_id in select distinct (value->>'salesOrderItemId')::uuid from jsonb_array_elements(p_items) loop
    select i.* into v_order_item
    from sales_order_items i
    where i.id = v_soi_id;

    if found and (v_item_pieces_progress ? v_soi_id::text) then
      select * into v_prod from finished_products where id = v_order_item.product_id;
      v_total_item_pieces := (v_item_pieces_progress->>v_soi_id::text)::integer;
      v_ref_pieces := v_order_item.ordered_pieces;

      if v_ref_pieces is not null and v_ref_pieces > 0 then
        v_tolerance_percent := coalesce(nullif(v_prod.weight_variance_percent, 0), 5);
        v_min_pieces := ceil(v_ref_pieces * (1.0 - (v_tolerance_percent / 100.0)));
        v_max_pieces := floor(v_ref_pieces * (1.0 + (v_tolerance_percent / 100.0)));

        if v_total_item_pieces < v_min_pieces or v_total_item_pieces > v_max_pieces then
          raise exception 'A quantidade de peças informada (%) está fora da tolerância de % %% permitida (% a % peças para a referência de % peças)',
            v_total_item_pieces, v_tolerance_percent, v_min_pieces, v_max_pieces, v_ref_pieces;
        end if;
      end if;
    end if;
  end loop;

  -- Executa o atendimento base (financeiro, itens, fulfillments e estoque em peso)
  v_attendance := create_sale_attendance_quantity_v1(
    p_sales_order_id,
    p_user_id,
    p_fulfilled_at,
    p_idempotency_key,
    p_items,
    p_payment_method,
    p_bank_account_id,
    p_installment_entries,
    p_notes
  );

  -- Atualiza pieces_quantity nos fulfillments, finished_product_lots E stock_movements
  for v_item in select value from jsonb_array_elements(p_items) loop
    select coalesce(p.tracks_quantity_and_weight, p.tracks_pieces, false) into v_tracks
    from sales_order_items i
    join finished_products p on p.id = i.product_id
    where i.id = (v_item->>'salesOrderItemId')::uuid;

    if v_tracks then
      v_pieces := (v_item->>'piecesQuantity')::integer;

      -- 1. Atualiza fulfillments
      update public.sales_order_fulfillments
      set pieces_quantity = v_pieces
      where attendance_id = v_attendance
        and sales_order_item_id = (v_item->>'salesOrderItemId')::uuid
        and finished_product_lot_id = (v_item->>'finishedProductLotId')::uuid;

      -- 2. Atualiza saldo de peças do lote
      update public.finished_product_lots
      set available_pieces = available_pieces - v_pieces,
          updated_at = now(),
          updated_by = p_user_id
      where id = (v_item->>'finishedProductLotId')::uuid;

      -- 3. Atualiza pieces_quantity em stock_movements
      update public.stock_movements
      set pieces_quantity = v_pieces,
          updated_at = now(),
          updated_by = p_user_id
      where reference_table in ('sales_orders', 'sale_attendances')
        and reference_id in (p_sales_order_id, v_attendance)
        and lot_id = (v_item->>'finishedProductLotId')::uuid
        and movement_type = 'saida';
    end if;
  end loop;

  return v_attendance;
end $$;
