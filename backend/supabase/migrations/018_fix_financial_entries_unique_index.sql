-- Corrige o índice único que impedia múltiplas parcelas (installments)
-- por compra na tabela financial_entries.
-- O índice antigo era: (reference_table, reference_id, category)
-- O novo índice inclui installment_number para permitir N parcelas por compra.

DROP INDEX IF EXISTS financial_entries_reference_unique;

CREATE UNIQUE INDEX financial_entries_reference_unique
  ON financial_entries(reference_table, reference_id, category, COALESCE(installment_number, 0))
  WHERE reference_table IS NOT NULL AND reference_id IS NOT NULL;
