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

  it('classifies a consumed cream product lot under cream costs', async () => {
    const service = new ReportsService({} as SupabaseService);
    const data: Record<string, any[]> = {
      production_orders: [
        { id: 'cream-order', order_number: 'OP-CREME', milk_lot_id: 'milk-lot', product_id: 'cream-product', liters_planned: 10, expected_yield: 10, status: 'Finalizada', started_at: '2026-08-01T12:00:00Z' },
        { id: 'target-order', order_number: 'OP-DESTINO', milk_lot_id: 'milk-lot', product_id: 'target-product', liters_planned: 10, expected_yield: 10, status: 'Finalizada', started_at: '2026-08-02T12:00:00Z' },
      ],
      finished_products: [
        { id: 'cream-product', name: 'Creme de leite' },
        { id: 'target-product', name: 'Queijo' },
      ],
      milk_lots: [{ id: 'milk-lot', code: 'LT-1', cost_per_liter: 2 }],
      production_order_milk_consumptions: [
        { production_order_id: 'cream-order', milk_lot_id: 'milk-lot', liters_consumed: 10 },
        { production_order_id: 'target-order', milk_lot_id: 'milk-lot', liters_consumed: 10 },
      ],
      milk_lot_pricing: [],
      production_order_supply_consumptions: [],
      supply_lots: [],
      supply_items: [],
      production_order_finished_product_consumptions: [
        { production_order_id: 'target-order', finished_product_lot_id: 'cream-lot', quantity_consumed: 2 },
      ],
      finished_product_lots: [
        { id: 'cream-lot', production_order_id: 'cream-order', product_id: 'cream-product', lot_code: 'CP-1', quantity_produced: 5 },
        { id: 'target-lot', production_order_id: 'target-order', product_id: 'target-product', lot_code: 'PA-1', quantity_produced: 10 },
      ],
    };
    jest.spyOn(service as any, 'selectMany').mockImplementation(async (...args: unknown[]) => data[String(args[0])] ?? []);

    const report = await service.getProductionReport();
    const targetRow = report.rows.find((row) => row.orderId === 'target-order');

    expect(targetRow).toMatchObject({ creamQuantity: 2, creamCost: 0, reprocessedQuantity: 0, reprocessingCost: 0, totalCost: 20 });
    expect(targetRow?.inputs).toContainEqual(expect.objectContaining({ category: 'Creme', totalCost: 0 }));
  });
});

describe('ReportsService stock movements', () => {
  it('identifies the item, direction and source of each stock movement and resolves pieces', async () => {
    const service = new ReportsService({} as SupabaseService);
    const data: Record<string, any[]> = {
      stock_movements: [
        { id: 'movement-1', movement_type: 'entrada', lot_type: 'Insumo', lot_id: 'supply-lot-1', quantity: 12, reference_table: 'purchases', created_at: '2026-09-10T12:00:00Z' },
        { id: 'movement-2', movement_type: 'saida', lot_type: 'Produto Acabado', lot_id: 'product-lot-1', quantity: 3, pieces_quantity: 6, reference_table: 'sale_expeditions', reference_id: 'exp-1', created_at: '2026-09-11T12:00:00Z' },
        { id: 'movement-3', movement_type: 'saida', lot_type: 'Produto Acabado', lot_id: 'product-lot-1', quantity: 5, pieces_quantity: null, reference_table: 'sales_orders', reference_id: 'order-1', created_at: '2026-09-12T12:00:00Z' },
      ],
      supply_lots: [{ id: 'supply-lot-1', supply_item_id: 'supply-1', internal_lot_code: 'INS-001' }],
      supply_items: [{ id: 'supply-1', name: 'Fermento', code: 'FER-01', unit_id: 'unit-kg' }],
      finished_product_lots: [{ id: 'product-lot-1', product_id: 'product-1', lot_code: 'PA-001' }],
      finished_products: [{ id: 'product-1', name: 'Queijo coalho', code: 'QC-01', unit_id: 'unit-kg' }],
      milk_lots: [],
      units: [{ id: 'unit-kg', symbol: 'kg' }],
      sales_orders: [{ id: 'order-1', order_number: 'VEN-2026-100' }],
      sale_expeditions: [{ id: 'exp-1', expedition_number: 'EXP-001' }],
      production_orders: [],
      sales_order_fulfillments: [
        { sales_order_id: 'order-1', finished_product_lot_id: 'product-lot-1', pieces_quantity: 10 },
      ],
    };
    jest.spyOn(service as any, 'selectMany').mockImplementation(async (...args: unknown[]) => data[String(args[0])] ?? []);

    const report = await service.getStockMovementsReport({ startDate: '2026-09-01', endDate: '2026-09-30' });

    expect(report.totals).toMatchObject({
      movementsCount: 3,
      entriesCount: 1,
      exitsCount: 2,
      entriesQuantity: 12,
      exitsQuantity: 8,
      entriesPieces: 0,
      exitsPieces: 16, // 6 from movement-2 + 10 resolved from fulfillment for movement-3
    });
    // movement-3: pieces_quantity was null in stock_movements, resolved from fulfillment as 10
    expect(report.rows[0]).toMatchObject({
      movementType: 'saida',
      itemName: 'Queijo coalho',
      lotCode: 'PA-001',
      unitSymbol: 'kg',
      quantity: 5,
      piecesQuantity: 10,
      reference: 'Venda VEN-2026-100',
    });
    // movement-2:
    expect(report.rows[1]).toMatchObject({
      movementType: 'saida',
      itemName: 'Queijo coalho',
      lotCode: 'PA-001',
      unitSymbol: 'kg',
      quantity: 3,
      piecesQuantity: 6,
      reference: 'Expedição EXP-001',
    });
    // movement-1:
    expect(report.rows[2]).toMatchObject({
      movementType: 'entrada',
      itemName: 'Fermento',
      lotCode: 'INS-001',
      quantity: 12,
      reference: 'Compra',
    });
  });
});

