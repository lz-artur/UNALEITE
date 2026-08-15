CREATE OR REPLACE FUNCTION get_dashboard_summary()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  summary json;
BEGIN
  SELECT json_build_object(
    'milkReceivedMonth', (
      SELECT COALESCE(SUM(volume_liters), 0)
      FROM milk_lots
      WHERE date_trunc('month', received_at) = date_trunc('month', now())
    ),
    'approvedLots', (
      SELECT count(*)
      FROM milk_lots
      WHERE status = 'Aprovado'
    ),
    'blockedLots', (
      SELECT count(*)
      FROM milk_lots
      WHERE status = 'Bloqueado'
    ),
    'pendingAnalysisCount', (
      SELECT count(*)
      FROM milk_lots
      WHERE status IN ('Aguardando Análise', 'Aguardando Analise')
    ),
    'openOrders', (
      SELECT count(*)
      FROM production_orders
      WHERE status = 'Em Andamento'
    ),
    'finishedOrders', (
      SELECT count(*)
      FROM production_orders
      WHERE status = 'Finalizada'
    ),
    'averageCostPerLiter', (
      SELECT COALESCE(SUM(cost_per_liter) / NULLIF(COUNT(cost_per_liter), 0), 0)
      FROM milk_lots
      WHERE cost_per_liter IS NOT NULL
    ),
    'averageCostPerKg', (
      SELECT COALESCE(SUM(ml.cost_per_liter * po.liters_planned) / NULLIF(SUM(po.actual_quantity_produced), 0), 0)
      FROM production_orders po
      JOIN milk_lots ml ON ml.id = po.milk_lot_id
      WHERE po.status = 'Finalizada' AND po.actual_quantity_produced IS NOT NULL
    ),
    'accountsPayable', (
      SELECT COALESCE(SUM(amount), 0)
      FROM financial_entries
      WHERE entry_type = 'Pagar' AND status != 'Pago'
    ),
    'accountsReceivable', (
      SELECT COALESCE(SUM(amount), 0)
      FROM financial_entries
      WHERE entry_type = 'Receber' AND status != 'Pago'
    ),
    'milkPayroll', (
      SELECT COALESCE(SUM(amount), 0)
      FROM financial_entries
      WHERE upper(category) LIKE '%MATÉRIA-PRIMA%' OR upper(category) LIKE '%MATÉRIA PRIMA%'
    ),
    'overdueEntries', (
      SELECT count(*)
      FROM financial_entries
      WHERE status NOT IN ('Pago', 'Cancelado') AND due_date < now()
    ),
    'overdueAmount', (
      SELECT COALESCE(SUM(amount), 0)
      FROM financial_entries
      WHERE status NOT IN ('Pago', 'Cancelado') AND due_date < now()
    ),
    'lowStockItemsCount', (
      SELECT count(*)
      FROM supply_items
      WHERE current_stock < minimum_stock
    ),
    'analysesCount', (
      SELECT count(*)
      FROM milk_lot_analyses
    )
  ) INTO summary;

  RETURN summary;
END;
$$;
