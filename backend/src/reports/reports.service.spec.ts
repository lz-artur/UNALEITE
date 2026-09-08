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
