create or replace function fulfill_sales_order_items(
  p_sales_order_id uuid,
  p_user_id uuid,
  p_fulfilled_at timestamptz,
  p_items jsonb
) returns void as $$
declare
  v_item jsonb;
  v_sales_order_item_id uuid;
  v_finished_product_lot_id uuid;
  v_quantity numeric;
  
  v_lot record;
  v_sales_order_item record;
  
  v_item_progress jsonb := '{}'::jsonb;
  v_already_planned numeric;
  v_pending_quantity numeric;
  
  v_soi_id text;
  v_extra_qty numeric;
  
  v_next_qty numeric;
  v_next_status text;
  v_all_fulfilled boolean;
  v_any_fulfilled boolean;
begin
  -- Validate the order exists
  if not exists (select 1 from sales_orders where id = p_sales_order_id) then
    raise exception 'Pedido não encontrado: %', p_sales_order_id;
  end if;

  -- Iterar sobre os items passados no JSON (array de objetos)
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_sales_order_item_id := (v_item->>'salesOrderItemId')::uuid;
    v_finished_product_lot_id := (v_item->>'finishedProductLotId')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;

    -- Validar lote
    select * into v_lot from finished_product_lots where id = v_finished_product_lot_id;
    if not found then
      raise exception 'Lote não encontrado: %', v_finished_product_lot_id;
    end if;

    if v_quantity > v_lot.available_quantity then
      raise exception 'O lote % não tem quantidade disponível suficiente', v_lot.lot_code;
    end if;

    -- Validar item do pedido
    select * into v_sales_order_item from sales_order_items where id = v_sales_order_item_id and sales_order_id = p_sales_order_id;
    if not found then
      raise exception 'Item do pedido não encontrado: %', v_sales_order_item_id;
    end if;

    -- Extrair o total planejado atual para o item
    v_already_planned := coalesce((v_item_progress->>(v_sales_order_item_id::text))::numeric, 0);
    
    -- Usando round 4 casas decimais para evitar falhas de precisao
    v_pending_quantity := round(v_sales_order_item.ordered_quantity - v_sales_order_item.fulfilled_quantity - v_already_planned, 4);

    if v_quantity > v_pending_quantity then
      raise exception 'A quantidade atendida do item % excede a quantidade pendente', v_sales_order_item_id;
    end if;

    -- Atualizar progresso localmente
    v_item_progress := jsonb_set(v_item_progress, array[v_sales_order_item_id::text], to_jsonb(round(v_already_planned + v_quantity, 4)));

    -- Inserir fulfillment
    insert into sales_order_fulfillments (
      sales_order_id,
      sales_order_item_id,
      finished_product_lot_id,
      quantity,
      fulfilled_at,
      created_by,
      updated_by
    ) values (
      p_sales_order_id,
      v_sales_order_item_id,
      v_finished_product_lot_id,
      v_quantity,
      p_fulfilled_at,
      p_user_id,
      p_user_id
    );

    -- Atualizar estoque do lote (com round 4 casas decimais)
    update finished_product_lots 
    set available_quantity = round(available_quantity - v_quantity, 4),
        updated_by = p_user_id
    where id = v_finished_product_lot_id;

    -- Inserir movimento de estoque
    insert into stock_movements (
      movement_type,
      lot_type,
      lot_id,
      quantity,
      reference_table,
      reference_id,
      created_by,
      updated_by
    ) values (
      'saida',
      'Produto Acabado',
      v_finished_product_lot_id,
      v_quantity,
      'sales_orders',
      p_sales_order_id,
      p_user_id,
      p_user_id
    );

  end loop;

  -- Agora atualiza os itens
  for v_soi_id, v_extra_qty in select key, value::text::numeric from jsonb_each(v_item_progress)
  loop
    select * into v_sales_order_item from sales_order_items where id = v_soi_id::uuid;
    
    -- Somando a quantidade atual e a extra com arredondamento seguro
    v_next_qty := round(v_sales_order_item.fulfilled_quantity + v_extra_qty, 4);
    
    if v_next_qty >= v_sales_order_item.ordered_quantity then
      v_next_status := 'Atendido';
    else
      v_next_status := 'Parcialmente Atendido';
    end if;

    update sales_order_items 
    set fulfilled_quantity = v_next_qty,
        status = v_next_status,
        updated_by = p_user_id
    where id = v_soi_id::uuid;
  end loop;

  -- Atualizar status do sales_order
  select 
    bool_and(fulfilled_quantity >= ordered_quantity),
    bool_or(fulfilled_quantity > 0)
  into v_all_fulfilled, v_any_fulfilled
  from sales_order_items where sales_order_id = p_sales_order_id;

  if v_all_fulfilled then
    v_next_status := 'Atendido';
  elsif v_any_fulfilled then
    v_next_status := 'Parcialmente Atendido';
  else
    v_next_status := 'Aberto';
  end if;

  update sales_orders
  set status = v_next_status,
      updated_by = p_user_id
  where id = p_sales_order_id;

end;
$$ language plpgsql;