describe('ReportsService stock vs sales report', () => {
  it('builds historical timeline comparing available stock against sales and calculates coverage', async () => {
    const service = new ReportsService({} as SupabaseService);
    const data: Record<string, any[]> = {
      finished_products: [
        { id: 'prod-1', name: 'Queijo Minas', code: 'QM-01', unit_id: 'unit-kg', active: true },
        { id: 'prod-2', name: 'Manteiga', code: 'MT-01', unit_id: 'unit-kg', active: true },
      ],
      units: [{ id: 'unit-kg', symbol: 'kg' }],
      finished_product_lots: [
        { id: 'lot-1', product_id: 'prod-1', lot_code: 'QM-101', quantity_produced: 100, available_quantity: 80, available_pieces: 40, produced_at: '2026-10-01T08:00:00Z' },
        { id: 'lot-2', product_id: 'prod-2', lot_code: 'MT-201', quantity_produced: 50, available_quantity: 10, available_pieces: 0, produced_at: '2026-10-01T08:00:00Z' },
      ],
      stock_movements: [
        { id: 'm-1', movement_type: 'entrada', lot_type: 'Produto Acabado', lot_id: 'lot-1', quantity: 100, created_at: '2026-10-01T08:00:00Z' },
        { id: 'm-2', movement_type: 'saida', lot_type: 'Produto Acabado', lot_id: 'lot-1', quantity: 20, created_at: '2026-10-05T14:00:00Z' },
        { id: 'm-3', movement_type: 'entrada', lot_type: 'Produto Acabado', lot_id: 'lot-2', quantity: 50, created_at: '2026-10-01T08:00:00Z' },
        { id: 'm-4', movement_type: 'saida', lot_type: 'Produto Acabado', lot_id: 'lot-2', quantity: 40, created_at: '2026-10-06T10:00:00Z' },
      ],
      sales_orders: [
        { id: 'order-1', order_number: 'VEN-001' },
        { id: 'order-2', order_number: 'VEN-002' },
      ],
      sales_order_items: [
        { id: 'item-1', sales_order_id: 'order-1', product_id: 'prod-1', quantity: 20, unit_price: 45 },
        { id: 'item-2', sales_order_id: 'order-2', product_id: 'prod-2', quantity: 40, unit_price: 30 },
      ],
      sales_order_fulfillments: [
        { id: 'ful-1', sales_order_id: 'order-1', sales_order_item_id: 'item-1', finished_product_lot_id: 'lot-1', quantity: 20, pieces_quantity: 10, fulfilled_at: '2026-10-05T14:00:00Z' },
        { id: 'ful-2', sales_order_id: 'order-2', sales_order_item_id: 'item-2', finished_product_lot_id: 'lot-2', quantity: 40, pieces_quantity: 0, fulfilled_at: '2026-10-06T10:00:00Z' },
      ],
      sales_returns: [],
    };
    jest.spyOn(service as any, 'selectMany').mockImplementation(async (...args: unknown[]) => data[String(args[0])] ?? []);

    const report = await service.getStockVsSalesReport({
      startDate: '2026-10-01',
      endDate: '2026-10-07',
    });

    expect(report.totals).toMatchObject({
      currentAvailableStock: 90, // 80 + 10
      totalSoldQuantity: 60, // 20 + 40
      totalSalesValue: 2100, // 20*45 (900) + 40*30 (1200)
    });

    // Check timeline has daily entries
    expect(report.timeline.length).toBe(7); // 2026-10-01 to 2026-10-07
    const oct01 = report.timeline.find((t) => t.date === '2026-10-01');
    const oct05 = report.timeline.find((t) => t.date === '2026-10-05');
    const oct06 = report.timeline.find((t) => t.date === '2026-10-06');
    const oct07 = report.timeline.find((t) => t.date === '2026-10-07');

    expect(oct01?.availableStock).toBe(150); // 100 + 50
    expect(oct05?.salesQuantity).toBe(20);
    expect(oct05?.availableStock).toBe(130); // 150 - 20
    expect(oct06?.salesQuantity).toBe(40);
    expect(oct06?.availableStock).toBe(90); // 130 - 40
    expect(oct07?.availableStock).toBe(90);

    // Check products breakdown
    expect(report.products.length).toBe(2);
    const prod1Row = report.products.find((p) => p.productId === 'prod-1');
    expect(prod1Row).toMatchObject({
      productName: 'Queijo Minas',
      currentStock: 80,
      totalSoldQuantity: 20,
      totalSalesValue: 900,
    });
  });

  it('filters stock vs sales by single productId', async () => {
    const service = new ReportsService({} as SupabaseService);
    const data: Record<string, any[]> = {
      finished_products: [
        { id: 'prod-1', name: 'Queijo Minas', code: 'QM-01', unit_id: 'unit-kg', active: true },
        { id: 'prod-2', name: 'Manteiga', code: 'MT-01', unit_id: 'unit-kg', active: true },
      ],
      units: [{ id: 'unit-kg', symbol: 'kg' }],
      finished_product_lots: [
        { id: 'lot-1', product_id: 'prod-1', lot_code: 'QM-101', quantity_produced: 100, available_quantity: 80, produced_at: '2026-10-01T08:00:00Z' },
        { id: 'lot-2', product_id: 'prod-2', lot_code: 'MT-201', quantity_produced: 50, available_quantity: 10, produced_at: '2026-10-01T08:00:00Z' },
      ],
      stock_movements: [
        { id: 'm-1', movement_type: 'entrada', lot_type: 'Produto Acabado', lot_id: 'lot-1', quantity: 100, created_at: '2026-10-01T08:00:00Z' },
        { id: 'm-2', movement_type: 'saida', lot_type: 'Produto Acabado', lot_id: 'lot-1', quantity: 20, created_at: '2026-10-05T14:00:00Z' },
        { id: 'm-3', movement_type: 'entrada', lot_type: 'Produto Acabado', lot_id: 'lot-2', quantity: 50, created_at: '2026-10-01T08:00:00Z' },
      ],
      sales_orders: [{ id: 'order-1', order_number: 'VEN-001' }],
      sales_order_items: [{ id: 'item-1', sales_order_id: 'order-1', product_id: 'prod-1', quantity: 20, unit_price: 45 }],
      sales_order_fulfillments: [{ id: 'ful-1', sales_order_id: 'order-1', sales_order_item_id: 'item-1', finished_product_lot_id: 'lot-1', quantity: 20, fulfilled_at: '2026-10-05T14:00:00Z' }],
      sales_returns: [],
    };
    jest.spyOn(service as any, 'selectMany').mockImplementation(async (...args: unknown[]) => data[String(args[0])] ?? []);

    const report = await service.getStockVsSalesReport({
      startDate: '2026-10-01',
      endDate: '2026-10-07',
      productId: 'prod-1',
    });

    expect(report.totals.currentAvailableStock).toBe(80);
    expect(report.products.length).toBe(1);
    expect(report.products[0].productId).toBe('prod-1');
  });
});
