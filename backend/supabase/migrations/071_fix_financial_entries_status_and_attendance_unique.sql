-- 1. Drop the unique constraint that prevents multiple partial attendances for the same sale
DROP INDEX IF EXISTS public.financial_entries_reference_unique;

-- 2. Fix the finalize_conferred_sales_order function to use the correct reference table and ID
CREATE OR REPLACE FUNCTION public.finalize_conferred_sales_order(
  p_sales_order_id uuid,
  p_payment_method text,
  p_bank_account_id uuid,
  p_user_id uuid,
  p_installment_entries jsonb default null
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order record;
  v_total numeric;
  v_finalization_id uuid;
  v_entry_id uuid;
  v_group_id uuid;
  v_count int;
  v_index int := 0;
  v_entries jsonb;
  v_entry jsonb;
  v_entry_total numeric := 0;
  v_amount numeric;
  v_due_date timestamptz;
  v_desc_suffix text := '';
BEGIN
  -- ── 1. Check if already finalized ──────────────────────────────────────
  IF EXISTS (SELECT 1 FROM public.sales_order_financial_finalizations WHERE sales_order_id = p_sales_order_id) THEN
    RETURN p_sales_order_id;
  END IF;

  SELECT * INTO v_order FROM public.sales_orders WHERE id = p_sales_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;

  IF NULLIF(TRIM(p_payment_method), '') IS NULL THEN RAISE EXCEPTION 'Informe a forma de pagamento'; END IF;
  IF p_bank_account_id IS NULL THEN RAISE EXCEPTION 'Informe a conta de recebimento'; END IF;

  -- ── 2. Calculate Total ────────────────────────────────────────────────
  SELECT COALESCE(SUM(total_value), 0) INTO v_total 
  FROM public.sale_attendances 
  WHERE sales_order_id = p_sales_order_id 
    AND attendance_number LIKE 'EXP-%' 
    AND status = 'Concluído';
    
  IF v_total <= 0 THEN RAISE EXCEPTION 'Não há valores conferidos para finalizar'; END IF;

  INSERT INTO public.sales_order_financial_finalizations (sales_order_id, payment_method, bank_account_id, created_by, updated_by)
  VALUES (p_sales_order_id, TRIM(p_payment_method), p_bank_account_id, p_user_id, p_user_id) 
  RETURNING id INTO v_finalization_id;

  v_group_id := v_finalization_id;

  v_entries := COALESCE(p_installment_entries, jsonb_build_array(jsonb_build_object('amount', v_total, 'dueDate', v_order.due_date)));
  v_count := jsonb_array_length(v_entries);
  IF v_count = 0 THEN RAISE EXCEPTION 'Informe ao menos uma parcela'; END IF;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(v_entries) LOOP 
    v_entry_total := v_entry_total + (v_entry->>'amount')::NUMERIC; 
  END LOOP;
  
  IF ABS(v_entry_total - v_total) > 0.01 THEN RAISE EXCEPTION 'O total das parcelas deve ser igual ao valor conferido'; END IF;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(v_entries) LOOP
    v_index := v_index + 1; 
    v_amount := (v_entry->>'amount')::NUMERIC; 
    v_due_date := (v_entry->>'dueDate')::TIMESTAMPTZ;
    
    IF v_amount <= 0 OR v_due_date IS NULL THEN RAISE EXCEPTION 'Cada parcela deve ter valor e vencimento válidos'; END IF;
    
    INSERT INTO public.financial_entries (
      entry_type, description, amount, due_date, status, category, client_id, 
      reference_table, reference_id, payment_method, installments, 
      installment_group_id, installment_number, bank_account_id, created_by, updated_by
    )
    VALUES (
      'Receber', 
      'Venda ' || v_order.order_number || CASE WHEN v_count > 1 THEN ' - Parcela ' || v_index || '/' || v_count ELSE '' END,
      v_amount, 
      v_due_date, 
      'Aberto', 
      'Vendas', 
      v_order.client_id, 
      'sales_orders', 
      p_sales_order_id,
      TRIM(p_payment_method), 
      v_count, 
      v_finalization_id, 
      v_index, 
      p_bank_account_id, 
      p_user_id, 
      p_user_id
    );
  END LOOP;

  UPDATE public.sales_orders SET status = 'Atendido', updated_at = NOW(), updated_by = p_user_id WHERE id = p_sales_order_id;
  UPDATE public.sales_order_items SET status = 'Atendido', updated_at = NOW(), updated_by = p_user_id WHERE sales_order_id = p_sales_order_id;
  
  RETURN v_finalization_id;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'Este pedido já foi finalizado financeiramente';
END;
$$;

-- 3. Update existing orphaned financial entries to point back to the sales order
UPDATE public.financial_entries fe
SET 
  reference_table = 'sales_orders',
  reference_id = f.sales_order_id
FROM public.sales_order_financial_finalizations f
WHERE fe.reference_table = 'sales_order_financial_finalizations'
  AND fe.reference_id = f.id;
