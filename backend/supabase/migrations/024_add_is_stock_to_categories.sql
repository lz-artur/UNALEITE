-- Adiciona a coluna is_stock na tabela accounting_categories
ALTER TABLE public.accounting_categories
ADD COLUMN IF NOT EXISTS is_stock boolean not null default false;

-- Atualiza as categorias conhecidas de estoque para is_stock = true
UPDATE public.accounting_categories
SET is_stock = true
WHERE name IN (
  '2. MATÉRIA-PRIMA, INSUMOS DIRETO E REAGENTES',
  '3. ESTOQUES EXPEDIENTE'
);
