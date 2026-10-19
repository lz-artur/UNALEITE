-- 074: Produção Secundária (Derivados e Coprodutos) sem obrigatoriedade de leite

-- 1. finished_products: tipo de produção e apresentação comercial
alter table public.finished_products
  add column if not exists production_type text not null default 'Primario',
  add column if not exists commercial_presentation text,
  add column if not exists package_size text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'finished_products_production_type_check'
  ) then
    alter table public.finished_products
      add constraint finished_products_production_type_check
      check (production_type in ('Primario', 'Secundario'));
  end if;
end $$;

comment on column public.finished_products.production_type is
  'Tipo de produção: Primario (processa leite) ou Secundario (processa derivados/coprodutos/insumos sem leite).';
comment on column public.finished_products.commercial_presentation is
  'Descrição da embalagem comercial (ex: Pote 200g, Garrafa 200ml, Pacote 500g).';
comment on column public.finished_products.package_size is
  'Tamanho unitário da embalagem na unidade de estoque (ex: 200g, 500g, 1kg, 900ml).';

-- 2. production_orders: permitir OP sem lote de leite e novos campos comerciais
alter table public.production_orders
  alter column milk_lot_id drop not null,
  alter column liters_planned drop not null;

alter table public.production_orders
  add column if not exists production_type text not null default 'Primario',
  add column if not exists commercial_units_produced integer,
  add column if not exists package_size text,
  add column if not exists commercial_presentation text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'production_orders_production_type_check'
  ) then
    alter table public.production_orders
      add constraint production_orders_production_type_check
      check (production_type in ('Primario', 'Secundario'));
  end if;
end $$;

-- 3. finished_product_lots: registrar apresentação e unidades comerciais
alter table public.finished_product_lots
  add column if not exists commercial_units integer,
  add column if not exists available_commercial_units integer,
  add column if not exists commercial_presentation text;

