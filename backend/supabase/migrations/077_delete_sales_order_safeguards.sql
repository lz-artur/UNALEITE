-- 077: Adiciona salvaguardas para exclusão de atendimentos vinculados a expedições
alter table public.sale_expeditions
  drop constraint if exists sale_expeditions_attendance_id_fkey,
  add constraint sale_expeditions_attendance_id_fkey
    foreign key (attendance_id)
    references public.sale_attendances(id)
    on delete set null;
