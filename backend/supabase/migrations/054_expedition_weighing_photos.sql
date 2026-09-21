-- Evidência obrigatória para as novas pesagens de expedição.
alter table public.sale_expedition_weighings
  add column if not exists photo_url text;

insert into storage.buckets (id, name, public)
values ('expedition-weighing-photos', 'expedition-weighing-photos', false)
on conflict (id) do update set public = false;

drop policy if exists "Authenticated users upload expedition weighing photos" on storage.objects;
create policy "Authenticated users upload expedition weighing photos"
on storage.objects for insert to authenticated
with check (bucket_id = 'expedition-weighing-photos');
