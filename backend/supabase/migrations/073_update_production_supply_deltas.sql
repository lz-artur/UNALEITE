-- Edits consume only the difference and retain the original lot traceability.
create or replace function public.update_production_order_supply_consumptions(
  p_order_id uuid,
  p_consumptions jsonb,
  p_expected_consumptions jsonb,
  p_actor_id uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_existing jsonb;
  v_expected jsonb;
  v_change record;
  v_lot public.supply_lots%rowtype;
  v_next numeric;
begin
  select status into v_status from public.production_orders where id = p_order_id for update;
  if not found then raise exception 'OP não encontrada.'; end if;
  if v_status not in ('Em Andamento', 'Finalizada') then
    raise exception 'Não é possível editar insumos de uma OP cancelada.';
  end if;

  if jsonb_typeof(p_consumptions) is distinct from 'array'
     or jsonb_typeof(p_expected_consumptions) is distinct from 'array' then
    raise exception 'Informe a lista de consumos de insumos.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_consumptions) as x("supplyLotId" uuid, quantity numeric)
    where x."supplyLotId" is null or x.quantity is null or x.quantity <= 0
  ) then raise exception 'Consumo de insumo inválido.'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('supplyLotId', lot_id, 'quantity', quantity) order by lot_id), '[]'::jsonb)
  into v_existing
  from (
    select supply_lot_id as lot_id, sum(quantity_consumed) as quantity
    from public.production_order_supply_consumptions where production_order_id = p_order_id
    group by supply_lot_id
  ) c;
  select coalesce(jsonb_agg(jsonb_build_object('supplyLotId', lot_id, 'quantity', quantity) order by lot_id), '[]'::jsonb)
  into v_expected
  from (
    select x."supplyLotId" as lot_id, sum(x.quantity) as quantity
    from jsonb_to_recordset(p_expected_consumptions) as x("supplyLotId" uuid, quantity numeric)
    group by x."supplyLotId"
  ) c;
  if v_existing <> v_expected then
    raise exception 'Os insumos desta OP foram alterados. Atualize a página e tente novamente.';
  end if;

  -- Lock all affected lots in a stable order; an exception rolls back every write.
  for v_change in
    with desired as (
      select x."supplyLotId" as lot_id, sum(x.quantity)::numeric(14,4) as quantity
      from jsonb_to_recordset(p_consumptions) as x("supplyLotId" uuid, quantity numeric)
      group by x."supplyLotId"
    ), previous as (
      select supply_lot_id as lot_id, sum(quantity_consumed) as quantity
      from public.production_order_supply_consumptions where production_order_id = p_order_id
      group by supply_lot_id
    )
    select coalesce(d.lot_id, p.lot_id) as lot_id, coalesce(d.quantity, 0) as quantity,
           coalesce(d.quantity, 0) - coalesce(p.quantity, 0) as delta
    from desired d full join previous p on p.lot_id = d.lot_id
    where coalesce(d.quantity, 0) <> coalesce(p.quantity, 0)
    order by lot_id
  loop
    select * into v_lot from public.supply_lots where id = v_change.lot_id for update;
    if not found then raise exception 'Lote de insumo não encontrado.'; end if;
    v_next := v_lot.available_quantity - v_change.delta;
    if v_next < 0 then
      raise exception 'O lote de insumo % não possui saldo disponível suficiente.', v_lot.internal_lot_code;
    end if;
    if v_change.delta > 0 and v_lot.status not in ('Disponivel', 'Parcialmente Utilizado') then
      raise exception 'O lote de insumo % não está disponível para consumo.', v_lot.internal_lot_code;
    end if;

    -- Unchanged lots never reach this loop and keep their records and movements.
    delete from public.production_order_supply_consumptions
    where production_order_id = p_order_id and supply_lot_id = v_change.lot_id;
    if v_change.quantity > 0 then
      insert into public.production_order_supply_consumptions(
        production_order_id, supply_lot_id, quantity_consumed, created_by, updated_by
      ) values (p_order_id, v_change.lot_id, v_change.quantity, p_actor_id, p_actor_id);
    end if;
    update public.supply_lots
    set available_quantity = v_next,
        status = case
          when status in ('Bloqueado', 'Vencido') then status
          when v_next <= 0 then 'Utilizado'
          when v_next >= received_quantity then 'Disponivel'
          else 'Parcialmente Utilizado' end,
        updated_at = now(), updated_by = p_actor_id
    where id = v_change.lot_id;
    update public.supply_items
    set current_stock = current_stock - v_change.delta, updated_at = now(), updated_by = p_actor_id
    where id = v_lot.supply_item_id;
    insert into public.stock_movements(
      movement_type, lot_type, lot_id, quantity, reference_table, reference_id, created_by, updated_by
    ) values (
      case when v_change.delta > 0 then 'saida' else 'entrada' end,
      'Insumo', v_change.lot_id, abs(v_change.delta), 'production_orders', p_order_id, p_actor_id, p_actor_id
    );
  end loop;
end;
$$;

revoke all on function public.update_production_order_supply_consumptions(uuid, jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.update_production_order_supply_consumptions(uuid, jsonb, jsonb, uuid) to service_role;
