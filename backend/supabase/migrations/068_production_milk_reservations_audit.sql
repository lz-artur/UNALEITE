-- 068: Reserva transacional de leite e trilha visual da produção.

alter table public.production_order_milk_consumptions
  add column if not exists state text,
  add column if not exists reserved_at timestamptz,
  add column if not exists consumed_at timestamptz,
  add column if not exists reversed_at timestamptz;

update public.production_order_milk_consumptions c
set state = case
      when po.status = 'Finalizada' then 'Consumido'
      when po.status in ('Cancelada', 'Estornada') then 'Estornado'
      else 'Reservado'
    end,
    reserved_at = coalesce(c.reserved_at, c.created_at),
    consumed_at = case
      when po.status = 'Finalizada' then coalesce(c.consumed_at, po.finished_at, c.updated_at)
      else c.consumed_at
    end,
    reversed_at = case
      when po.status in ('Cancelada', 'Estornada') then coalesce(c.reversed_at, c.updated_at)
      else c.reversed_at
    end
from public.production_orders po
where po.id = c.production_order_id
  and c.state is null;

alter table public.production_order_milk_consumptions
  alter column state set default 'Reservado';

alter table public.production_order_milk_consumptions
  alter column state set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'production_order_milk_consumptions_state_check'
  ) then
    alter table public.production_order_milk_consumptions
      add constraint production_order_milk_consumptions_state_check
      check (state in ('Reservado', 'Consumido', 'Estornado'));
  end if;
end $$;

create unique index if not exists ux_production_order_milk_consumption_order
  on public.production_order_milk_consumptions(production_order_id);

alter table public.production_orders
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid,
  add column if not exists cancellation_reason text,
  add column if not exists reversed_at timestamptz,
  add column if not exists reversed_by uuid,
  add column if not exists reversal_reason text;

