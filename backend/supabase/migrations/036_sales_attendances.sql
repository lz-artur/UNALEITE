-- ============================================================================
-- Migration 036: Sale Attendances (Atendimento Parcial de Vendas)
-- ============================================================================
-- Cria a estrutura de atendimentos para vendas, permitindo múltiplos
-- atendimentos parciais por venda, com rastreabilidade completa.
-- ============================================================================

-- ─── 1. Tabela de Atendimentos ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sale_attendances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id UUID NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  attendance_number TEXT NOT NULL,
  idempotency_key UUID UNIQUE,
  fulfilled_at TIMESTAMPTZ NOT NULL,
  total_value NUMERIC(14,4) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Concluído',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID NULL,
  CHECK (total_value >= 0),
  CHECK (status IN ('Concluído', 'Cancelado'))
);

CREATE INDEX IF NOT EXISTS sale_attendances_sales_order_id_idx
  ON public.sale_attendances(sales_order_id);

CREATE INDEX IF NOT EXISTS sale_attendances_idempotency_key_idx
  ON public.sale_attendances(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ─── 2. Tabela de Itens do Atendimento ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sale_attendance_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_id UUID NOT NULL REFERENCES public.sale_attendances(id) ON DELETE CASCADE,
  sales_order_item_id UUID NOT NULL REFERENCES public.sales_order_items(id) ON DELETE CASCADE,
  quantity NUMERIC(14,4) NOT NULL,
  unit_price NUMERIC(12,4) NOT NULL,
  total_value NUMERIC(14,4) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (quantity > 0),
  CHECK (total_value >= 0)
);

CREATE INDEX IF NOT EXISTS sale_attendance_items_attendance_id_idx
  ON public.sale_attendance_items(attendance_id);

CREATE INDEX IF NOT EXISTS sale_attendance_items_soi_id_idx
  ON public.sale_attendance_items(sales_order_item_id);

-- ─── 3. Adicionar attendance_id nas tabelas existentes ──────────────────────

