-- Mantém o cliente identificável nos títulos a receber originados de vendas.
-- O client_id já é a fonte de verdade; o nome na descrição é um snapshot para
-- leitura rápida em Contas a Receber e nos relatórios/exportações.

CREATE OR REPLACE FUNCTION public.add_client_name_to_sales_financial_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_client_name TEXT;
  v_description_prefix TEXT;
BEGIN
  IF NEW.entry_type <> 'Receber'
    OR NEW.category <> 'Vendas'
    OR NEW.reference_table <> 'sales_orders'
    OR NEW.client_id IS NULL
    OR NEW.description IS NULL
    OR NEW.description NOT LIKE 'Venda % (%'
  THEN
    RETURN NEW;
  END IF;

  -- Descrições já corrigidas têm o delimitador entre a venda e os detalhes
  -- da fatura/parcela. Isso torna a operação idempotente.
  v_description_prefix := split_part(NEW.description, ' (', 1);
  IF position(' - ' IN v_description_prefix) > 0 THEN
    RETURN NEW;
  END IF;

  SELECT name
  INTO v_client_name
  FROM public.clients
  WHERE id = NEW.client_id;

  IF v_client_name IS NOT NULL AND btrim(v_client_name) <> '' THEN
    NEW.description := v_description_prefix
      || ' - ' || v_client_name
      || substring(NEW.description FROM char_length(v_description_prefix) + 1);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS add_client_name_to_sales_financial_entry ON public.financial_entries;

CREATE TRIGGER add_client_name_to_sales_financial_entry
BEFORE INSERT OR UPDATE OF description, client_id
ON public.financial_entries
FOR EACH ROW
EXECUTE FUNCTION public.add_client_name_to_sales_financial_entry();

-- Recupera os títulos gerados pela rotina de atendimento parcial antes desta
-- correção. Valores, vencimentos, status e vínculos não são alterados.
UPDATE public.financial_entries AS entry
SET description = split_part(entry.description, ' (', 1)
  || ' - ' || client.name
  || substring(entry.description FROM char_length(split_part(entry.description, ' (', 1)) + 1)
FROM public.clients AS client
WHERE entry.client_id = client.id
  AND entry.entry_type = 'Receber'
  AND entry.category = 'Vendas'
  AND entry.reference_table = 'sales_orders'
  AND entry.description LIKE 'Venda % (%'
  AND position(' - ' IN split_part(entry.description, ' (', 1)) = 0;
