alter function public.cancel_sale_attendance(uuid, uuid)
  rename to cancel_sale_attendance_restore_quantity_v1;

create function public.cancel_sale_attendance(p_attendance_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare r record;
begin
  -- Guarda as peças antes de a rotina legada atualizar o atendimento.
  for r in select finished_product_lot_id, pieces_quantity from public.sales_order_fulfillments
    where attendance_id=p_attendance_id and pieces_quantity is not null
  loop
    update public.finished_product_lots
    set available_pieces=coalesce(available_pieces,0)+r.pieces_quantity, updated_at=now(), updated_by=p_user_id
    where id=r.finished_product_lot_id;
  end loop;
  perform cancel_sale_attendance_restore_quantity_v1(p_attendance_id,p_user_id);
end $$;