-- 4. Atualizar complete_production_order_milk_reservation para suportar OPs secundárias (sem leite)
create or replace function public.complete_production_order_milk_reservation(
  p_order_id uuid,
  p_actual_quantity numeric,
  p_actual_yield numeric,
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
  v_correlation uuid := gen_random_uuid();
  v_has_milk boolean := false;
begin
  select * into v_order from public.production_orders where id = p_order_id for update;
  if not found then raise exception 'Ordem de produção não encontrada'; end if;
  if v_order.status <> 'Em Andamento' then raise exception 'A OP não está em andamento'; end if;

  select * into v_consumption
  from public.production_order_milk_consumptions
  where production_order_id = p_order_id
  for update;

  if found and v_consumption.state = 'Reservado' then
    v_has_milk := true;
    select * into v_lot from public.milk_lots where id = v_consumption.milk_lot_id;
  end if;

  update public.production_orders
  set actual_quantity_produced = p_actual_quantity,
      actual_yield = p_actual_yield,
      status = 'Finalizada',
      finished_at = now(),
      updated_at = now(),
      updated_by = p_actor_id
  where id = p_order_id
  returning * into v_order;

  if v_has_milk then
    update public.production_order_milk_consumptions
    set state = 'Consumido', consumed_at = now(), updated_at = now(), updated_by = p_actor_id
    where id = v_consumption.id;

    insert into public.production_events (
      production_order_id, milk_lot_id, event_type, title, description,
      actor_id, actor_name, before_state, after_state, metadata, correlation_id
    ) values (
      p_order_id, v_consumption.milk_lot_id, 'order_completed', 'OP finalizada',
      format('A reserva de %s L do lote %s foi convertida em consumo.', v_consumption.liters_consumed, v_lot.code),
      p_actor_id, coalesce(nullif(p_actor_name, ''), 'Sistema'),
      jsonb_build_object('status', 'Em Andamento', 'milkState', 'Reservado'),
      jsonb_build_object('status', 'Finalizada', 'milkState', 'Consumido', 'actualQuantityProduced', p_actual_quantity),
      jsonb_build_object('litersConsumed', v_consumption.liters_consumed, 'milkLotCode', v_lot.code),
      v_correlation
    );
  else
    insert into public.production_events (
      production_order_id, event_type, title, description,
      actor_id, actor_name, before_state, after_state, metadata, correlation_id
    ) values (
      p_order_id, 'order_completed', 'OP finalizada',
      format('OP secundária finalizada. Quantidade produzida: %s.', p_actual_quantity),
      p_actor_id, coalesce(nullif(p_actor_name, ''), 'Sistema'),
      jsonb_build_object('status', 'Em Andamento'),
      jsonb_build_object('status', 'Finalizada', 'actualQuantityProduced', p_actual_quantity),
      jsonb_build_object('actualQuantityProduced', p_actual_quantity),
      v_correlation
    );
  end if;

  return jsonb_build_object('order', to_jsonb(v_order), 'correlationId', v_correlation);
end;
$$;

-- 5. Atualizar cancel_production_order_with_reservations para suportar OPs secundárias (sem leite)
create or replace function public.cancel_production_order_with_reservations(
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
  v_has_milk boolean := false;
begin
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Informe o motivo do cancelamento'; end if;

  select * into v_order from public.production_orders where id = p_order_id for update;
  if not found then raise exception 'Ordem de produção não encontrada'; end if;
  if v_order.status = 'Cancelada' then return jsonb_build_object('order', to_jsonb(v_order), 'alreadyCancelled', true); end if;
  if v_order.status <> 'Em Andamento' then raise exception 'Somente uma OP em andamento pode ser cancelada'; end if;

  select * into v_consumption
  from public.production_order_milk_consumptions
  where production_order_id = p_order_id
  for update;

  if found and v_consumption.state = 'Reservado' then
    v_has_milk := true;
    select * into v_lot from public.milk_lots where id = v_consumption.milk_lot_id for update;
    v_after := least(v_lot.volume_liters, v_lot.available_volume_liters + v_consumption.liters_consumed);
    v_status := case when v_after >= v_lot.volume_liters then 'Aprovado' else 'Parcialmente Utilizado' end;

    update public.milk_lots
    set available_volume_liters = v_after, status = v_status, updated_at = now(), updated_by = p_actor_id
    where id = v_lot.id;

    update public.production_order_milk_consumptions
    set state = 'Estornado', reversed_at = now(), updated_at = now(), updated_by = p_actor_id
    where id = v_consumption.id;
  end if;

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
        updated_at = now(), updated_by = p_actor_id
    where id = v_supply.supply_lot_id;

    update public.supply_items
    set current_stock = current_stock + v_supply.quantity_consumed,
        updated_at = now(), updated_by = p_actor_id
    where id = v_supply.supply_item_id;

    insert into public.stock_movements(
      movement_type, lot_type, lot_id, quantity, reference_table, reference_id,
      created_by, updated_by
    ) values (
      'entrada', 'Insumo', v_supply.supply_lot_id, v_supply.quantity_consumed,
      'production_order_cancellations', p_order_id, p_actor_id, p_actor_id
    );
  end loop;

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
          available_pieces = case when v_finished.pieces_consumed is null then available_pieces else coalesce(available_pieces, 0) + v_finished.pieces_consumed end,
          updated_at = now(), updated_by = p_actor_id
      where id = v_finished.finished_product_lot_id;
    else
      update public.finished_product_lots
      set available_quantity = v_finished.available_quantity + v_finished.quantity_consumed,
          available_pieces = case when v_finished.pieces_consumed is null then available_pieces else coalesce(available_pieces, 0) + v_finished.pieces_consumed end,
          updated_at = now(), updated_by = p_actor_id
      where id = v_finished.finished_product_lot_id;
    end if;

    insert into public.stock_movements(
      movement_type, lot_type, lot_id, quantity, pieces_quantity,
      reference_table, reference_id, created_by, updated_by
    ) values (
      'entrada', 'Produto Acabado', v_finished.finished_product_lot_id,
      v_finished.quantity_consumed, v_finished.pieces_consumed,
      'production_order_cancellations', p_order_id, p_actor_id, p_actor_id
    );
  end loop;

  update public.production_orders
  set status = 'Cancelada', cancelled_at = now(), cancelled_by = p_actor_id,
      cancellation_reason = trim(p_reason), updated_at = now(), updated_by = p_actor_id
  where id = p_order_id
  returning * into v_order;

  if v_has_milk then
    insert into public.production_events (
      production_order_id, milk_lot_id, event_type, title, description,
      actor_id, actor_name, before_state, after_state, metadata, correlation_id
    ) values (
      p_order_id, v_lot.id, 'order_cancelled', 'OP cancelada e reserva liberada',
      format('%s L retornaram ao lote %s.', v_consumption.liters_consumed, v_lot.code),
      p_actor_id, coalesce(nullif(p_actor_name, ''), 'Sistema'),
      jsonb_build_object('status', 'Em Andamento', 'availableVolumeLiters', v_lot.available_volume_liters),
      jsonb_build_object('status', 'Cancelada', 'availableVolumeLiters', v_after),
      jsonb_build_object('reason', trim(p_reason), 'litersRestored', v_consumption.liters_consumed, 'milkLotCode', v_lot.code),
      v_correlation
    );
  else
    insert into public.production_events (
      production_order_id, event_type, title, description,
      actor_id, actor_name, before_state, after_state, metadata, correlation_id
    ) values (
      p_order_id, 'order_cancelled', 'OP secundária cancelada',
      'OP secundária cancelada e materiais devolvidos ao estoque.',
      p_actor_id, coalesce(nullif(p_actor_name, ''), 'Sistema'),
      jsonb_build_object('status', 'Em Andamento'),
      jsonb_build_object('status', 'Cancelada'),
      jsonb_build_object('reason', trim(p_reason)),
      v_correlation
    );
  end if;

  return jsonb_build_object('order', to_jsonb(v_order), 'correlationId', v_correlation);
end;
$$;

revoke all on function public.complete_production_order_milk_reservation(uuid,numeric,numeric,uuid,text) from public, anon, authenticated;
revoke all on function public.cancel_production_order_with_reservations(uuid,text,uuid,text) from public, anon, authenticated;
grant execute on function public.complete_production_order_milk_reservation(uuid,numeric,numeric,uuid,text) to service_role;
grant execute on function public.cancel_production_order_with_reservations(uuid,text,uuid,text) to service_role;
