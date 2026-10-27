-- ============================================================================
-- Migration 075: Estoque, Vendas, Devoluções e Cancelamento Administrativo de OPs
-- ============================================================================

-- 1. Adicionar ordered_pieces em sales_order_items para armazenar a quantidade autorizada de peças
alter table public.sales_order_items
  add column if not exists ordered_pieces integer null check (ordered_pieces is null or ordered_pieces > 0);

comment on column public.sales_order_items.ordered_pieces is
  'Quantidade autorizada de peças para o item de venda. Serve como referência física para expedição e validação com tolerância de 5%.';

-- 2. Backfill seguro de pieces_quantity em stock_movements a partir de registros originais existentes
-- Atualiza stock_movements de vendas (sales_orders) que possuem atendimento registrado com peças conhecidas
update public.stock_movements sm
set pieces_quantity = sof.pieces_quantity
from public.sales_order_fulfillments sof
where sm.reference_table = 'sales_orders'
  and sm.pieces_quantity is null
  and sof.sales_order_id = sm.reference_id
  and sof.finished_product_lot_id = sm.lot_id
  and sof.pieces_quantity is not null
  and sof.pieces_quantity > 0;

-- Atualiza stock_movements de expedições (sale_expeditions) onde pesagens de peças foram registradas
update public.stock_movements sm
set pieces_quantity = source.total_pieces
from (
  select l.expedition_id, l.finished_product_lot_id, sum(w.pieces_quantity)::integer as total_pieces
  from public.sale_expedition_lines l
  join public.sale_expedition_weighings w on w.expedition_line_id = l.id
  where w.pieces_quantity is not null and w.pieces_quantity > 0
  group by l.expedition_id, l.finished_product_lot_id
) source
where sm.reference_table = 'sale_expeditions'
  and sm.pieces_quantity is null
  and sm.reference_id = source.expedition_id
  and sm.lot_id = source.finished_product_lot_id;

-- 3. Atualizar create_sale_attendance para gravar pieces_quantity em stock_movements e validar tolerância de 5%
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
  v_ref_pieces integer;
  v_min_pieces integer;
  v_max_pieces integer;
begin
  -- Idempotência: retorna atendimento já existente
  if p_idempotency_key is not null then
    select id into v_attendance from sale_attendances where idempotency_key = p_idempotency_key;
    if found then return v_attendance; end if;
  end if;

  -- Pré-validações de peças, saldo e tolerância de 5%
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

      -- Validação de saldo físico do lote (nunca permitir saída de peças inexistentes)
      v_planned_pieces := coalesce((v_piece_progress->>v_lot.id::text)::integer, 0) + v_pieces;
      if v_planned_pieces > coalesce(v_lot.available_pieces, 0) then
        raise exception 'Saldo de peças insuficiente no lote % (Disponível: %, Solicitado: %)',
          v_lot.lot_code, coalesce(v_lot.available_pieces, 0), v_planned_pieces;
      end if;
      v_piece_progress := jsonb_set(v_piece_progress, array[v_lot.id::text], to_jsonb(v_planned_pieces));

      -- Validação de tolerância de 5% se houver quantidade de peças de referência no item
      v_ref_pieces := coalesce(
        nullif(v_item->>'authorizedPieces', '')::integer,
        v_order_item.ordered_pieces
      );

      if v_ref_pieces is not null and v_ref_pieces > 0 then
        v_min_pieces := ceil(v_ref_pieces * 0.95);
        v_max_pieces := floor(v_ref_pieces * 1.05);
        if v_pieces < v_min_pieces or v_pieces > v_max_pieces then
          raise exception 'A quantidade de peças informada (%) está fora da tolerância de 5%% permitida (% a % peças para a referência de % peças)',
            v_pieces, v_min_pieces, v_max_pieces, v_ref_pieces;
        end if;
      end if;
    elsif v_item ? 'piecesQuantity' and nullif(v_item->>'piecesQuantity', '') is not null then
      raise exception 'Este produto não controla peças';
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

      -- 3. Atualiza pieces_quantity em stock_movements (garante consistência no relatório de movimentação)
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

