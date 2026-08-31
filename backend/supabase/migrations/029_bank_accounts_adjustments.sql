-- Adicionar campo para agrupar transações (útil para transferências entre contas)
ALTER TABLE public.financial_entries
ADD COLUMN IF NOT EXISTS transaction_group_id uuid;

-- Inserir as categorias contábeis específicas, que não afetam o DRE
INSERT INTO public.accounting_categories (name, entry_type, show_in_dre) VALUES
('Saldo Inicial', 'Entrada', false),
('Transferência entre Contas', 'Transferência', false)
ON CONFLICT DO NOTHING;
