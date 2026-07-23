-- Adicionando array de URLs de comprovantes na tabela financial_entries
ALTER TABLE public.financial_entries
ADD COLUMN IF NOT EXISTS attachment_urls text[] DEFAULT '{}';

-- Migrar o dado existente da coluna antiga para a nova (se houver)
UPDATE public.financial_entries
SET attachment_urls = ARRAY[attachment_url]
WHERE attachment_url IS NOT NULL AND (attachment_urls IS NULL OR array_length(attachment_urls, 1) IS NULL);