create table if not exists public.production_events (
  id uuid primary key default gen_random_uuid(),
  production_order_id uuid references public.production_orders(id) on delete set null,
  milk_lot_id uuid references public.milk_lots(id) on delete set null,
  event_type text not null,
  title text not null,
  description text not null,
  actor_id uuid,
  actor_name text not null default 'Sistema',
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  correlation_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create index if not exists idx_production_events_order
  on public.production_events(production_order_id, created_at desc);
create index if not exists idx_production_events_milk_lot
  on public.production_events(milk_lot_id, created_at desc);
create index if not exists idx_production_events_correlation
  on public.production_events(correlation_id);
create index if not exists idx_production_events_type
  on public.production_events(event_type, created_at desc);

alter table public.production_events enable row level security;

create or replace function public.create_production_order_with_milk_reservation(
  p_order_number text,
  p_milk_lot_id uuid,
  p_product_id uuid,
  p_liters numeric,
  p_expected_yield numeric,
  p_fat_adjustment_kg numeric,
  p_unit_cost numeric,
  p_actor_id uuid,
  p_actor_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lot public.milk_lots%rowtype;
  v_order public.production_orders%rowtype;
  v_available numeric(14,4);
  v_status text;
  v_correlation uuid := gen_random_uuid();
begin
  if p_liters is null or p_liters <= 0 then
    raise exception 'Informe um volume de leite maior que zero';
  end if;

  select * into v_lot
  from public.milk_lots
  where id = p_milk_lot_id
  for update;

  if not found then
    raise exception 'Lote de leite não encontrado';
  end if;

  if v_lot.status not in ('Aprovado', 'Parcialmente Utilizado') then
    raise exception 'O lote de leite não está disponível para produção';
  end if;

  if v_lot.available_volume_liters < p_liters then
    raise exception 'Saldo insuficiente no lote de leite. Disponível: % L', v_lot.available_volume_liters;
  end if;

  v_available := v_lot.available_volume_liters - p_liters;
  v_status := case when v_available <= 0 then 'Utilizado' else 'Parcialmente Utilizado' end;

  insert into public.production_orders (
    order_number, milk_lot_id, product_id, liters_planned, expected_yield,
    fat_adjustment_kg, status, started_at, created_by, updated_by
  ) values (
    p_order_number, p_milk_lot_id, p_product_id, p_liters, p_expected_yield,
    p_fat_adjustment_kg, 'Em Andamento', now(), p_actor_id, p_actor_id
  ) returning * into v_order;

  insert into public.production_order_milk_consumptions (
    production_order_id, milk_lot_id, liters_consumed, unit_cost, state,
    reserved_at, created_by, updated_by
  ) values (
    v_order.id, p_milk_lot_id, p_liters, p_unit_cost, 'Reservado',
    now(), p_actor_id, p_actor_id
  );

  update public.milk_lots
  set available_volume_liters = v_available,
      status = v_status,
      updated_at = now(),
      updated_by = p_actor_id
  where id = p_milk_lot_id;

  insert into public.production_events (
    production_order_id, milk_lot_id, event_type, title, description,
    actor_id, actor_name, before_state, after_state, metadata, correlation_id
  ) values (
    v_order.id, p_milk_lot_id, 'order_created', 'OP criada e leite reservado',
    format('%s L reservados do lote %s.', p_liters, v_lot.code),
    p_actor_id, coalesce(nullif(p_actor_name, ''), 'Sistema'),
    jsonb_build_object('availableVolumeLiters', v_lot.available_volume_liters, 'status', v_lot.status),
    jsonb_build_object('availableVolumeLiters', v_available, 'status', v_status),
    jsonb_build_object('litersReserved', p_liters, 'milkLotCode', v_lot.code),
    v_correlation
  );

  return jsonb_build_object('order', to_jsonb(v_order), 'correlationId', v_correlation);
end;
$$;

create or replace function public.update_production_order_milk_reservation(
  p_order_id uuid,
  p_new_milk_lot_id uuid,
  p_new_liters numeric,
  p_expected_yield numeric,
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
  v_old_lot public.milk_lots%rowtype;
  v_new_lot public.milk_lots%rowtype;
  v_old_after numeric(14,4);
  v_new_after numeric(14,4);
  v_correlation uuid := gen_random_uuid();
begin
  if p_new_liters is null or p_new_liters <= 0 then
    raise exception 'Informe um volume de leite maior que zero';
  end if;

  select * into v_order from public.production_orders where id = p_order_id for update;
  if not found then raise exception 'Ordem de produção não encontrada'; end if;
  if v_order.status <> 'Em Andamento' then
    raise exception 'Somente uma OP em andamento pode alterar a reserva de leite';
  end if;

  select * into v_consumption
  from public.production_order_milk_consumptions
  where production_order_id = p_order_id
  for update;
  if not found or v_consumption.state <> 'Reservado' then
    raise exception 'A reserva de leite desta OP não foi encontrada';
  end if;

  perform 1 from public.milk_lots
  where id in (v_consumption.milk_lot_id, p_new_milk_lot_id)
  order by id
  for update;

  select * into v_old_lot from public.milk_lots where id = v_consumption.milk_lot_id;
  select * into v_new_lot from public.milk_lots where id = p_new_milk_lot_id;
  if not found then raise exception 'Novo lote de leite não encontrado'; end if;

  if v_old_lot.id = v_new_lot.id then
    v_new_after := v_old_lot.available_volume_liters + v_consumption.liters_consumed - p_new_liters;
    if v_new_after < 0 then
      raise exception 'Saldo insuficiente no lote de leite. Disponível após liberar a reserva atual: % L',
        v_old_lot.available_volume_liters + v_consumption.liters_consumed;
    end if;

    update public.milk_lots
    set available_volume_liters = v_new_after,
        status = case
          when v_new_after <= 0 then 'Utilizado'
          when v_new_after >= volume_liters then 'Aprovado'
          else 'Parcialmente Utilizado'
        end,
        updated_at = now(), updated_by = p_actor_id
    where id = v_old_lot.id;
  else
    if v_new_lot.status not in ('Aprovado', 'Parcialmente Utilizado') then
      raise exception 'O novo lote de leite não está disponível para produção';
    end if;
    if v_new_lot.available_volume_liters < p_new_liters then
      raise exception 'Saldo insuficiente no novo lote de leite. Disponível: % L', v_new_lot.available_volume_liters;
    end if;

    v_old_after := least(v_old_lot.volume_liters, v_old_lot.available_volume_liters + v_consumption.liters_consumed);
    v_new_after := v_new_lot.available_volume_liters - p_new_liters;

    update public.milk_lots
    set available_volume_liters = v_old_after,
        status = case when v_old_after >= volume_liters then 'Aprovado' else 'Parcialmente Utilizado' end,
        updated_at = now(), updated_by = p_actor_id
    where id = v_old_lot.id;

    update public.milk_lots
    set available_volume_liters = v_new_after,
        status = case when v_new_after <= 0 then 'Utilizado' else 'Parcialmente Utilizado' end,
        updated_at = now(), updated_by = p_actor_id
    where id = v_new_lot.id;
  end if;

  update public.production_orders
  set milk_lot_id = p_new_milk_lot_id,
      liters_planned = p_new_liters,
      expected_yield = p_expected_yield,
      updated_at = now(), updated_by = p_actor_id
  where id = p_order_id
  returning * into v_order;

  update public.production_order_milk_consumptions
  set milk_lot_id = p_new_milk_lot_id,
      liters_consumed = p_new_liters,
      unit_cost = v_new_lot.cost_per_liter,
      updated_at = now(), updated_by = p_actor_id
  where id = v_consumption.id;

  insert into public.production_events (
    production_order_id, milk_lot_id, event_type, title, description,
    actor_id, actor_name, before_state, after_state, metadata, correlation_id
  ) values (
    p_order_id, p_new_milk_lot_id, 'order_updated', 'Reserva de leite alterada',
    format('Reserva alterada de %s L para %s L.', v_consumption.liters_consumed, p_new_liters),
    p_actor_id, coalesce(nullif(p_actor_name, ''), 'Sistema'),
    jsonb_build_object('milkLotId', v_consumption.milk_lot_id, 'litersReserved', v_consumption.liters_consumed),
    jsonb_build_object('milkLotId', p_new_milk_lot_id, 'litersReserved', p_new_liters),
    jsonb_build_object('oldMilkLotCode', v_old_lot.code, 'newMilkLotCode', v_new_lot.code),
    v_correlation
  );

  return jsonb_build_object('order', to_jsonb(v_order), 'correlationId', v_correlation);
end;
$$;

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
begin
  select * into v_order from public.production_orders where id = p_order_id for update;
  if not found then raise exception 'Ordem de produção não encontrada'; end if;
  if v_order.status <> 'Em Andamento' then raise exception 'A OP não está em andamento'; end if;

  select * into v_consumption
  from public.production_order_milk_consumptions
  where production_order_id = p_order_id
  for update;
  if not found or v_consumption.state <> 'Reservado' then
    raise exception 'A reserva de leite desta OP não está ativa';
  end if;

  select * into v_lot from public.milk_lots where id = v_consumption.milk_lot_id;

  update public.production_orders
  set actual_quantity_produced = p_actual_quantity,
      actual_yield = p_actual_yield,
      status = 'Finalizada', finished_at = now(), updated_at = now(), updated_by = p_actor_id
  where id = p_order_id
  returning * into v_order;

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

  return jsonb_build_object('order', to_jsonb(v_order), 'correlationId', v_correlation);
end;
$$;

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
  if not found or v_consumption.state <> 'Reservado' then raise exception 'A reserva de leite desta OP não está ativa'; end if;

  select * into v_lot from public.milk_lots where id = v_consumption.milk_lot_id for update;
  v_after := least(v_lot.volume_liters, v_lot.available_volume_liters + v_consumption.liters_consumed);
  v_status := case when v_after >= v_lot.volume_liters then 'Aprovado' else 'Parcialmente Utilizado' end;

  update public.milk_lots
  set available_volume_liters = v_after, status = v_status, updated_at = now(), updated_by = p_actor_id
  where id = v_lot.id;

  update public.production_order_milk_consumptions
  set state = 'Estornado', reversed_at = now(), updated_at = now(), updated_by = p_actor_id
  where id = v_consumption.id;

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

  return jsonb_build_object('order', to_jsonb(v_order), 'correlationId', v_correlation);
end;
$$;

revoke all on function public.create_production_order_with_milk_reservation(text,uuid,uuid,numeric,numeric,numeric,numeric,uuid,text) from public, anon, authenticated;
revoke all on function public.update_production_order_milk_reservation(uuid,uuid,numeric,numeric,uuid,text) from public, anon, authenticated;
revoke all on function public.complete_production_order_milk_reservation(uuid,numeric,numeric,uuid,text) from public, anon, authenticated;
revoke all on function public.cancel_production_order_with_reservations(uuid,text,uuid,text) from public, anon, authenticated;
grant execute on function public.create_production_order_with_milk_reservation(text,uuid,uuid,numeric,numeric,numeric,numeric,uuid,text) to service_role;
grant execute on function public.update_production_order_milk_reservation(uuid,uuid,numeric,numeric,uuid,text) to service_role;
grant execute on function public.complete_production_order_milk_reservation(uuid,numeric,numeric,uuid,text) to service_role;
grant execute on function public.cancel_production_order_with_reservations(uuid,text,uuid,text) to service_role;

-- OPs existentes recebem um marco de importação. Ele deixa explícito que o
-- histórico anterior foi reconstruído a partir do estado persistido, e não de
-- eventos em tempo real que não existiam antes desta versão.
insert into public.production_events (
  production_order_id, milk_lot_id, event_type, title, description,
  actor_name, before_state, after_state, metadata, created_at
)
select
  po.id,
  c.milk_lot_id,
  'historical_state_imported',
  'Estado histórico importado',
  'O estado da OP e do consumo de leite foi importado para a nova trilha de auditoria.',
  'Migração 068',
  '{}'::jsonb,
  jsonb_build_object(
    'orderStatus', po.status,
    'milkState', c.state,
    'liters', c.liters_consumed
  ),
  jsonb_build_object('source', 'migration_068'),
  coalesce(po.finished_at, po.started_at, po.created_at)
from public.production_orders po
join public.production_order_milk_consumptions c on c.production_order_id = po.id
where not exists (
  select 1
  from public.production_events e
  where e.production_order_id = po.id
    and e.event_type = 'historical_state_imported'
);

-- Correção idempotente dos dois casos confirmados. Em bancos onde os registros
-- não existem (desenvolvimento/testes), o bloco apenas não executa o ajuste.
do $$
declare
  v_lot public.milk_lots%rowtype;
  v_order public.production_orders%rowtype;
begin
  select * into v_lot from public.milk_lots where code = 'LT-2026-1789989268744';
  if found then
    select * into v_order from public.production_orders
    where order_number = 'OP-2026-1790012486088' and milk_lot_id = v_lot.id;
    if not found or v_lot.volume_liters <> 8116 or v_order.liters_planned <> 8116 then
      raise exception 'Pré-condições divergentes para corrigir LT-2026-1789989268744';
    end if;
    update public.milk_lots set available_volume_liters = 0, status = 'Utilizado', updated_at = now() where id = v_lot.id;
    update public.production_order_milk_consumptions
      set state = 'Reservado', reserved_at = coalesce(reserved_at, created_at), updated_at = now()
      where production_order_id = v_order.id;
    if not exists (select 1 from public.production_events where production_order_id = v_order.id and event_type = 'balance_reconciled') then
      insert into public.production_events(production_order_id,milk_lot_id,event_type,title,description,actor_name,before_state,after_state,metadata)
      values(v_order.id,v_lot.id,'balance_reconciled','Saldo do lote reconciliado','O saldo alocável foi corrigido com base na reserva integral da OP.','Migração 068',jsonb_build_object('availableVolumeLiters',v_lot.available_volume_liters),jsonb_build_object('availableVolumeLiters',0),jsonb_build_object('reason','Reserva integral já registrada na OP'));
    end if;
  end if;

  select * into v_lot from public.milk_lots where code = 'LT-2026-1789988003355';
  if found then
    select * into v_order from public.production_orders
    where order_number = 'OP-2026-1790012132762' and milk_lot_id = v_lot.id;
    if not found or v_lot.volume_liters <> 11087 or v_order.liters_planned <> 11087 or v_order.status <> 'Finalizada' then
      raise exception 'Pré-condições divergentes para corrigir LT-2026-1789988003355';
    end if;
    update public.milk_lots set available_volume_liters = 0, status = 'Utilizado', updated_at = now() where id = v_lot.id;
    update public.production_order_milk_consumptions
      set state = 'Consumido', consumed_at = coalesce(consumed_at, v_order.finished_at), updated_at = now()
      where production_order_id = v_order.id;
    if not exists (select 1 from public.production_events where production_order_id = v_order.id and event_type = 'balance_reconciled') then
      insert into public.production_events(production_order_id,milk_lot_id,event_type,title,description,actor_name,before_state,after_state,metadata)
      values(v_order.id,v_lot.id,'balance_reconciled','Saldo do lote reconciliado','O saldo alocável foi corrigido a partir do consumo e da movimentação já registrados.','Migração 068',jsonb_build_object('availableVolumeLiters',v_lot.available_volume_liters),jsonb_build_object('availableVolumeLiters',0),jsonb_build_object('reason','Consumo integral e saída de estoque já registrados'));
    end if;
  end if;
end $$;
