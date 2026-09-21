-- Lotes criados antes do controle duplo não possuem saldo em peças.
-- Para esses lotes, NULL representa controle legado somente em KG. Lotes que
-- possuem available_pieces continuam exigindo e baixando as duas medidas.
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
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_item jsonb;
  v_pieces integer;
  v_lot public.finished_product_lots%rowtype;
  v_attendance uuid;
  v_planned_pieces integer;
  v_piece_progress jsonb := '{}'::jsonb;
begin
  if p_idempotency_key is not null then
    select id into v_attendance
    from public.sale_attendances
    where idempotency_key = p_idempotency_key;
    if found then return v_attendance; end if;
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_lot
    from public.finished_product_lots
    where id = (v_item->>'finishedProductLotId')::uuid
    for update;

    if not found then raise exception 'Lote não encontrado'; end if;

    if v_lot.available_pieces is not null then
      v_pieces := (v_item->>'piecesQuantity')::integer;
      if v_pieces is null or v_pieces <= 0 then
        raise exception 'Informe peças para este lote';
      end if;
      v_planned_pieces := coalesce((v_piece_progress->>v_lot.id::text)::integer, 0) + v_pieces;
      if v_planned_pieces > v_lot.available_pieces then
        raise exception 'Saldo de peças insuficiente no lote %', v_lot.lot_code;
      end if;
      v_piece_progress := jsonb_set(v_piece_progress, array[v_lot.id::text], to_jsonb(v_planned_pieces));
    elsif v_item ? 'piecesQuantity' and nullif(v_item->>'piecesQuantity', '') is not null then
      raise exception 'Este lote controla somente o saldo em KG';
    end if;
  end loop;

  v_attendance := public.create_sale_attendance_quantity_v1(
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

  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_lot
    from public.finished_product_lots
    where id = (v_item->>'finishedProductLotId')::uuid
    for update;

    if v_lot.available_pieces is not null then
      v_pieces := (v_item->>'piecesQuantity')::integer;
      update public.sales_order_fulfillments
      set pieces_quantity = v_pieces
      where attendance_id = v_attendance
        and sales_order_item_id = (v_item->>'salesOrderItemId')::uuid
        and finished_product_lot_id = v_lot.id;

      update public.finished_product_lots
      set available_pieces = available_pieces - v_pieces,
          updated_at = now(),
          updated_by = p_user_id
      where id = v_lot.id;
    end if;
  end loop;

  return v_attendance;
end $$;

-- A função movimenta estoque e financeiro. Somente o backend com service role
-- pode executá-la; usuários autenticados não recebem acesso direto ao RPC.
revoke execute on function public.create_sale_attendance(
  uuid, uuid, timestamptz, uuid, jsonb, text, uuid, jsonb, text
) from public, anon, authenticated;

grant execute on function public.create_sale_attendance(
  uuid, uuid, timestamptz, uuid, jsonb, text, uuid, jsonb, text
) to service_role;
