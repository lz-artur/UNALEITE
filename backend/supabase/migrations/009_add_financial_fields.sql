-- Adicionando novos campos solicitados na tabela financial_entries
ALTER TABLE public.financial_entries
ADD COLUMN IF NOT EXISTS cost_center text,
ADD COLUMN IF NOT EXISTS accounting_subcategory text,
ADD COLUMN IF NOT EXISTS payment_method text,
ADD COLUMN IF NOT EXISTS payment_type text,
ADD COLUMN IF NOT EXISTS attachment_url text,
ADD COLUMN IF NOT EXISTS installment_group_id uuid,
ADD COLUMN IF NOT EXISTS installment_number integer;

-- Criar bucket de storage para os comprovantes, caso não exista
INSERT INTO storage.buckets (id, name, public)
VALUES ('comprovantes', 'comprovantes', true)
ON CONFLICT (id) DO NOTHING;

-- Criar políticas de acesso (Storage)
-- Permitir leitura pública (pois o bucket foi setado como público para facilitar download no MVP)
CREATE POLICY "Permitir leitura pública"
ON storage.objects FOR SELECT
USING ( bucket_id = 'comprovantes' );

-- Permitir upload para usuários autenticados
CREATE POLICY "Permitir upload autenticado"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'comprovantes' );

CREATE POLICY "Permitir delete autenticado"
ON storage.objects FOR DELETE
TO authenticated
USING ( bucket_id = 'comprovantes' );
