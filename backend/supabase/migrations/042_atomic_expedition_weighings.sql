-- Registra pesagens em uma única transação. Isso impede que duas pesagens
-- concorrentes consumam o mesmo saldo e evita linhas vazias quando a validação
-- do lote falha.
create or replace function public.register_sale_expedition_weighing(
  p_expedition_id uuid,
  p_sales_order_item_id uuid,
  p_finished_product_lot_id uuid,
  p_quantity numeric,
  p_notes text,
  p_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expedition public.sale_expeditions%rowtype;
  v_order_item public.sales_order_items%rowtype;
  v_lot public.finished_product_lots%rowtype;
  v_line_id uuid;
  v_item_weighed numeric(14,4);
  v_lot_weighed numeric(14,4);
  v_pending numeric(14,4);
  v_weighing_id uuid;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Informe uma pesagem maior que zero';
  end if;

  select * into v_expedition
  from public.sale_expeditions where id = p_expedition_id for update;
  if not found or v_expedition.status <> 'em_pesagem' then
    raise exception 'Esta expedição não está aberta para pesagem';
  end if;

  select * into v_order_item
  from public.sales_order_items
  where id = p_sales_order_item_id and sales_order_id = v_expedition.sales_order_id
  for update;
  if not found then raise exception 'Item do pedido não encontrado'; end if;

  select * into v_lot from public.finished_product_lots
  where id = p_finished_product_lot_id for update;
  if not found or v_lot.product_id <> v_order_item.product_id then
    raise exception 'Selecione um lote correspondente ao produto do pedido';
  end if;

  select coalesce(sum(w.quantity), 0) into v_item_weighed
  from public.sale_expedition_weighings w
  join public.sale_expedition_lines l on l.id = w.expedition_line_id
  where l.expedition_id = p_expedition_id and l.sales_order_item_id = p_sales_order_item_id;
  v_pending := v_order_item.ordered_quantity - v_order_item.fulfilled_quantity;
  if v_item_weighed + p_quantity > v_pending + 0.0001 then
    raise exception 'A pesagem excede o saldo pendente do pedido (%)', v_pending;
  end if;

  -- Soma o uso do lote em toda a expedição, inclusive se o mesmo produto
  -- aparecer em mais de um item do pedido.
  select coalesce(sum(w.quantity), 0) into v_lot_weighed
  from public.sale_expedition_weighings w
  join public.sale_expedition_lines l on l.id = w.expedition_line_id
  where l.expedition_id = p_expedition_id and l.finished_product_lot_id = p_finished_product_lot_id;
  if v_lot_weighed + p_quantity > v_lot.available_quantity + 0.0001 then
    raise exception 'O lote % não possui saldo suficiente para esta pesagem (disponível: %)', v_lot.lot_code, v_lot.available_quantity;
  end if;

  select id into v_line_id from public.sale_expedition_lines
  where expedition_id = p_expedition_id
    and sales_order_item_id = p_sales_order_item_id
    and finished_product_lot_id = p_finished_product_lot_id
  for update;
  if not found then
    insert into public.sale_expedition_lines (
      expedition_id, sales_order_item_id, finished_product_lot_id, created_by
    ) values (
      p_expedition_id, p_sales_order_item_id, p_finished_product_lot_id, p_user_id
    ) returning id into v_line_id;
  end if;

  insert into public.sale_expedition_weighings (
    expedition_line_id, quantity, notes, created_by
  ) values (
    v_line_id, p_quantity, nullif(trim(coalesce(p_notes, '')), ''), p_user_id
  ) returning id into v_weighing_id;

  return v_weighing_id;
end;
$$;

revoke execute on function public.register_sale_expedition_weighing(uuid, uuid, uuid, numeric, text, uuid) from public, anon, authenticated;
grant execute on function public.register_sale_expedition_weighing(uuid, uuid, uuid, numeric, text, uuid) to service_role;
