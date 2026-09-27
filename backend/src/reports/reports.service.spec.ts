import { ReportsService } from './reports.service';
import { SupabaseService } from '../supabase/supabase.service';

describe('ReportsService production costs', () => {
  const reportFor = async (consumption: Record<string, unknown>) => {
    const service = new ReportsService({} as SupabaseService);
    const data: Record<string, any[]> = {
      production_orders: [{
        id: 'order-1', order_number: 'OP-1', milk_lot_id: 'milk-lot-1', product_id: 'product-1',
        liters_planned: 10, expected_yield: 8, status: 'Finalizada', started_at: '2026-08-10T12:00:00Z',
      }],
      finished_products: [{ id: 'product-1', name: 'Queijo' }],
      milk_lots: [{ id: 'milk-lot-1', code: 'LT-1', cost_per_liter: 3 }],
      production_order_milk_consumptions: [{
        production_order_id: 'order-1', milk_lot_id: 'milk-lot-1', liters_consumed: 10, ...consumption,
      }],
      milk_lot_pricing: [{ milk_lot_id: 'milk-lot-1', final_price: 7, created_at: '2026-08-01T12:00:00Z' }],
      production_order_supply_consumptions: [],
      supply_lots: [],
      supply_items: [],
      production_order_finished_product_consumptions: [],
      finished_product_lots: [{ id: 'product-lot-1', production_order_id: 'order-1', product_id: 'product-1', lot_code: 'PA-1', quantity_produced: 8 }],
    };
    jest.spyOn(service as any, 'selectMany').mockImplementation(async (...args: unknown[]) => data[String(args[0])] ?? []);
    return service.getProductionReport();
  };

  it('uses the cost captured when the milk was consumed', async () => {
    const report = await reportFor({ unit_cost: 2.5 });

    expect(report.rows[0].milkCost).toBe(25);
  });

  it('uses the reception cost for historical consumptions without a snapshot', async () => {
    const report = await reportFor({});

    expect(report.rows[0].milkCost).toBe(30);
  });
});

describe('ReportsService stock movements', () => {
  it('identifies the item, direction and source of each stock movement', async () => {
    const service = new ReportsService({} as SupabaseService);
    const data: Record<string, any[]> = {
      stock_movements: [
        { id: 'movement-1', movement_type: 'entrada', lot_type: 'Insumo', lot_id: 'supply-lot-1', quantity: 12, reference_table: 'purchases', created_at: '2026-09-10T12:00:00Z' },
        { id: 'movement-2', movement_type: 'saida', lot_type: 'Produto Acabado', lot_id: 'product-lot-1', quantity: 3, pieces_quantity: 6, reference_table: 'sale_expeditions', created_at: '2026-09-11T12:00:00Z' },
      ],
      supply_lots: [{ id: 'supply-lot-1', supply_item_id: 'supply-1', internal_lot_code: 'INS-001' }],
      supply_items: [{ id: 'supply-1', name: 'Fermento', code: 'FER-01', unit_id: 'unit-kg' }],
      finished_product_lots: [{ id: 'product-lot-1', product_id: 'product-1', lot_code: 'PA-001' }],
      finished_products: [{ id: 'product-1', name: 'Queijo coalho', code: 'QC-01', unit_id: 'unit-kg' }],
      milk_lots: [],
      units: [{ id: 'unit-kg', symbol: 'kg' }],
    };
    jest.spyOn(service as any, 'selectMany').mockImplementation(async (...args: unknown[]) => data[String(args[0])] ?? []);

    const report = await service.getStockMovementsReport({ startDate: '2026-09-01', endDate: '2026-09-30' });

    expect(report.totals).toEqual({ movementsCount: 2, entriesCount: 1, exitsCount: 1, entriesQuantity: 12, exitsQuantity: 3 });
    expect(report.rows[0]).toMatchObject({ movementType: 'saida', itemName: 'Queijo coalho', lotCode: 'PA-001', unitSymbol: 'kg', reference: 'Expedição de venda' });
    expect(report.rows[1]).toMatchObject({ movementType: 'entrada', itemName: 'Fermento', lotCode: 'INS-001', reference: 'Compra' });
  });
});