ALTER TABLE public.sales_order_fulfillments
  ADD COLUMN IF NOT EXISTS attendance_id UUID REFERENCES public.sale_attendances(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sales_order_fulfillments_attendance_id_idx
  ON public.sales_order_fulfillments(attendance_id)
  WHERE attendance_id IS NOT NULL;

ALTER TABLE public.financial_entries
  ADD COLUMN IF NOT EXISTS attendance_id UUID REFERENCES public.sale_attendances(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS financial_entries_attendance_id_idx
  ON public.financial_entries(attendance_id)
  WHERE attendance_id IS NOT NULL;

-- ─── 4. Migração de dados existentes ────────────────────────────────────────
-- Agrupa fulfillments existentes por (sales_order_id, fulfilled_at) em
-- registros na nova tabela sale_attendances, para manter consistência histórica.

DO $$
DECLARE
  v_group RECORD;
  v_attendance_id UUID;
  v_attendance_num INT := 0;
  v_total_value NUMERIC(14,4);
  v_current_order_id UUID := NULL;
  v_item RECORD;
BEGIN
  FOR v_group IN
    SELECT
      sof.sales_order_id,
      sof.fulfilled_at,
      sof.created_by
    FROM public.sales_order_fulfillments sof
    WHERE sof.attendance_id IS NULL
    GROUP BY sof.sales_order_id, sof.fulfilled_at, sof.created_by
    ORDER BY sof.sales_order_id, sof.fulfilled_at
  LOOP
    -- Reset counter for each new order
    IF v_current_order_id IS DISTINCT FROM v_group.sales_order_id THEN
      v_current_order_id := v_group.sales_order_id;
      v_attendance_num := 0;
    END IF;
    v_attendance_num := v_attendance_num + 1;

    -- Calculate total value for this attendance
    SELECT COALESCE(SUM(sof.quantity * soi.unit_price), 0) INTO v_total_value
    FROM public.sales_order_fulfillments sof
    JOIN public.sales_order_items soi ON soi.id = sof.sales_order_item_id
    WHERE sof.sales_order_id = v_group.sales_order_id
      AND sof.fulfilled_at = v_group.fulfilled_at
      AND sof.attendance_id IS NULL;

    -- Create the attendance record
    INSERT INTO public.sale_attendances (
      sales_order_id,
      attendance_number,
      fulfilled_at,
      total_value,
      status,
      created_by,
      created_at
    ) VALUES (
      v_group.sales_order_id,
      'ATD-MIGRADO-' || v_attendance_num,
      v_group.fulfilled_at,
      v_total_value,
      'Concluído',
      v_group.created_by,
      v_group.fulfilled_at
    ) RETURNING id INTO v_attendance_id;

    -- Create attendance items (aggregate by sales_order_item_id)
    FOR v_item IN
      SELECT
        sof.sales_order_item_id,
        SUM(sof.quantity) AS total_qty,
        soi.unit_price
      FROM public.sales_order_fulfillments sof
      JOIN public.sales_order_items soi ON soi.id = sof.sales_order_item_id
      WHERE sof.sales_order_id = v_group.sales_order_id
        AND sof.fulfilled_at = v_group.fulfilled_at
        AND sof.attendance_id IS NULL
      GROUP BY sof.sales_order_item_id, soi.unit_price
    LOOP
      INSERT INTO public.sale_attendance_items (
        attendance_id,
        sales_order_item_id,
        quantity,
        unit_price,
        total_value
      ) VALUES (
        v_attendance_id,
        v_item.sales_order_item_id,
        v_item.total_qty,
        v_item.unit_price,
        ROUND(v_item.total_qty * v_item.unit_price, 4)
      );
    END LOOP;

    -- Link existing fulfillments to the attendance
    UPDATE public.sales_order_fulfillments
    SET attendance_id = v_attendance_id
    WHERE sales_order_id = v_group.sales_order_id
      AND fulfilled_at = v_group.fulfilled_at
      AND attendance_id IS NULL;

    -- Link existing financial entries to this attendance
    UPDATE public.financial_entries
    SET attendance_id = v_attendance_id
    WHERE reference_table = 'sales_orders'
      AND reference_id = v_group.sales_order_id
      AND attendance_id IS NULL
      AND entry_type = 'Receber'
      AND category = 'Vendas';

  END LOOP;
END $$;

-- ─── 5. RPC: Criar Atendimento (Transacional) ──────────────────────────────

CREATE OR REPLACE FUNCTION public.create_sale_attendance(
  p_sales_order_id UUID,
  p_user_id UUID,
  p_fulfilled_at TIMESTAMPTZ,
  p_idempotency_key UUID,
  p_items JSONB,
  p_payment_method TEXT DEFAULT NULL,
  p_bank_account_id UUID DEFAULT NULL,
  p_installment_entries JSONB DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sales_order RECORD;
  v_item JSONB;
  v_soi RECORD;
  v_lot RECORD;
  v_sales_order_item_id UUID;
  v_finished_product_lot_id UUID;
  v_quantity NUMERIC;

  v_attendance_id UUID;
  v_attendance_number TEXT;
  v_attendance_total NUMERIC(14,4) := 0;

  -- Track cumulative quantities per item within this attendance
  v_item_progress JSONB := '{}'::JSONB;
  v_already_planned NUMERIC;
  v_pending_quantity NUMERIC;

  -- For updating items after
  v_soi_id TEXT;
  v_extra_qty NUMERIC;
  v_next_qty NUMERIC;
  v_next_status TEXT;
  v_all_fulfilled BOOLEAN;
  v_any_fulfilled BOOLEAN;

  -- For financial entries
  v_installment JSONB;
  v_installments JSONB;
  v_installment_count INT;
  v_installment_total NUMERIC(14,4) := 0;
  v_installment_group_id UUID;
  v_installment_idx INT;
  v_entry_id UUID;
  v_due_date TIMESTAMPTZ;
  v_inst_amount NUMERIC;

  -- For attendance count
  v_attendance_count INT;

  -- Distinct items for attendance_items
  v_distinct_item RECORD;
BEGIN
  -- ── 1. Idempotency check ──────────────────────────────────────────────────
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_attendance_id
    FROM public.sale_attendances
    WHERE idempotency_key = p_idempotency_key;

    IF FOUND THEN
      RETURN v_attendance_id;
    END IF;
  END IF;

  -- ── 2. Lock and validate sales order ──────────────────────────────────────
  SELECT * INTO v_sales_order
  FROM public.sales_orders
  WHERE id = p_sales_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido de venda não encontrado: %', p_sales_order_id;
  END IF;

  IF v_sales_order.status IN ('Atendido', 'Cancelado') THEN
    RAISE EXCEPTION 'O pedido de venda não pode ser atendido (status: %)', v_sales_order.status;
  END IF;

  -- ── 3. Generate attendance number ─────────────────────────────────────────
  SELECT COUNT(*) INTO v_attendance_count
  FROM public.sale_attendances
  WHERE sales_order_id = p_sales_order_id;

  v_attendance_number := 'ATD-' || (v_attendance_count + 1);

  -- ── 4. Create attendance record ───────────────────────────────────────────
  INSERT INTO public.sale_attendances (
    sales_order_id,
    attendance_number,
    idempotency_key,
    fulfilled_at,
    total_value,
    status,
    notes,
    created_by,
    updated_by
  ) VALUES (
    p_sales_order_id,
    v_attendance_number,
    p_idempotency_key,
    p_fulfilled_at,
    0, -- will be updated
    'Concluído',
    p_notes,
    p_user_id,
    p_user_id
  ) RETURNING id INTO v_attendance_id;

  -- ── 5. Process each item ──────────────────────────────────────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_sales_order_item_id := (v_item->>'salesOrderItemId')::UUID;
    v_finished_product_lot_id := (v_item->>'finishedProductLotId')::UUID;
    v_quantity := (v_item->>'quantity')::NUMERIC;

    -- 5a. Lock and validate the lot
    SELECT * INTO v_lot
    FROM public.finished_product_lots
    WHERE id = v_finished_product_lot_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Lote não encontrado: %', v_finished_product_lot_id;
    END IF;

    IF v_quantity > v_lot.available_quantity THEN
      RAISE EXCEPTION 'O lote % não tem quantidade disponível suficiente (disponível: %, solicitado: %)',
        v_lot.lot_code, v_lot.available_quantity, v_quantity;
    END IF;

    -- 5b. Lock and validate the order item
    SELECT * INTO v_soi
    FROM public.sales_order_items
    WHERE id = v_sales_order_item_id
      AND sales_order_id = p_sales_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item do pedido não encontrado: %', v_sales_order_item_id;
    END IF;

    -- 5c. Calculate pending quantity considering other items in this batch
    v_already_planned := COALESCE((v_item_progress->>v_sales_order_item_id::TEXT)::NUMERIC, 0);
    v_pending_quantity := ROUND(v_soi.ordered_quantity - v_soi.fulfilled_quantity - v_already_planned, 4);

    IF v_quantity > v_pending_quantity THEN
      RAISE EXCEPTION 'A quantidade atendida do item % excede a quantidade pendente (pendente: %, solicitado: %)',
        v_sales_order_item_id, v_pending_quantity, v_quantity;
    END IF;

    -- 5d. Track progress
    v_item_progress := jsonb_set(
      v_item_progress,
      ARRAY[v_sales_order_item_id::TEXT],
      to_jsonb(ROUND(v_already_planned + v_quantity, 4))
    );

    -- 5e. Accumulate total value
    v_attendance_total := v_attendance_total + ROUND(v_quantity * v_soi.unit_price, 4);

    -- 5f. Insert fulfillment record (lot link)
    INSERT INTO public.sales_order_fulfillments (
      sales_order_id,
      sales_order_item_id,
      finished_product_lot_id,
      attendance_id,
      quantity,
      fulfilled_at,
      created_by,
      updated_by
    ) VALUES (
      p_sales_order_id,
      v_sales_order_item_id,
      v_finished_product_lot_id,
      v_attendance_id,
      v_quantity,
      p_fulfilled_at,
      p_user_id,
      p_user_id
    );

    -- 5g. Deduct from lot
    UPDATE public.finished_product_lots
    SET available_quantity = ROUND(available_quantity - v_quantity, 4),
        updated_by = p_user_id
    WHERE id = v_finished_product_lot_id;

    -- 5h. Insert stock movement
    INSERT INTO public.stock_movements (
      movement_type,
      lot_type,
      lot_id,
      quantity,
      reference_table,
      reference_id,
      created_by,
      updated_by
    ) VALUES (
      'saida',
      'Produto Acabado',
      v_finished_product_lot_id,
      v_quantity,
      'sales_orders',
      p_sales_order_id,
      p_user_id,
      p_user_id
    );
  END LOOP;

  -- ── 6. Validate at least one item was attended ────────────────────────────
  IF v_attendance_total <= 0 THEN
    RAISE EXCEPTION 'O atendimento deve conter ao menos um item com quantidade maior que zero.';
  END IF;

  -- ── 7. Validate total doesn't exceed order total ──────────────────────────
  DECLARE
    v_previous_attended NUMERIC(14,4);
  BEGIN
    SELECT COALESCE(SUM(total_value), 0) INTO v_previous_attended
    FROM public.sale_attendances
    WHERE sales_order_id = p_sales_order_id
      AND status = 'Concluído'
      AND id != v_attendance_id;

    IF (v_previous_attended + v_attendance_total) > v_sales_order.total_amount + 0.01 THEN
      RAISE EXCEPTION 'A soma dos atendimentos (R$ %) ultrapassa o valor total da venda (R$ %)',
        ROUND(v_previous_attended + v_attendance_total, 2), ROUND(v_sales_order.total_amount, 2);
    END IF;
  END;

  -- ── 8. Update attendance total ────────────────────────────────────────────
  UPDATE public.sale_attendances
  SET total_value = v_attendance_total
  WHERE id = v_attendance_id;

  -- ── 9. Create attendance items (aggregated by sales_order_item_id) ────────
  FOR v_distinct_item IN
    SELECT key AS soi_id, value::TEXT::NUMERIC AS qty
    FROM jsonb_each(v_item_progress)
  LOOP
    SELECT unit_price INTO v_soi
    FROM public.sales_order_items
    WHERE id = v_distinct_item.soi_id::UUID;

    INSERT INTO public.sale_attendance_items (
      attendance_id,
      sales_order_item_id,
      quantity,
      unit_price,
      total_value
    ) VALUES (
      v_attendance_id,
      v_distinct_item.soi_id::UUID,
      v_distinct_item.qty,
      v_soi.unit_price,
      ROUND(v_distinct_item.qty * v_soi.unit_price, 4)
    );
  END LOOP;

  -- ── 10. Update sales_order_items fulfilled quantities ─────────────────────
  FOR v_soi_id, v_extra_qty IN
    SELECT key, value::TEXT::NUMERIC FROM jsonb_each(v_item_progress)
  LOOP
    SELECT * INTO v_soi FROM public.sales_order_items WHERE id = v_soi_id::UUID;

    v_next_qty := ROUND(v_soi.fulfilled_quantity + v_extra_qty, 4);

    IF v_next_qty >= v_soi.ordered_quantity THEN
      v_next_status := 'Atendido';
    ELSE
      v_next_status := 'Parcialmente Atendido';
    END IF;

    UPDATE public.sales_order_items
    SET fulfilled_quantity = v_next_qty,
        status = v_next_status,
        updated_by = p_user_id
    WHERE id = v_soi_id::UUID;
  END LOOP;

  -- ── 11. Update sales order status ─────────────────────────────────────────
  SELECT
    bool_and(fulfilled_quantity >= ordered_quantity),
    bool_or(fulfilled_quantity > 0)
  INTO v_all_fulfilled, v_any_fulfilled
  FROM public.sales_order_items
  WHERE sales_order_id = p_sales_order_id;

  IF v_all_fulfilled THEN
    v_next_status := 'Atendido';
  ELSIF v_any_fulfilled THEN
    v_next_status := 'Parcialmente Atendido';
  ELSE
    v_next_status := 'Aberto';
  END IF;

  UPDATE public.sales_orders
  SET status = v_next_status,
      updated_by = p_user_id
  WHERE id = p_sales_order_id;

  -- ── 12. Create financial entries ──────────────────────────────────────────
  IF v_attendance_total > 0 THEN
    -- Resolve installments
    v_installments := COALESCE(p_installment_entries, jsonb_build_array(
      jsonb_build_object('amount', v_attendance_total, 'dueDate', v_sales_order.due_date)
    ));
    v_installment_count := jsonb_array_length(v_installments);

    -- Validate installments total
    v_installment_total := 0;
    FOR v_installment IN SELECT * FROM jsonb_array_elements(v_installments)
    LOOP
      v_installment_total := v_installment_total + (v_installment->>'amount')::NUMERIC;
    END LOOP;

    IF ABS(v_installment_total - v_attendance_total) > 0.01 THEN
      RAISE EXCEPTION 'O total das parcelas (R$ %) deve ser igual ao valor do atendimento (R$ %)',
        ROUND(v_installment_total, 2), ROUND(v_attendance_total, 2);
    END IF;

    v_installment_group_id := gen_random_uuid();
    v_installment_idx := 0;

    FOR v_installment IN SELECT * FROM jsonb_array_elements(v_installments)
    LOOP
      v_installment_idx := v_installment_idx + 1;
      v_due_date := (v_installment->>'dueDate')::TIMESTAMPTZ;
      v_inst_amount := (v_installment->>'amount')::NUMERIC;

      INSERT INTO public.financial_entries (
        entry_type,
        description,
        amount,
        due_date,
        status,
        category,
        client_id,
        reference_table,
        reference_id,
        attendance_id,
        payment_method,
        installments,
        installment_group_id,
        installment_number,
        bank_account_id,
        created_by,
        updated_by
      ) VALUES (
        'Receber',
        'Venda ' || v_sales_order.order_number || ' (' ||
          CASE WHEN v_installment_count > 1
            THEN 'Parcela ' || v_installment_idx || '/' || v_installment_count
            ELSE 'Fatura'
          END || ' - Atendimento ' || v_attendance_number || ')',
        v_inst_amount,
        v_due_date,
        'Aberto',
        'Vendas',
        v_sales_order.client_id,
        'sales_orders',
        p_sales_order_id,
        v_attendance_id,
        p_payment_method,
        v_installment_count,
        v_installment_group_id,
        v_installment_idx,
        p_bank_account_id,
        p_user_id,
        p_user_id
      ) RETURNING id INTO v_entry_id;

      -- Create rateio (financial_entry_items) proportional to attendance items
      DECLARE
        v_rateio_item RECORD;
        v_remaining_amount NUMERIC := v_inst_amount;
        v_rateio_count INT;
        v_rateio_idx INT := 0;
        v_rateio_amount NUMERIC;
        v_product RECORD;
      BEGIN
        SELECT COUNT(*) INTO v_rateio_count
        FROM public.sale_attendance_items WHERE attendance_id = v_attendance_id;

        FOR v_rateio_item IN
          SELECT sai.*, soi.product_id
          FROM public.sale_attendance_items sai
          JOIN public.sales_order_items soi ON soi.id = sai.sales_order_item_id
          WHERE sai.attendance_id = v_attendance_id
          ORDER BY sai.id
        LOOP
          v_rateio_idx := v_rateio_idx + 1;

          IF v_rateio_idx = v_rateio_count THEN
            v_rateio_amount := v_remaining_amount;
          ELSE
            v_rateio_amount := ROUND(v_inst_amount * (v_rateio_item.total_value / v_attendance_total), 4);
            v_remaining_amount := v_remaining_amount - v_rateio_amount;
          END IF;

          -- Get product financial info
          SELECT * INTO v_product
          FROM public.finished_products
          WHERE id = v_rateio_item.product_id;

          INSERT INTO public.financial_entry_items (
            financial_entry_id,
            amount,
            cost_center_id,
            accounting_category_id,
            accounting_subcategory_id,
            cost_type,
            created_by,
            updated_by
          ) VALUES (
            v_entry_id,
            v_rateio_amount,
            v_product.cost_center_id,
            v_product.accounting_category_id,
            v_product.accounting_subcategory_id,
            v_product.cost_type,
            p_user_id,
            p_user_id
          );
        END LOOP;
      END;
    END LOOP;
  END IF;

  RETURN v_attendance_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_sale_attendance(UUID, UUID, TIMESTAMPTZ, UUID, JSONB, TEXT, UUID, JSONB, TEXT)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_sale_attendance(UUID, UUID, TIMESTAMPTZ, UUID, JSONB, TEXT, UUID, JSONB, TEXT)
  TO service_role;

-- ─── 6. RPC: Cancelar Atendimento ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cancel_sale_attendance(
  p_attendance_id UUID,
  p_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attendance RECORD;
  v_sales_order_id UUID;
  v_fulfillment RECORD;
  v_attendance_item RECORD;
  v_financial RECORD;
  v_has_paid_entry BOOLEAN := FALSE;
  v_all_fulfilled BOOLEAN;
  v_any_fulfilled BOOLEAN;
  v_next_status TEXT;
BEGIN
  -- 1. Lock attendance
  SELECT * INTO v_attendance
  FROM public.sale_attendances
  WHERE id = p_attendance_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Atendimento não encontrado: %', p_attendance_id;
  END IF;

  IF v_attendance.status = 'Cancelado' THEN
    RAISE EXCEPTION 'Este atendimento já foi cancelado.';
  END IF;

  v_sales_order_id := v_attendance.sales_order_id;

  -- 2. Check if any financial entry has been paid
  SELECT EXISTS(
    SELECT 1
    FROM public.financial_entries fe
    WHERE fe.attendance_id = p_attendance_id
      AND fe.status IN ('Pago', 'Parcial')
  ) INTO v_has_paid_entry;

  -- Also check for receipts directly
  IF NOT v_has_paid_entry THEN
    SELECT EXISTS(
      SELECT 1
      FROM public.financial_entry_receipts fer
      JOIN public.financial_entries fe ON fe.id = fer.financial_entry_id
      WHERE fe.attendance_id = p_attendance_id
    ) INTO v_has_paid_entry;
  END IF;

  IF v_has_paid_entry THEN
    RAISE EXCEPTION 'Não é possível cancelar este atendimento pois existem recebimentos vinculados. Estorne os recebimentos antes de cancelar o atendimento.';
  END IF;

  -- 3. Lock sales order
  PERFORM 1 FROM public.sales_orders
  WHERE id = v_sales_order_id FOR UPDATE;

  -- 4. Restore lot quantities
  FOR v_fulfillment IN
    SELECT * FROM public.sales_order_fulfillments
    WHERE attendance_id = p_attendance_id
  LOOP
    UPDATE public.finished_product_lots
    SET available_quantity = ROUND(available_quantity + v_fulfillment.quantity, 4),
        updated_by = p_user_id
    WHERE id = v_fulfillment.finished_product_lot_id;

    -- Delete stock movements for this fulfillment
    DELETE FROM public.stock_movements
    WHERE reference_table = 'sales_orders'
      AND reference_id = v_sales_order_id
      AND lot_id = v_fulfillment.finished_product_lot_id
      AND quantity = v_fulfillment.quantity
      AND movement_type = 'saida';
  END LOOP;

  -- 5. Reverse fulfilled quantities on order items
  FOR v_attendance_item IN
    SELECT * FROM public.sale_attendance_items
    WHERE attendance_id = p_attendance_id
  LOOP
    UPDATE public.sales_order_items
    SET fulfilled_quantity = GREATEST(0, ROUND(fulfilled_quantity - v_attendance_item.quantity, 4)),
        updated_by = p_user_id
    WHERE id = v_attendance_item.sales_order_item_id;
  END LOOP;

  -- 6. Update item statuses
  UPDATE public.sales_order_items
  SET status = CASE
    WHEN fulfilled_quantity >= ordered_quantity THEN 'Atendido'
    WHEN fulfilled_quantity > 0 THEN 'Parcialmente Atendido'
    ELSE 'Aberto'
  END
  WHERE sales_order_id = v_sales_order_id;

  -- 7. Update sales order status
  SELECT
    bool_and(fulfilled_quantity >= ordered_quantity),
    bool_or(fulfilled_quantity > 0)
  INTO v_all_fulfilled, v_any_fulfilled
  FROM public.sales_order_items
  WHERE sales_order_id = v_sales_order_id;

  IF v_all_fulfilled THEN
    v_next_status := 'Atendido';
  ELSIF v_any_fulfilled THEN
    v_next_status := 'Parcialmente Atendido';
  ELSE
    v_next_status := 'Aberto';
  END IF;

  UPDATE public.sales_orders
  SET status = v_next_status,
      updated_by = p_user_id
  WHERE id = v_sales_order_id;

  -- 8. Cancel (delete) financial entries with no receipts
  DELETE FROM public.financial_entries
  WHERE attendance_id = p_attendance_id
    AND status = 'Aberto';

  -- 9. Mark attendance as cancelled
  UPDATE public.sale_attendances
  SET status = 'Cancelado',
      updated_by = p_user_id,
      updated_at = now()
  WHERE id = p_attendance_id;

  -- 10. Mark fulfillments (keep for history but unlink)
  UPDATE public.sales_order_fulfillments
  SET updated_by = p_user_id
  WHERE attendance_id = p_attendance_id;

END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_sale_attendance(UUID, UUID)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_sale_attendance(UUID, UUID)
  TO service_role;
