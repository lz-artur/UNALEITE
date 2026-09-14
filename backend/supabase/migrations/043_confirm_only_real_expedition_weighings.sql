-- Linhas sem pesagem podem existir por tentativas antigas que falharam. Elas
-- são preservadas para auditoria, mas não participam da confirmação.
create or replace function public.confirm_sale_expedition(p_expedition_id uuid, p_user_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_expedition public.sale_expeditions%rowtype; v_order public.sales_orders%rowtype;
  v_line record; v_lot public.finished_product_lots%rowtype; v_order_item public.sales_order_items%rowtype;
  v_attendance_id uuid; v_attendance_number text; v_attendance_count integer;
  v_total numeric(14,4) := 0; v_progress jsonb := '{}'::jsonb;
  v_planned numeric(14,4); v_pending numeric(14,4); v_key text; v_extra numeric(14,4);
  v_all_conferred boolean; v_any_conferred boolean; v_status text;
begin
  select * into v_expedition from public.sale_expeditions where id = p_expedition_id for update;
  if not found then raise exception 'Expedição não encontrada'; end if;
  if v_expedition.status = 'expedida' then return v_expedition.attendance_id; end if;
  if v_expedition.status <> 'em_pesagem' then raise exception 'Esta expedição não pode ser confirmada'; end if;
  select * into v_order from public.sales_orders where id = v_expedition.sales_order_id for update;
  if not found or v_order.status in ('Atendido', 'Conferido', 'Cancelado') then raise exception 'O pedido não está disponível para expedição'; end if;

  -- Usa JOIN (não LEFT JOIN): só linhas com pesagem real podem compor a saída.
  if not exists (
    select 1 from public.sale_expedition_lines l
    join public.sale_expedition_weighings w on w.expedition_line_id = l.id
    where l.expedition_id = p_expedition_id and w.quantity > 0
  ) then raise exception 'Registre ao menos uma pesagem antes de confirmar a expedição'; end if;

  select count(*) into v_attendance_count from public.sale_attendances where sales_order_id = v_expedition.sales_order_id;
  v_attendance_number := 'EXP-' || (v_attendance_count + 1);
  insert into public.sale_attendances (sales_order_id, attendance_number, fulfilled_at, total_value, status, notes, created_by, updated_by)
  values (v_expedition.sales_order_id, v_attendance_number, now(), 0, 'Concluído', 'Expedição ' || v_expedition.expedition_number, p_user_id, p_user_id)
  returning id into v_attendance_id;

  for v_line in
    select l.sales_order_item_id, l.finished_product_lot_id, sum(w.quantity)::numeric(14,4) as weighed_quantity
    from public.sale_expedition_lines l
    join public.sale_expedition_weighings w on w.expedition_line_id = l.id
    where l.expedition_id = p_expedition_id
    group by l.sales_order_item_id, l.finished_product_lot_id
    having sum(w.quantity) > 0
  loop
    select * into v_lot from public.finished_product_lots where id = v_line.finished_product_lot_id for update;
    if not found then raise exception 'Lote de produto não encontrado'; end if;
    if v_line.weighed_quantity > v_lot.available_quantity then raise exception 'O lote % não possui saldo suficiente para a expedição', v_lot.lot_code; end if;
    select * into v_order_item from public.sales_order_items where id = v_line.sales_order_item_id and sales_order_id = v_expedition.sales_order_id for update;
    if not found or v_order_item.product_id <> v_lot.product_id then raise exception 'O lote não pertence ao item expedido'; end if;
    v_key := v_line.sales_order_item_id::text; v_planned := coalesce((v_progress ->> v_key)::numeric, 0);
    v_pending := v_order_item.ordered_quantity - v_order_item.fulfilled_quantity - v_planned;
    if v_line.weighed_quantity > v_pending then raise exception 'A expedição excede a quantidade pendente do item'; end if;
    v_progress := jsonb_set(v_progress, array[v_key], to_jsonb(round(v_planned + v_line.weighed_quantity, 4)));
    v_total := v_total + round(v_line.weighed_quantity * v_order_item.unit_price, 4);
    insert into public.sales_order_fulfillments (sales_order_id, sales_order_item_id, finished_product_lot_id, attendance_id, quantity, fulfilled_at, created_by, updated_by)
    values (v_expedition.sales_order_id, v_line.sales_order_item_id, v_line.finished_product_lot_id, v_attendance_id, v_line.weighed_quantity, now(), p_user_id, p_user_id);
    update public.finished_product_lots set available_quantity = round(available_quantity - v_line.weighed_quantity, 4), updated_at = now(), updated_by = p_user_id where id = v_line.finished_product_lot_id;
    insert into public.stock_movements (movement_type, lot_type, lot_id, quantity, reference_table, reference_id, created_by, updated_by)
    values ('saida', 'Produto Acabado', v_line.finished_product_lot_id, v_line.weighed_quantity, 'sale_expeditions', p_expedition_id, p_user_id, p_user_id);
  end loop;

  for v_key, v_extra in select key, value::text::numeric from jsonb_each(v_progress) loop
    select * into v_order_item from public.sales_order_items where id = v_key::uuid;
    insert into public.sale_attendance_items (attendance_id, sales_order_item_id, quantity, unit_price, total_value)
    values (v_attendance_id, v_key::uuid, v_extra, v_order_item.unit_price, round(v_extra * v_order_item.unit_price, 4));
    update public.sales_order_items set fulfilled_quantity = round(fulfilled_quantity + v_extra, 4), status = case when fulfilled_quantity + v_extra >= ordered_quantity then 'Conferido' else 'Parcialmente Conferido' end, updated_at = now(), updated_by = p_user_id where id = v_key::uuid;
  end loop;
  select bool_and(fulfilled_quantity >= ordered_quantity), bool_or(fulfilled_quantity > 0) into v_all_conferred, v_any_conferred from public.sales_order_items where sales_order_id = v_expedition.sales_order_id;
  v_status := case when v_all_conferred then 'Conferido' when v_any_conferred then 'Parcialmente Conferido' else 'Aberto' end;
  update public.sale_attendances set total_value = v_total where id = v_attendance_id;
  update public.sales_orders set status = v_status, updated_at = now(), updated_by = p_user_id where id = v_expedition.sales_order_id;
  update public.sale_expeditions set status = 'expedida', attendance_id = v_attendance_id, dispatched_at = now(), updated_at = now(), updated_by = p_user_id where id = p_expedition_id;
  return v_attendance_id;
end;
$$;
