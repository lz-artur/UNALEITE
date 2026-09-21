alter function public.confirm_sale_expedition(uuid, uuid)
  rename to confirm_sale_expedition_with_variance_v1;

create function public.confirm_sale_expedition(p_expedition_id uuid, p_user_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_attendance_id uuid;
begin
  v_attendance_id := confirm_sale_expedition_with_variance_v1(p_expedition_id, p_user_id);

  update public.sales_order_fulfillments f
  set pieces_quantity = source.pieces_quantity
  from (
    select l.sales_order_item_id, l.finished_product_lot_id, sum(w.pieces_quantity)::integer as pieces_quantity
    from public.sale_expedition_lines l
    join public.sale_expedition_weighings w on w.expedition_line_id = l.id
    where l.expedition_id = p_expedition_id
    group by l.sales_order_item_id, l.finished_product_lot_id
  ) source
  where f.attendance_id = v_attendance_id
    and f.sales_order_item_id = source.sales_order_item_id
    and f.finished_product_lot_id = source.finished_product_lot_id;

  update public.stock_movements m
  set pieces_quantity = source.pieces_quantity
  from (
    select l.finished_product_lot_id, sum(w.pieces_quantity)::integer as pieces_quantity
    from public.sale_expedition_lines l
    join public.sale_expedition_weighings w on w.expedition_line_id = l.id
    where l.expedition_id = p_expedition_id
    group by l.finished_product_lot_id
  ) source
  where m.reference_table = 'sale_expeditions'
    and m.reference_id = p_expedition_id
    and m.lot_id = source.finished_product_lot_id;

  return v_attendance_id;
end $$;
