-- As fotos da balança fazem parte do detalhe do pedido e podem ser exibidas
-- diretamente pelo navegador, sem gerar URLs assinadas a cada visualização.
-- O upsert também corrige ambientes onde a migration original do bucket ainda
-- não foi executada.
insert into storage.buckets (id, name, public)
values ('expedition-weighing-photos', 'expedition-weighing-photos', true)
on conflict (id) do update set public = true;
