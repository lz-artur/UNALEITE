-- Mantém KG como unidade financeira/da receita e adiciona a contagem física
-- de peças somente quando o lote de queijo informar essa segunda medida.
alter table public.finished_product_lots
  add column if not exists quantity_pieces integer null check (quantity_pieces is null or quantity_pieces >= 0),
  add column if not exists available_pieces integer null check (available_pieces is null or available_pieces >= 0);

alter table public.sale_expedition_weighings
  add column if not exists pieces_quantity integer null check (pieces_quantity is null or pieces_quantity > 0);

-- Uma pesagem de queijo leva as duas medidas. A quantidade em kg continua
-- governando o atendimento do pedido e a precificação; peças governam o saldo físico.
create or replace function public.register_sale_expedition_weighing(
  p_expedition_id uuid,
  p_sales_order_item_id uuid,
  p_finished_product_lot_id uuid,
  p_quantity numeric,
  p_notes text,
  p_user_id uuid,
  p_pieces_quantity integer default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_expedition public.sale_expeditions%rowtype; v_order_item public.sales_order_items%rowtype;
  v_lot public.finished_product_lots%rowtype; v_line_id uuid; v_item_weighed numeric(14,4);
  v_lot_weighed numeric(14,4); v_lot_pieces integer; v_pending numeric(14,4); v_weighing_id uuid;
begin
  if p_quantity is null or p_quantity <= 0 then raise exception 'Informe uma pesagem maior que zero'; end if;
  select * into v_expedition from public.sale_expeditions where id = p_expedition_id for update;
  if not found or v_expedition.status <> 'em_pesagem' then raise exception 'Esta expedição não está aberta para pesagem'; end if;
  select * into v_order_item from public.sales_order_items where id = p_sales_order_item_id and sales_order_id = v_expedition.sales_order_id for update;
  if not found then raise exception 'Item do pedido não encontrado'; end if;
  select * into v_lot from public.finished_product_lots where id = p_finished_product_lot_id for update;
  if not found or v_lot.product_id <> v_order_item.product_id then raise exception 'Selecione um lote correspondente ao produto do pedido'; end if;
  if v_lot.available_pieces is not null and (p_pieces_quantity is null or p_pieces_quantity <= 0) then raise exception 'Informe a quantidade de peças para o lote de queijo'; end if;
  if v_lot.available_pieces is null and p_pieces_quantity is not null then raise exception 'Este lote não controla saldo em peças'; end if;
  select coalesce(sum(w.quantity), 0) into v_item_weighed from public.sale_expedition_weighings w join public.sale_expedition_lines l on l.id = w.expedition_line_id where l.expedition_id = p_expedition_id and l.sales_order_item_id = p_sales_order_item_id;
  v_pending := v_order_item.ordered_quantity - v_order_item.fulfilled_quantity;
  if v_item_weighed + p_quantity > v_pending + 0.0001 then raise exception 'A pesagem excede o saldo pendente do pedido (%)', v_pending; end if;
  select coalesce(sum(w.quantity), 0), coalesce(sum(w.pieces_quantity), 0)::integer into v_lot_weighed, v_lot_pieces from public.sale_expedition_weighings w join public.sale_expedition_lines l on l.id = w.expedition_line_id where l.expedition_id = p_expedition_id and l.finished_product_lot_id = p_finished_product_lot_id;
  if v_lot_weighed + p_quantity > v_lot.available_quantity + 0.0001 then raise exception 'O lote % não possui KG suficiente para esta pesagem', v_lot.lot_code; end if;
  if p_pieces_quantity is not null and v_lot_pieces + p_pieces_quantity > v_lot.available_pieces then raise exception 'O lote % não possui peças suficientes para esta pesagem', v_lot.lot_code; end if;
  select id into v_line_id from public.sale_expedition_lines where expedition_id = p_expedition_id and sales_order_item_id = p_sales_order_item_id and finished_product_lot_id = p_finished_product_lot_id for update;
  if not found then insert into public.sale_expedition_lines (expedition_id, sales_order_item_id, finished_product_lot_id, created_by) values (p_expedition_id, p_sales_order_item_id, p_finished_product_lot_id, p_user_id) returning id into v_line_id; end if;
  insert into public.sale_expedition_weighings (expedition_line_id, quantity, pieces_quantity, notes, created_by) values (v_line_id, p_quantity, p_pieces_quantity, nullif(trim(coalesce(p_notes, '')), ''), p_user_id) returning id into v_weighing_id;
  return v_weighing_id;
end;
$$;

revoke execute on function public.register_sale_expedition_weighing(uuid, uuid, uuid, numeric, text, uuid, integer) from public, anon, authenticated;
grant execute on function public.register_sale_expedition_weighing(uuid, uuid, uuid, numeric, text, uuid, integer) to service_role;

create or replace function public.confirm_sale_expedition(p_expedition_id uuid, p_user_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_expedition public.sale_expeditions%rowtype; v_order public.sales_orders%rowtype; v_line record;
  v_lot public.finished_product_lots%rowtype; v_order_item public.sales_order_items%rowtype; v_attendance_id uuid;
  v_attendance_number text; v_attendance_count integer; v_total numeric(14,4) := 0; v_progress jsonb := '{}'::jsonb;
  v_planned numeric(14,4); v_pending numeric(14,4); v_key text; v_extra numeric(14,4); v_all_conferred boolean; v_any_conferred boolean; v_status text;
begin
  select * into v_expedition from public.sale_expeditions where id = p_expedition_id for update;
  if not found then raise exception 'Expedição não encontrada'; end if;
  if v_expedition.status = 'expedida' then return v_expedition.attendance_id; end if;
  if v_expedition.status <> 'em_pesagem' then raise exception 'Esta expedição não pode ser confirmada'; end if;
  select * into v_order from public.sales_orders where id = v_expedition.sales_order_id for update;
  if not found or v_order.status in ('Atendido', 'Conferido', 'Cancelado') then raise exception 'O pedido não está disponível para expedição'; end if;
  if not exists (select 1 from public.sale_expedition_lines l join public.sale_expedition_weighings w on w.expedition_line_id = l.id where l.expedition_id = p_expedition_id and w.quantity > 0) then raise exception 'Registre ao menos uma pesagem antes de confirmar a expedição'; end if;
  select count(*) into v_attendance_count from public.sale_attendances where sales_order_id = v_expedition.sales_order_id;
  v_attendance_number := 'EXP-' || (v_attendance_count + 1);
  insert into public.sale_attendances (sales_order_id, attendance_number, fulfilled_at, total_value, status, notes, created_by, updated_by) values (v_expedition.sales_order_id, v_attendance_number, now(), 0, 'Concluído', 'Expedição ' || v_expedition.expedition_number, p_user_id, p_user_id) returning id into v_attendance_id;
  for v_line in select l.sales_order_item_id, l.finished_product_lot_id, sum(w.quantity)::numeric(14,4) as weighed_quantity, coalesce(sum(w.pieces_quantity), 0)::integer as weighed_pieces from public.sale_expedition_lines l join public.sale_expedition_weighings w on w.expedition_line_id = l.id where l.expedition_id = p_expedition_id group by l.sales_order_item_id, l.finished_product_lot_id having sum(w.quantity) > 0 loop
    select * into v_lot from public.finished_product_lots where id = v_line.finished_product_lot_id for update;
    if not found then raise exception 'Lote de produto não encontrado'; end if;
    if v_line.weighed_quantity > v_lot.available_quantity or (v_lot.available_pieces is not null and v_line.weighed_pieces > v_lot.available_pieces) then raise exception 'O lote % não possui saldo suficiente para a expedição', v_lot.lot_code; end if;
    select * into v_order_item from public.sales_order_items where id = v_line.sales_order_item_id and sales_order_id = v_expedition.sales_order_id for update;
    if not found or v_order_item.product_id <> v_lot.product_id then raise exception 'O lote não pertence ao item expedido'; end if;
    v_key := v_line.sales_order_item_id::text; v_planned := coalesce((v_progress ->> v_key)::numeric, 0); v_pending := v_order_item.ordered_quantity - v_order_item.fulfilled_quantity - v_planned;
    if v_line.weighed_quantity > v_pending then raise exception 'A expedição excede a quantidade pendente do item'; end if;
    v_progress := jsonb_set(v_progress, array[v_key], to_jsonb(round(v_planned + v_line.weighed_quantity, 4))); v_total := v_total + round(v_line.weighed_quantity * v_order_item.unit_price, 4);
    insert into public.sales_order_fulfillments (sales_order_id, sales_order_item_id, finished_product_lot_id, attendance_id, quantity, fulfilled_at, created_by, updated_by) values (v_expedition.sales_order_id, v_line.sales_order_item_id, v_line.finished_product_lot_id, v_attendance_id, v_line.weighed_quantity, now(), p_user_id, p_user_id);
    update public.finished_product_lots set available_quantity = round(available_quantity - v_line.weighed_quantity, 4), available_pieces = case when available_pieces is null then null else available_pieces - v_line.weighed_pieces end, updated_at = now(), updated_by = p_user_id where id = v_line.finished_product_lot_id;
    insert into public.stock_movements (movement_type, lot_type, lot_id, quantity, reference_table, reference_id, created_by, updated_by) values ('saida', 'Produto Acabado', v_line.finished_product_lot_id, v_line.weighed_quantity, 'sale_expeditions', p_expedition_id, p_user_id, p_user_id);
  end loop;
  for v_key, v_extra in select key, value::text::numeric from jsonb_each(v_progress) loop select * into v_order_item from public.sales_order_items where id = v_key::uuid; insert into public.sale_attendance_items (attendance_id, sales_order_item_id, quantity, unit_price, total_value) values (v_attendance_id, v_key::uuid, v_extra, v_order_item.unit_price, round(v_extra * v_order_item.unit_price, 4)); update public.sales_order_items set fulfilled_quantity = round(fulfilled_quantity + v_extra, 4), status = case when fulfilled_quantity + v_extra >= ordered_quantity then 'Conferido' else 'Parcialmente Conferido' end, updated_at = now(), updated_by = p_user_id where id = v_key::uuid; end loop;
  select bool_and(fulfilled_quantity >= ordered_quantity), bool_or(fulfilled_quantity > 0) into v_all_conferred, v_any_conferred from public.sales_order_items where sales_order_id = v_expedition.sales_order_id;
  v_status := case when v_all_conferred then 'Conferido' when v_any_conferred then 'Parcialmente Conferido' else 'Aberto' end;
  update public.sale_attendances set total_value = v_total where id = v_attendance_id; update public.sales_orders set status = v_status, updated_at = now(), updated_by = p_user_id where id = v_expedition.sales_order_id; update public.sale_expeditions set status = 'expedida', attendance_id = v_attendance_id, dispatched_at = now(), updated_at = now(), updated_by = p_user_id where id = p_expedition_id;
  return v_attendance_id;
end;
$$;
