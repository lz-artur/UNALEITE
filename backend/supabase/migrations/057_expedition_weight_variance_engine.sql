-- Mantém as rotinas atuais de estoque e acrescenta a validação da tolerância
-- antes de registrar/confirmar uma expedição.
alter function public.register_sale_expedition_weighing(uuid, uuid, uuid, numeric, text, uuid, integer, text)
  rename to register_sale_expedition_weighing_strict;

create function public.register_sale_expedition_weighing(
  p_expedition_id uuid, p_sales_order_item_id uuid, p_finished_product_lot_id uuid,
  p_quantity numeric, p_notes text, p_user_id uuid, p_pieces_quantity integer default null, p_photo_url text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_order_id uuid; v_ordered numeric; v_fulfilled numeric; v_weighed numeric; v_tolerance numeric; v_id uuid;
begin
  select e.sales_order_id into v_order_id from sale_expeditions e where e.id=p_expedition_id;
  select i.ordered_quantity, i.fulfilled_quantity, coalesce(p.weight_variance_percent,0)
    into v_ordered, v_fulfilled, v_tolerance from sales_order_items i join finished_products p on p.id=i.product_id
    where i.id=p_sales_order_item_id and i.sales_order_id=v_order_id for update;
  select coalesce(sum(w.quantity),0) into v_weighed from sale_expedition_weighings w join sale_expedition_lines l on l.id=w.expedition_line_id
    where l.expedition_id=p_expedition_id and l.sales_order_item_id=p_sales_order_item_id;
  if v_weighed + p_quantity > (v_ordered-v_fulfilled) * (1+v_tolerance/100) + .0001 then
    raise exception 'A pesagem excede a tolerância de peso do produto (%).', v_tolerance;
  end if;
  update sales_order_items set ordered_quantity=greatest(v_ordered, v_fulfilled+v_weighed+p_quantity) where id=p_sales_order_item_id;
  v_id := register_sale_expedition_weighing_strict(p_expedition_id,p_sales_order_item_id,p_finished_product_lot_id,p_quantity,p_notes,p_user_id,p_pieces_quantity,p_photo_url);
  update sales_order_items set ordered_quantity=v_ordered where id=p_sales_order_item_id;
  return v_id;
end $$;

alter function public.confirm_sale_expedition(uuid, uuid) rename to confirm_sale_expedition_strict;
create function public.confirm_sale_expedition(p_expedition_id uuid, p_user_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare r record; v_attendance uuid; v_has_variance boolean := false;
begin
  for r in select i.id, i.ordered_quantity, i.fulfilled_quantity, sum(w.quantity) weighed, coalesce(p.weight_variance_percent,0) tolerance
    from sale_expedition_lines l join sale_expedition_weighings w on w.expedition_line_id=l.id join sales_order_items i on i.id=l.sales_order_item_id join finished_products p on p.id=i.product_id
    where l.expedition_id=p_expedition_id group by i.id,i.ordered_quantity,i.fulfilled_quantity,p.weight_variance_percent
  loop
    if abs(r.weighed-(r.ordered_quantity-r.fulfilled_quantity)) > .0001 then v_has_variance := true; end if;
    if r.weighed > (r.ordered_quantity-r.fulfilled_quantity)*(1+r.tolerance/100)+.0001 then raise exception 'A expedição excede a tolerância configurada'; end if;
    update sales_order_items set ordered_quantity=greatest(r.ordered_quantity,r.fulfilled_quantity+r.weighed) where id=r.id;
  end loop;
  v_attendance := confirm_sale_expedition_strict(p_expedition_id,p_user_id);
  if v_has_variance then
    update sale_expeditions set status='aguardando_aceite_comercial',has_weight_variance=true where id=p_expedition_id;
    update sales_orders set status='Aguardando Aceite Comercial' where id=(select sales_order_id from sale_expeditions where id=p_expedition_id);
  end if;
  return v_attendance;
end $$;
