alter function public.create_sale_attendance(uuid, uuid, timestamptz, uuid, jsonb, text, uuid, jsonb, text)
  rename to create_sale_attendance_quantity_v1;

create function public.create_sale_attendance(p_sales_order_id uuid,p_user_id uuid,p_fulfilled_at timestamptz,p_idempotency_key uuid,p_items jsonb,p_payment_method text default null,p_bank_account_id uuid default null,p_installment_entries jsonb default null,p_notes text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_item jsonb;
  v_tracks boolean;
  v_pieces integer;
  v_lot record;
  v_attendance uuid;
  v_planned_pieces integer;
  v_piece_progress jsonb := '{}'::jsonb;
begin
  -- Uma nova tentativa com a mesma chave precisa retornar o atendimento já
  -- criado, sem executar novamente a baixa de peças.
  if p_idempotency_key is not null then
    select id into v_attendance from sale_attendances where idempotency_key=p_idempotency_key;
    if found then return v_attendance; end if;
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    select coalesce(p.tracks_quantity_and_weight,p.tracks_pieces,false) into v_tracks from sales_order_items i join finished_products p on p.id=i.product_id where i.id=(v_item->>'salesOrderItemId')::uuid;
    if v_tracks then
      v_pieces := (v_item->>'piecesQuantity')::integer;
      if v_pieces is null or v_pieces<=0 then raise exception 'Informe peças para este produto'; end if;
      select * into v_lot from finished_product_lots where id=(v_item->>'finishedProductLotId')::uuid for update;
      if not found then raise exception 'Lote não encontrado'; end if;
      v_planned_pieces := coalesce((v_piece_progress->>v_lot.id::text)::integer, 0) + v_pieces;
      if v_planned_pieces>coalesce(v_lot.available_pieces,0) then raise exception 'Saldo de peças insuficiente no lote %',v_lot.lot_code; end if;
      v_piece_progress := jsonb_set(v_piece_progress,array[v_lot.id::text],to_jsonb(v_planned_pieces));
    elsif v_item ? 'piecesQuantity' and nullif(v_item->>'piecesQuantity','') is not null then raise exception 'Este produto não controla peças'; end if;
  end loop;
  v_attendance:=create_sale_attendance_quantity_v1(p_sales_order_id,p_user_id,p_fulfilled_at,p_idempotency_key,p_items,p_payment_method,p_bank_account_id,p_installment_entries,p_notes);
  for v_item in select value from jsonb_array_elements(p_items) loop
    select coalesce(p.tracks_quantity_and_weight,p.tracks_pieces,false) into v_tracks from sales_order_items i join finished_products p on p.id=i.product_id where i.id=(v_item->>'salesOrderItemId')::uuid;
    if v_tracks then
      v_pieces:=(v_item->>'piecesQuantity')::integer;
      update sales_order_fulfillments set pieces_quantity=v_pieces where attendance_id=v_attendance and sales_order_item_id=(v_item->>'salesOrderItemId')::uuid and finished_product_lot_id=(v_item->>'finishedProductLotId')::uuid;
      update finished_product_lots set available_pieces=available_pieces-v_pieces,updated_at=now(),updated_by=p_user_id where id=(v_item->>'finishedProductLotId')::uuid;
    end if;
  end loop;
  return v_attendance;
end $$;