-- 4. Função administrativa segura para cancelamento de Ordens de Produção (Em Andamento E Finalizada)
create or replace function public.cancel_production_order_administrative(
  p_order_id uuid,
  p_reason text,
  p_actor_id uuid,
  p_actor_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.production_orders%rowtype;
  v_consumption public.production_order_milk_consumptions%rowtype;
  v_lot public.milk_lots%rowtype;
  v_after numeric(14,4);
  v_status text;
  v_correlation uuid := gen_random_uuid();
  v_supply record;
  v_finished record;
  v_produced_lot record;
  v_has_milk boolean := false;
  v_downstream_sales integer;
  v_downstream_consumptions integer;
  v_downstream_exits integer;
  v_downstream_disposals integer;
begin
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Informe obrigatoriamente o motivo do cancelamento (mínimo 3 caracteres)';
  end if;

  select * into v_order
  from public.production_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Ordem de produção não encontrada';
  end if;

  if v_order.status = 'Cancelada' then
    return jsonb_build_object('order', to_jsonb(v_order), 'alreadyCancelled', true);
  end if;

  if v_order.status not in ('Em Andamento', 'Finalizada') then
    raise exception 'Status da OP (%) não permite cancelamento', v_order.status;
  end if;

  -- Se a OP estiver Finalizada, verificar rigorosamente se algum produto produzido já foi consumido ou vendido
  if v_order.status = 'Finalizada' then
    for v_produced_lot in
      select l.*, p.name as product_name
      from public.finished_product_lots l
      join public.finished_products p on p.id = l.product_id
      where l.production_order_id = p_order_id
      for update of l
    loop
      -- 1. Conferir se saldo disponível foi reduzido
      if v_produced_lot.available_quantity < v_produced_lot.quantity_produced then
        raise exception 'Não é possível cancelar a OP: o lote produzido % (%) já teve % kg consumidos/expedidos',
          v_produced_lot.lot_code, v_produced_lot.product_name, (v_produced_lot.quantity_produced - v_produced_lot.available_quantity);
      end if;

      if v_produced_lot.quantity_pieces is not null and v_produced_lot.available_pieces < v_produced_lot.quantity_pieces then
        raise exception 'Não é possível cancelar a OP: o lote produzido % (%) já teve % peças expedidas',
          v_produced_lot.lot_code, v_produced_lot.product_name, (v_produced_lot.quantity_pieces - v_produced_lot.available_pieces);
      end if;

      -- 2. Conferir vínculos de venda / expedição
      select count(*) into v_downstream_sales
      from public.sales_order_fulfillments
      where finished_product_lot_id = v_produced_lot.id;

      if v_downstream_sales > 0 then
        raise exception 'Não é possível cancelar a OP: o lote produzido % possui % atendimento(s) de venda vinculado(s)',
          v_produced_lot.lot_code, v_downstream_sales;
      end if;

      -- 3. Conferir consumo em outras OPs
      select count(*) into v_downstream_consumptions
      from public.production_order_finished_product_consumptions
      where finished_product_lot_id = v_produced_lot.id;

      if v_downstream_consumptions > 0 then
        raise exception 'Não é possível cancelar a OP: o lote produzido % foi consumido em outra ordem de produção',
          v_produced_lot.lot_code;
      end if;

      -- 4. Conferir saídas manuais
      select count(*) into v_downstream_exits
      from public.finished_product_manual_exits
      where finished_product_lot_id = v_produced_lot.id;

      if v_downstream_exits > 0 then
        raise exception 'Não é possível cancelar a OP: o lote produzido % possui saída manual registrada',
          v_produced_lot.lot_code;
      end if;

      -- 5. Conferir baixas por vencimento
      select count(*) into v_downstream_disposals
      from public.expired_lot_disposals
      where lot_id = v_produced_lot.id;

      if v_downstream_disposals > 0 then
        raise exception 'Não é possível cancelar a OP: o lote produzido % possui baixa de vencimento registrada',
          v_produced_lot.lot_code;
      end if;
    end loop;
  end if;

  -- ── REVERSÃO 1: Leite (Reservado ou Consumido) ───────────────────────────
  select * into v_consumption
  from public.production_order_milk_consumptions
  where production_order_id = p_order_id
  for update;

  if found and v_consumption.state in ('Reservado', 'Consumido') then
    v_has_milk := true;
    select * into v_lot
    from public.milk_lots
    where id = v_consumption.milk_lot_id
    for update;

    v_after := least(v_lot.volume_liters, v_lot.available_volume_liters + v_consumption.liters_consumed);
    v_status := case when v_after >= v_lot.volume_liters then 'Aprovado' else 'Parcialmente Utilizado' end;

    update public.milk_lots
    set available_volume_liters = v_after,
        status = v_status,
        updated_at = now(),
        updated_by = p_actor_id
    where id = v_lot.id;

    update public.production_order_milk_consumptions
    set state = 'Estornado',
        reversed_at = now(),
        updated_at = now(),
        updated_by = p_actor_id
    where id = v_consumption.id;

    insert into public.stock_movements (
      movement_type, lot_type, lot_id, quantity, reference_table, reference_id,
      created_by, updated_by
    ) values (
      'entrada', 'Leite', v_lot.id, v_consumption.liters_consumed,
      'production_order_cancellations', p_order_id, p_actor_id, p_actor_id
    );
  end if;

  -- ── REVERSÃO 2: Insumos consumidos ──────────────────────────────────────
  for v_supply in
    select c.supply_lot_id, c.quantity_consumed, l.received_quantity,
           l.available_quantity, l.supply_item_id
    from public.production_order_supply_consumptions c
    join public.supply_lots l on l.id = c.supply_lot_id
    where c.production_order_id = p_order_id
    order by c.supply_lot_id
    for update of l
  loop
    update public.supply_lots
    set available_quantity = least(v_supply.received_quantity, v_supply.available_quantity + v_supply.quantity_consumed),
        status = case
          when v_supply.available_quantity + v_supply.quantity_consumed >= v_supply.received_quantity then 'Disponivel'
          else 'Parcialmente Utilizado'
        end,
        updated_at = now(),
        updated_by = p_actor_id
    where id = v_supply.supply_lot_id;

    update public.supply_items
    set current_stock = current_stock + v_supply.quantity_consumed,
        updated_at = now(),
        updated_by = p_actor_id
    where id = v_supply.supply_item_id;

    insert into public.stock_movements (
      movement_type, lot_type, lot_id, quantity, reference_table, reference_id,
      created_by, updated_by
    ) values (
      'entrada', 'Insumo', v_supply.supply_lot_id, v_supply.quantity_consumed,
      'production_order_cancellations', p_order_id, p_actor_id, p_actor_id
    );
  end loop;

  -- ── REVERSÃO 3: Produtos acabados consumidos para reprocessamento ────────
  for v_finished in
    select c.finished_product_lot_id, c.quantity_consumed, c.pieces_consumed,
           c.consumption_source, l.available_quantity, l.returned_quantity,
           l.available_pieces
    from public.production_order_finished_product_consumptions c
    join public.finished_product_lots l on l.id = c.finished_product_lot_id
    where c.production_order_id = p_order_id
    order by c.finished_product_lot_id
    for update of l
  loop
    if v_finished.consumption_source = 'Devolucao' then
      update public.finished_product_lots
      set returned_quantity = v_finished.returned_quantity + v_finished.quantity_consumed,
          available_pieces = case
            when v_finished.pieces_consumed is null then available_pieces
            else coalesce(available_pieces, 0) + v_finished.pieces_consumed
          end,
          updated_at = now(),
          updated_by = p_actor_id
      where id = v_finished.finished_product_lot_id;
    else
      update public.finished_product_lots
      set available_quantity = v_finished.available_quantity + v_finished.quantity_consumed,
          available_pieces = case
            when v_finished.pieces_consumed is null then available_pieces
            else coalesce(available_pieces, 0) + v_finished.pieces_consumed
          end,
          updated_at = now(),
          updated_by = p_actor_id
      where id = v_finished.finished_product_lot_id;
    end if;

    insert into public.stock_movements (
      movement_type, lot_type, lot_id, quantity, pieces_quantity,
      reference_table, reference_id, created_by, updated_by
    ) values (
      'entrada', 'Produto Acabado', v_finished.finished_product_lot_id,
      v_finished.quantity_consumed, v_finished.pieces_consumed,
      'production_order_cancellations', p_order_id, p_actor_id, p_actor_id
    );
  end loop;

  -- ── REVERSÃO 4: Lotes gerados pela OP (Principal e Coprodutos) ───────────
  -- Se a OP gerou lotes (estava Finalizada), zerar saldos e registrar saída estornando a entrada original
  for v_produced_lot in
    select *
    from public.finished_product_lots
    where production_order_id = p_order_id
    for update
  loop
    -- Zerar saldo disponível e peças para não permitir utilização
    update public.finished_product_lots
    set available_quantity = 0,
        available_pieces = case when available_pieces is not null then 0 else null end,
        available_commercial_units = case when available_commercial_units is not null then 0 else null end,
        updated_at = now(),
        updated_by = p_actor_id
    where id = v_produced_lot.id;

    -- Movimento de saída para reverter a entrada da produção
    insert into public.stock_movements (
      movement_type, lot_type, lot_id, quantity, pieces_quantity,
      reference_table, reference_id, created_by, updated_by
    ) values (
      'saida', 'Produto Acabado', v_produced_lot.id,
      v_produced_lot.quantity_produced, v_produced_lot.quantity_pieces,
      'production_order_cancellations', p_order_id, p_actor_id, p_actor_id
    );
  end loop;

  -- ── REVERSÃO 5: Atualizar a Ordem de Produção ─────────────────────────────
  update public.production_orders
  set status = 'Cancelada',
      cancelled_at = now(),
      cancelled_by = p_actor_id,
      cancellation_reason = trim(p_reason),
      reversed_at = now(),
      reversed_by = p_actor_id,
      reversal_reason = trim(p_reason),
      updated_at = now(),
      updated_by = p_actor_id
  where id = p_order_id
  returning * into v_order;

  -- ── REVERSÃO 6: Auditoria em production_events ───────────────────────────
  insert into public.production_events (
    production_order_id, event_type, title, description,
    actor_id, actor_name, before_state, after_state, metadata, correlation_id
  ) values (
    p_order_id, 'order_cancelled',
    case when v_order.status = 'Finalizada' then 'OP finalizada cancelada administrativamente' else 'OP cancelada' end,
    format('OP cancelada por %s. Motivo: %s', coalesce(nullif(p_actor_name, ''), 'Administrador'), trim(p_reason)),
    p_actor_id, coalesce(nullif(p_actor_name, ''), 'Sistema'),
    jsonb_build_object('status', v_order.status),
    jsonb_build_object('status', 'Cancelada', 'cancellationReason', trim(p_reason)),
    jsonb_build_object('reason', trim(p_reason), 'cancelledAt', now(), 'reversedEffects', true),
    v_correlation
  );

  return jsonb_build_object(
    'order', to_jsonb(v_order),
    'correlationId', v_correlation,
    'success', true
  );
end;
$$;

-- Permissões na função de cancelamento administrativo
revoke all on function public.cancel_production_order_administrative(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.cancel_production_order_administrative(uuid, text, uuid, text) to service_role;
