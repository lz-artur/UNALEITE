import { BadRequestException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { ListReportsDto } from './dto/list-reports.dto';

type ProductionCostInput = {
  name: string;
  lotCode: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  category: 'Insumo' | 'Creme' | 'Reprocessamento';
};

type ProductionCostBreakdown = {
  milkLiters: number;
  milkCost: number;
  suppliesCost: number;
  creamQuantity: number;
  creamCost: number;
  reprocessedQuantity: number;
  reprocessingCost: number;
  totalCost: number;
  inputs: ProductionCostInput[];
};

@Injectable()
export class ReportsService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async getStockMovementsReport(filters: ListReportsDto = {}) {
    const [movements, supplyLots, supplyItems, finishedProductLots, finishedProducts, milkLots, units] = await Promise.all([
      this.selectMany('stock_movements'),
      this.selectMany('supply_lots'),
      this.selectMany('supply_items'),
      this.selectMany('finished_product_lots'),
      this.selectMany('finished_products'),
      this.selectMany('milk_lots'),
      this.selectMany('units'),
    ]);

    const supplyLotById = new Map(supplyLots.map((lot) => [String(lot.id), lot]));
    const supplyItemById = new Map(supplyItems.map((item) => [String(item.id), item]));
    const productLotById = new Map(finishedProductLots.map((lot) => [String(lot.id), lot]));
    const productById = new Map(finishedProducts.map((product) => [String(product.id), product]));
    const milkLotById = new Map(milkLots.map((lot) => [String(lot.id), lot]));
    const unitById = new Map(units.map((unit) => [String(unit.id), unit]));

    const rows = movements
      .filter((movement) => this.matchesPeriod(String(movement.created_at), filters))
      .filter((movement) => !filters.movementType || movement.movement_type === filters.movementType)
      .filter((movement) => !filters.lotType || movement.lot_type === filters.lotType)
      .map((movement) => {
        const lotId = String(movement.lot_id);
        let itemName = 'Item não encontrado';
        let itemCode: string | null = null;
        let lotCode = '-';
        let unitSymbol = '';

        if (movement.lot_type === 'Insumo') {
          const lot = supplyLotById.get(lotId);
          const item = lot ? supplyItemById.get(String(lot.supply_item_id)) : undefined;
          itemName = item?.name ?? itemName;
          itemCode = item?.code ?? null;
          lotCode = lot?.internal_lot_code ?? lotCode;
          unitSymbol = item ? (unitById.get(String(item.unit_id))?.symbol ?? '') : '';
        } else if (movement.lot_type === 'Produto Acabado') {
          const lot = productLotById.get(lotId);
          const product = lot ? productById.get(String(lot.product_id)) : undefined;
          itemName = product?.name ?? itemName;
          itemCode = product?.code ?? null;
          lotCode = lot?.lot_code ?? lotCode;
          unitSymbol = product ? (unitById.get(String(product.unit_id))?.symbol ?? '') : '';
        } else if (movement.lot_type === 'Leite') {
          const lot = milkLotById.get(lotId);
          itemName = 'Leite cru';
          lotCode = lot?.code ?? lotCode;
          unitSymbol = 'L';
        }

        return {
          movementId: String(movement.id),
          occurredAt: String(movement.created_at),
          movementType: String(movement.movement_type),
          lotType: String(movement.lot_type),
          itemName,
          itemCode,
          lotCode,
          quantity: Number(movement.quantity ?? 0),
          piecesQuantity: movement.pieces_quantity == null ? null : Number(movement.pieces_quantity),
          unitSymbol,
          reference: this.stockMovementReferenceLabel(movement.reference_table),
        };
      })
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

    return {
      period: this.period(filters),
      totals: {
        movementsCount: rows.length,
        entriesCount: rows.filter((row) => row.movementType === 'entrada').length,
        exitsCount: rows.filter((row) => row.movementType === 'saida').length,
        entriesQuantity: rows.filter((row) => row.movementType === 'entrada').reduce((total, row) => total + row.quantity, 0),
        exitsQuantity: rows.filter((row) => row.movementType === 'saida').reduce((total, row) => total + row.quantity, 0),
      },
      rows,
    };
  }

  async getProductionReport(filters: ListReportsDto = {}) {
    const [
      orders,
      products,
      milkLots,
      milkConsumptions,
      milkPricings,
      supplyConsumptions,
      supplyLots,
      supplyItems,
      finishedProductConsumptions,
      finishedProductLots,
    ] = await Promise.all([
      this.selectMany('production_orders'),
      this.selectMany('finished_products'),
      this.selectMany('milk_lots'),
      this.selectMany('production_order_milk_consumptions'),
      this.selectMany('milk_lot_pricing'),
      this.selectMany('production_order_supply_consumptions'),
      this.selectMany('supply_lots'),
      this.selectMany('supply_items'),
      this.selectMany('production_order_finished_product_consumptions'),
      this.selectMany('finished_product_lots'),
    ]);

    const productMap = new Map(products.map((product) => [String(product.id), product]));
    const milkLotMap = new Map(milkLots.map((lot) => [String(lot.id), lot]));
    const supplyLotMap = new Map(supplyLots.map((lot) => [String(lot.id), lot]));
    const supplyItemMap = new Map(supplyItems.map((item) => [String(item.id), item]));
    const orderMap = new Map(orders.map((order) => [String(order.id), order]));
    const productLotMap = new Map(finishedProductLots.map((lot) => [String(lot.id), lot]));
    const pricingByMilkLot = new Map<string, any>();

    for (const pricing of milkPricings.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))) {
      const milkLotId = String(pricing.milk_lot_id);
      if (!pricingByMilkLot.has(milkLotId)) {
        pricingByMilkLot.set(milkLotId, pricing);
      }
    }

    const outputLotsByOrder = this.groupBy(finishedProductLots, 'production_order_id');
    const milkConsumptionsByOrder = this.groupBy(milkConsumptions, 'production_order_id');
    const supplyConsumptionsByOrder = this.groupBy(supplyConsumptions, 'production_order_id');
    const reprocessConsumptionsByOrder = this.groupBy(finishedProductConsumptions, 'production_order_id');
    const orderCostCache = new Map<string, ProductionCostBreakdown>();
    const resolvingOrders = new Set<string>();

    const getOrderCost = (orderId: string): ProductionCostBreakdown => {
      const cached = orderCostCache.get(orderId);
      if (cached) return cached;

      // A circular reprocessamento reference should never exist, but keeping the
      // calculation bounded means a historical data error cannot break reports.
      if (resolvingOrders.has(orderId)) return this.emptyProductionCost();
      resolvingOrders.add(orderId);

      const order = orderMap.get(orderId);
      if (!order) {
        resolvingOrders.delete(orderId);
        return this.emptyProductionCost();
      }

      const milkRows = milkConsumptionsByOrder.get(orderId) ?? [];
      const milkLiters = milkRows.reduce((sum, consumption) => sum + Number(consumption.liters_consumed ?? 0), 0);
      const milkCost = milkRows.reduce((sum, consumption) => {
        const milkLot = milkLotMap.get(String(consumption.milk_lot_id));
        const pricing = pricingByMilkLot.get(String(consumption.milk_lot_id));
        // `unit_cost` is a snapshot of the cost when the milk was consumed.
        // Older orders did not have this snapshot, so use the amount recorded
        // on the milk lot. `milk_lot_pricing` is only a legacy fallback for
        // lots created before the reception-level price was introduced.
        const unitCost = consumption.unit_cost
          ?? milkLot?.cost_per_liter
          ?? pricing?.final_price
          ?? 0;
        return sum + Number(consumption.liters_consumed ?? 0) * Number(unitCost);
      }, 0);

      let suppliesCost = 0;
      let creamCost = 0;
      let creamQuantity = 0;
      const inputs: ProductionCostInput[] = [];
      for (const consumption of supplyConsumptionsByOrder.get(orderId) ?? []) {
        const supplyLot = supplyLotMap.get(String(consumption.supply_lot_id));
        const item = supplyLot ? supplyItemMap.get(String(supplyLot.supply_item_id)) : undefined;
        const quantity = Number(consumption.quantity_consumed ?? 0);
        const value = quantity * Number(supplyLot?.unit_cost ?? 0);
        const isCream = this.isCream(item);

        if (isCream) {
          creamCost += value;
          creamQuantity += quantity;
        } else {
          suppliesCost += value;
        }
        inputs.push({
          name: String(item?.name ?? supplyLot?.internal_lot_code ?? 'Insumo não identificado'),
          lotCode: String(supplyLot?.internal_lot_code ?? '-'),
          quantity,
          unitCost: Number(supplyLot?.unit_cost ?? 0),
          totalCost: value,
          category: isCream ? 'Creme' : 'Insumo',
        });
      }

      let reprocessingCost = 0;
      let reprocessedQuantity = 0;
      for (const consumption of reprocessConsumptionsByOrder.get(orderId) ?? []) {
        const sourceLot = productLotMap.get(String(consumption.finished_product_lot_id));
        const sourceProduct = sourceLot
          ? productMap.get(String(sourceLot.product_id))
          : undefined;
        const quantity = Number(consumption.quantity_consumed ?? 0);
        const sourceCost = sourceLot ? getProductLotCost(sourceLot) : this.emptyProductionCost();
        const unitCost = Number(sourceLot?.quantity_produced ?? 0) > 0
          ? sourceCost.totalCost / Number(sourceLot.quantity_produced)
          : 0;
        const value = quantity * unitCost;
        const isCream = this.isCream(sourceProduct);

        if (isCream) {
          creamCost += value;
          creamQuantity += quantity;
        } else {
          reprocessingCost += value;
          reprocessedQuantity += quantity;
        }
        inputs.push({
          name: `${isCream ? 'Creme' : 'Reprocessamento'}: ${String(sourceLot?.lot_code ?? 'lote não identificado')}`,
          lotCode: String(sourceLot?.lot_code ?? '-'),
          quantity,
          unitCost,
          totalCost: value,
          category: isCream ? 'Creme' : 'Reprocessamento',
        });
      }

      const result: ProductionCostBreakdown = {
        milkLiters,
        milkCost,
        suppliesCost,
        creamQuantity,
        creamCost,
        reprocessedQuantity,
        reprocessingCost,
        totalCost: milkCost + suppliesCost + creamCost + reprocessingCost,
        inputs,
      };
      resolvingOrders.delete(orderId);
      orderCostCache.set(orderId, result);
      return result;
    };

    const getProductLotCost = (productLot: any): ProductionCostBreakdown => {
      const orderId = String(productLot.production_order_id);
      const orderCost = getOrderCost(orderId);
      const outputLots = outputLotsByOrder.get(orderId) ?? [];
      const totalOutput = outputLots.reduce((sum, lot) => sum + Number(lot.quantity_produced ?? 0), 0);
      if (totalOutput <= 0) return orderCost;
      const allocation = totalOutput > 0 ? Number(productLot.quantity_produced ?? 0) / totalOutput : 0;
      return this.scaleProductionCost(orderCost, allocation);
    };

    const reportLots = orders.flatMap((order) => {
      const producedLots = outputLotsByOrder.get(String(order.id)) ?? [];
      if (producedLots.length > 0) return producedLots;
      return [{
        id: `pendente-${String(order.id)}`,
        production_order_id: order.id,
        product_id: order.product_id,
        lot_code: '-',
        quantity_produced: Number(order.actual_quantity_produced ?? 0),
      }];
    });

    const rows = reportLots
      .map((productLot) => {
        const order = orderMap.get(String(productLot.production_order_id));
        if (!order) return null;
        const product = productMap.get(String(productLot.product_id));
        const milkLot = milkLotMap.get(String(order.milk_lot_id));
        const cost = getProductLotCost(productLot);
        const quantityProduced = Number(productLot.quantity_produced ?? 0);
        const inputTotal = cost.milkLiters + cost.reprocessedQuantity + cost.creamQuantity;
        const expectedYield = Number(order.expected_yield ?? 0);

        return {
          orderId: String(order.id),
          orderNumber: String(order.order_number),
          productLotId: String(productLot.id),
          productLotCode: String(productLot.lot_code),
          productId: String(productLot.product_id),
          productName: String(product?.name ?? '-'),
          milkLotId: String(order.milk_lot_id),
          milkLotCode: String(milkLot?.code ?? '-'),
          litersPlanned: Number(order.liters_planned ?? 0),
          expectedYield,
          actualQuantityProduced: quantityProduced,
          actualYield: quantityProduced > 0 ? inputTotal / quantityProduced : 0,
          yieldDelta: quantityProduced - expectedYield,
          yieldInputTotal: inputTotal,
          milkLiters: cost.milkLiters,
          reprocessedQuantity: cost.reprocessedQuantity,
          creamQuantity: cost.creamQuantity,
          milkCost: cost.milkCost,
          suppliesCost: cost.suppliesCost,
          creamCost: cost.creamCost,
          reprocessingCost: cost.reprocessingCost,
          totalCost: cost.totalCost,
          costPerKg: quantityProduced > 0 ? cost.totalCost / quantityProduced : 0,
          inputs: cost.inputs,
          status: String(order.status),
          startedAt: String(order.started_at),
          finishedAt: order.finished_at ? String(order.finished_at) : null,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .filter((row) => this.matchesPeriod(row.finishedAt ?? row.startedAt, filters))
      .filter((row) => !filters.productId || row.productId === filters.productId)
      .filter((row) => !filters.status || row.status === filters.status)
      .sort((a, b) => (b.finishedAt ?? b.startedAt).localeCompare(a.finishedAt ?? a.startedAt));

    const totals = {
      ordersCount: new Set(rows.map((row) => row.orderId)).size,
      litersPlanned: Array.from(new Map(rows.map((row) => [row.orderId, row])).values())
        .reduce((sum, row) => sum + row.litersPlanned, 0),
      expectedYield: Array.from(new Map(rows.map((row) => [row.orderId, row])).values())
        .reduce((sum, row) => sum + row.expectedYield, 0),
      actualQuantityProduced: rows.reduce((sum, row) => sum + row.actualQuantityProduced, 0),
      totalCost: rows.reduce((sum, row) => sum + row.totalCost, 0),
      costPerKg: rows.reduce((sum, row) => sum + row.actualQuantityProduced, 0) > 0
        ? rows.reduce((sum, row) => sum + row.totalCost, 0) / rows.reduce((sum, row) => sum + row.actualQuantityProduced, 0)
        : 0,
    };

    return {
      period: this.period(filters),
      totals,
      rows,
    };
  }

  async getSalesReport(filters: ListReportsDto = {}) {
    const [
      salesOrders,
      salesItems,
      fulfillments,
      clients,
      products,
      productLots,
      invoices,
      users,
      returns,
    ] = await Promise.all([
      this.selectMany('sales_orders'),
      this.selectMany('sales_order_items'),
      this.selectMany('sales_order_fulfillments'),
      this.selectMany('clients'),
      this.selectMany('finished_products'),
      this.selectMany('finished_product_lots'),
      this.selectMany('nfe_invoices'),
      this.selectMany('app_users'),
      this.selectMany('sales_returns'),
    ]);

    const orderMap = new Map(salesOrders.map((order) => [String(order.id), order]));
    const itemMap = new Map(salesItems.map((item) => [String(item.id), item]));
    const clientMap = new Map(clients.map((client) => [String(client.id), client]));
    const productMap = new Map(products.map((product) => [String(product.id), product]));
    const productLotMap = new Map(productLots.map((lot) => [String(lot.id), lot]));
    const usersByReference = new Map<string, any>();
    for (const user of users) {
      usersByReference.set(String(user.id), user);
      usersByReference.set(String(user.auth_user_id), user);
    }

    const invoiceByOrder = new Map<string, any[]>();
    for (const invoice of invoices) {
      const orderId = String(invoice.sales_order_id);
      invoiceByOrder.set(orderId, [...(invoiceByOrder.get(orderId) ?? []), invoice]);
    }

    const returnsByKey = new Map<string, number>();
    for (const returnEntry of returns) {
      const key = this.salesReturnKey(returnEntry.sales_order_id, returnEntry.product_id, returnEntry.finished_product_lot_id);
      returnsByKey.set(key, (returnsByKey.get(key) ?? 0) + Number(returnEntry.returned_quantity ?? 0));
    }

    const productionReport = await this.getProductionReport({});
    const costByProductLot = new Map(
      productionReport.rows.map((row) => [row.productLotId, row]),
    );

    const remainingReturns = new Map(returnsByKey);
    const rows = [...fulfillments]
      .sort((a, b) => String(a.fulfilled_at).localeCompare(String(b.fulfilled_at)))
      .map((fulfillment) => {
        const order = orderMap.get(String(fulfillment.sales_order_id));
        const item = itemMap.get(String(fulfillment.sales_order_item_id));
        const productLot = productLotMap.get(String(fulfillment.finished_product_lot_id));
        if (!order || !item || !productLot) return null;

        const returnKey = this.salesReturnKey(order.id, item.product_id, productLot.id);
        const returnBalance = remainingReturns.get(returnKey) ?? 0;
        const grossQuantity = Number(fulfillment.quantity ?? 0);
        const returnedQuantity = Math.min(grossQuantity, returnBalance);
        remainingReturns.set(returnKey, Math.max(0, returnBalance - returnedQuantity));
        const quantity = grossQuantity - returnedQuantity;
        const invoicesForOrder = invoiceByOrder.get(String(order.id)) ?? [];
        const authorizedInvoice = invoicesForOrder.find((invoice) => String(invoice.status) === 'AUTORIZADA');
        const latestInvoice = [...invoicesForOrder].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0];
        const client = clientMap.get(String(order.client_id));
        const seller = usersByReference.get(String(order.created_by));
        const productionCost = costByProductLot.get(String(productLot.id));
        const lotQuantity = Number(productLot.quantity_produced ?? 0);
        const unitCost = lotQuantity > 0 ? Number(productionCost?.totalCost ?? 0) / lotQuantity : 0;
        const unitPrice = Number(item.unit_price ?? 0);
        const saleValue = quantity * unitPrice;
        const costValue = quantity * unitCost;

        return {
          fulfillmentId: String(fulfillment.id),
          fulfilledAt: String(fulfillment.fulfilled_at),
          orderId: String(order.id),
          orderNumber: String(order.order_number),
          clientId: String(order.client_id),
          clientName: String(client?.name ?? '-'),
          clientDocument: String(client?.document ?? ''),
          sellerName: String(seller?.display_name ?? seller?.email ?? 'Não informado'),
          invoiced: Boolean(authorizedInvoice),
          invoiceStatus: authorizedInvoice ? 'Faturado' : latestInvoice ? String(latestInvoice.status) : 'Não faturado',
          invoiceNumber: authorizedInvoice?.number ?? latestInvoice?.number ?? null,
          productId: String(item.product_id),
          productName: String(productMap.get(String(item.product_id))?.name ?? '-'),
          productLotCode: String(productLot.lot_code ?? '-'),
          grossQuantity,
          returnedQuantity,
          quantity,
          unitPrice,
          saleValue,
          costValue,
          grossMargin: saleValue - costValue,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .filter((row) => this.matchesPeriod(row.fulfilledAt, filters))
      .filter((row) => !filters.clientId || row.clientId === filters.clientId)
      .filter((row) => !filters.productId || row.productId === filters.productId)
      .filter((row) => !filters.status || row.invoiceStatus === filters.status)
      .sort((a, b) => b.fulfilledAt.localeCompare(a.fulfilledAt));

    const totalSaleValue = rows.reduce((sum, row) => sum + row.saleValue, 0);
    const totalCost = rows.reduce((sum, row) => sum + row.costValue, 0);
    return {
      period: this.period(filters),
      totals: {
        salesCount: rows.length,
        totalQuantity: rows.reduce((sum, row) => sum + row.quantity, 0),
        totalSaleValue,
        totalCost,
        grossMargin: totalSaleValue - totalCost,
        invoicedValue: rows.filter((row) => row.invoiced).reduce((sum, row) => sum + row.saleValue, 0),
      },
      rows,
    };
  }

  async getQualityReport(filters: ListReportsDto = {}) {
    const [analyses, lots, producers] = await Promise.all([
      this.selectMany('milk_lot_analyses'),
      this.selectMany('milk_lots'),
      this.selectMany('producers'),
    ]);

    const lotMap = new Map(lots.map((lot) => [String(lot.id), lot]));
    const producerMap = new Map(producers.map((producer) => [String(producer.id), producer]));
    const rows = analyses
      .map((analysis) => {
        const lot = lotMap.get(String(analysis.milk_lot_id));
        const producer = lot ? producerMap.get(String(lot.producer_id)) : null;

        return {
          analysisId: String(analysis.id),
          analyzedAt: String(analysis.analyzed_at),
          lotId: String(analysis.milk_lot_id),
          lotCode: String(lot?.code ?? '-'),
          producerId: String(producer?.id ?? ''),
          producerName: String(producer?.name ?? '-'),
          approved: Boolean(analysis.approved),
          status: Boolean(analysis.approved) ? 'Aprovado' : 'Reprovado',
          alizarol: String(analysis.alizarol ?? ''),
          antibioticos: String(analysis.antibioticos ?? ''),
          gordura: Number(analysis.gordura ?? 0),
          proteina: Number(analysis.proteina ?? 0),
          acidez: Number(analysis.acidez ?? 0),
          cbt: Number(analysis.cbt ?? 0),
          ccs: Number(analysis.ccs ?? 0),
        };
      })
      .filter((row) => this.matchesPeriod(row.analyzedAt, filters))
      .filter((row) => !filters.producerId || row.producerId === filters.producerId)
      .filter((row) => !filters.status || row.status === filters.status)
      .sort((a, b) => b.analyzedAt.localeCompare(a.analyzedAt));

    const totals = {
      analysesCount: rows.length,
      approvedCount: rows.filter((row) => row.approved).length,
      blockedCount: rows.filter((row) => !row.approved).length,
      averageFat:
        rows.length > 0 ? rows.reduce((sum, row) => sum + row.gordura, 0) / rows.length : 0,
      averageProtein:
        rows.length > 0 ? rows.reduce((sum, row) => sum + row.proteina, 0) / rows.length : 0,
    };

    return {
      period: this.period(filters),
      totals,
      rows,
    };
  }

  async getPricingReport(filters: ListReportsDto = {}) {
    const [pricings, lots, producers] = await Promise.all([
      this.selectMany('milk_lot_pricing'),
      this.selectMany('milk_lots'),
      this.selectMany('producers'),
    ]);

    const lotMap = new Map(lots.map((lot) => [String(lot.id), lot]));
    const producerMap = new Map(producers.map((producer) => [String(producer.id), producer]));
    const rows = pricings
      .map((pricing) => {
        const lot = lotMap.get(String(pricing.milk_lot_id));
        const producer = producerMap.get(String(pricing.producer_id));

        return {
          pricingId: String(pricing.id),
          createdAt: String(pricing.created_at),
          lotId: String(pricing.milk_lot_id),
          lotCode: String(lot?.code ?? '-'),
          producerId: String(producer?.id ?? ''),
          producerName: String(producer?.name ?? '-'),
          lotStatus: String(lot?.status ?? '-'),
          volumeLiters: Number(lot?.volume_liters ?? 0),
          basePrice: Number(pricing.base_price ?? 0),
          finalPrice: Number(pricing.final_price ?? 0),
          totalValue: Number(pricing.total_value ?? 0),
          fatBonus: Number(pricing.fat_bonus ?? 0),
          proteinBonus: Number(pricing.protein_bonus ?? 0),
          acidityPenalty: Number(pricing.acidity_penalty ?? 0),
          cbtPenalty: Number(pricing.cbt_penalty ?? 0),
          ccsPenalty: Number(pricing.ccs_penalty ?? 0),
        };
      })
      .filter((row) => this.matchesPeriod(row.createdAt, filters))
      .filter((row) => !filters.producerId || row.producerId === filters.producerId)
      .filter((row) => !filters.status || row.lotStatus === filters.status)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const totals = {
      pricingsCount: rows.length,
      totalVolumeLiters: rows.reduce((sum, row) => sum + row.volumeLiters, 0),
      totalValue: rows.reduce((sum, row) => sum + row.totalValue, 0),
      averageFinalPrice:
        rows.length > 0 ? rows.reduce((sum, row) => sum + row.finalPrice, 0) / rows.length : 0,
    };

    return {
      period: this.period(filters),
      totals,
      rows,
    };
  }

  async getDreReport(filters: ListReportsDto = {}) {
    const basis = filters.basis || 'accrual';
    const [entries, entryItems, categories, receipts] = await Promise.all([
      this.selectMany('financial_entries'),
      this.selectMany('financial_entry_items'),
      this.selectMany('accounting_categories'),
      this.selectMany('financial_entry_receipts'),
    ]);

    const dreCategoryMap = new Map(categories.filter((c: any) => c.show_in_dre).map((c: any) => [c.id, c.name]));
    const dreCategoryNames = new Set(categories.filter((c: any) => c.show_in_dre).map((c: any) => c.name));

    const rows = basis === 'cash'
      ? entries.flatMap((entry) => receipts
          .filter((receipt) => String(receipt.financial_entry_id) === String(entry.id))
          .filter((receipt) => this.matchesPeriod(String(receipt.payment_date), filters))
          .map((receipt) => ({
            ...entry,
            payment_date: receipt.payment_date,
            cash_amount: Number(receipt.amount || 0),
            cash_ratio: Number(entry.amount || 0) > 0
              ? Number(receipt.amount || 0) / Number(entry.amount)
              : 0,
          })))
      : entries.filter((entry) => this.matchesPeriod(String(entry.due_date), filters));

    const revenueCategories = new Map<string, number>();
    const expenseCategories = new Map<string, number>();

    // Preserve the configured chart of accounts in the simpler DRE endpoint too.
    // This keeps zero-valued rubrics visible for exports and API consumers.
    for (const category of categories.filter((item: any) => item.show_in_dre && item.active !== false)) {
      if (category.entry_type === 'Receber') {
        revenueCategories.set(String(category.name), 0);
      } else if (category.entry_type === 'Pagar') {
        expenseCategories.set(String(category.name), 0);
      }
    }

    let totalRevenue = 0;
    let totalExpense = 0;

    for (const row of rows) {
      const items = entryItems.filter((item: any) => String(item.financial_entry_id) === String(row.id));

      if (items.length > 0) {
        for (const item of items) {
          let category = String(row.category || 'Sem Categoria');
          if (item.accounting_category_id && dreCategoryMap.has(item.accounting_category_id)) {
            category = dreCategoryMap.get(item.accounting_category_id)!;
          } else if (row.accounting_category_id && dreCategoryMap.has(row.accounting_category_id)) {
            category = dreCategoryMap.get(row.accounting_category_id)!;
          } else if (!dreCategoryNames.has(category)) {
            continue;
          }

          const amount = Number(item.amount || 0) * Number(row.cash_ratio ?? 1);

          if (row.entry_type === 'Receber') {
            totalRevenue += amount;
            revenueCategories.set(category, (revenueCategories.get(category) || 0) + amount);
          } else if (row.entry_type === 'Pagar') {
            totalExpense += amount;
            expenseCategories.set(category, (expenseCategories.get(category) || 0) + amount);
          }
        }
      } else {
        let category = String(row.category || 'Sem Categoria');
        
        if (row.accounting_category_id && dreCategoryMap.has(row.accounting_category_id)) {
          category = dreCategoryMap.get(row.accounting_category_id)!;
        } else if (!dreCategoryNames.has(category)) {
          continue;
        }

        const amount = Number(row.cash_amount ?? row.amount ?? 0);

        if (row.entry_type === 'Receber') {
          totalRevenue += amount;
          revenueCategories.set(category, (revenueCategories.get(category) || 0) + amount);
        } else if (row.entry_type === 'Pagar') {
          totalExpense += amount;
          expenseCategories.set(category, (expenseCategories.get(category) || 0) + amount);
        }
      }
    }

    return {
      period: this.period(filters),
      basis,
      totals: {
        totalRevenue,
        totalExpense,
        netIncome: totalRevenue - totalExpense,
      },
      revenues: Array.from(revenueCategories.entries()).sort(([a], [b]) => a.localeCompare(b, 'pt-BR')).map(([category, amount]) => ({ category, amount })),
      expenses: Array.from(expenseCategories.entries()).sort(([a], [b]) => a.localeCompare(b, 'pt-BR')).map(([category, amount]) => ({ category, amount })),
    };
  }

  
  async getDreMatrixReport(filters: ListReportsDto = {}) {
    let { startDate, endDate } = filters;
    if (!startDate || !endDate) {
      const now = new Date();
      endDate = now.toISOString().slice(0, 10);
      startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().slice(0, 10);
    }

    const startObj = new Date(startDate);
    const endObj = new Date(endDate);
    const months: string[] = [];
    const cursor = new Date(startObj.getFullYear(), startObj.getMonth(), 1);
    while (cursor <= endObj) {
      months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
      cursor.setMonth(cursor.getMonth() + 1);
    }

    const [entries, entryItems, categories, subcategories, receipts] = await Promise.all([
      this.selectMany('financial_entries'), this.selectMany('financial_entry_items'),
      this.selectMany('accounting_categories'), this.selectMany('accounting_subcategories'),
      this.selectMany('financial_entry_receipts'),
    ]);
    const initMonthMap = () => Object.fromEntries(months.map((month) => [month, { previsto: 0, realizado: 0 }]));
    const dreCategories = categories.filter((category: any) => category.show_in_dre && category.active !== false);
    const categoryById = new Map(dreCategories.map((category: any) => [String(category.id), category]));
    const categoryByLegacyName = new Map(dreCategories.map((category: any) => [`${category.entry_type}:${category.name}`, category]));
    const subcategoryById = new Map(subcategories.filter((subcategory: any) => subcategory.active !== false).map((subcategory: any) => [String(subcategory.id), subcategory]));

    type Series = Record<string, { previsto: number; realizado: number }>;
    type CategoryBucket = { id: string; category: string; data: Series; subcategories: Map<string, { id: string; name: string; data: Series }> };
    const revenueCategories = new Map<string, CategoryBucket>();
    const expenseCategories = new Map<string, CategoryBucket>();
    const costTypes = ['Fixo', 'Variável', 'Não classificado'] as const;
    const revenueCostTypes = new Map(costTypes.map((costType) => [costType, initMonthMap()]));
    const expenseCostTypes = new Map(costTypes.map((costType) => [costType, initMonthMap()]));
    const totals = { revenues: initMonthMap(), expenses: initMonthMap(), netIncome: initMonthMap(), accumulatedBalance: initMonthMap() };

    // Pre-create all configured DRE rubrics. This deliberately includes zero-valued
    // categories and subcategories so the report is stable from month to month.
    for (const category of dreCategories) {
      const target = category.entry_type === 'Receber' ? revenueCategories : expenseCategories;
      const bucket: CategoryBucket = { id: String(category.id), category: String(category.name), data: initMonthMap(), subcategories: new Map() };
      for (const subcategory of subcategories.filter((item: any) => String(item.category_id) === String(category.id) && item.active !== false)) {
        bucket.subcategories.set(String(subcategory.id), { id: String(subcategory.id), name: String(subcategory.name), data: initMonthMap() });
      }
      target.set(String(category.id), bucket);
    }

    const resolveRubric = (row: any, item?: any) => {
      const categoryId = item?.accounting_category_id || row.accounting_category_id;
      const category = categoryById.get(String(categoryId))
        || categoryByLegacyName.get(`${row.entry_type}:${String(row.category || '')}`);
      if (!category) return undefined;
      const subcategoryId = item?.accounting_subcategory_id || row.accounting_subcategory_id;
      const subcategory = subcategoryById.get(String(subcategoryId));
      return {
        category,
        subcategory: subcategory && String(subcategory.category_id) === String(category.id) ? subcategory : undefined,
        costType: item?.cost_type || row.cost_type,
      };
    };

    const addAmount = (entryType: string, rubric: any, month: string, amount: number, realizedAmount: number) => {
      const isRevenue = entryType === 'Receber';
      const target = isRevenue ? revenueCategories : expenseCategories;
      const bucket = target.get(String(rubric.category.id));
      if (!bucket) return;
      bucket.data[month].previsto += amount;
      bucket.data[month].realizado += realizedAmount;
      if (rubric.subcategory) {
        const child = bucket.subcategories.get(String(rubric.subcategory.id));
        if (child) {
          child.data[month].previsto += amount;
          child.data[month].realizado += realizedAmount;
        }
      }
      const normalizedCostType = rubric.costType === 'Fixo' || rubric.costType === 'Variável' ? rubric.costType : 'Não classificado';
      const costTarget = isRevenue ? revenueCostTypes : expenseCostTypes;
      costTarget.get(normalizedCostType)![month].previsto += amount;
      costTarget.get(normalizedCostType)![month].realizado += realizedAmount;
      const total = isRevenue ? totals.revenues : totals.expenses;
      total[month].previsto += amount;
      total[month].realizado += realizedAmount;
    };

    let initialBalance = 0;
    const firstMonth = new Date(startObj.getFullYear(), startObj.getMonth(), 1);
    for (const row of entries) {
      if (!row.due_date || (row.entry_type !== 'Receber' && row.entry_type !== 'Pagar')) continue;
      const dueDate = new Date(String(row.due_date));
      const receivedAmount = receipts.filter((receipt) => String(receipt.financial_entry_id) === String(row.id)).reduce((sum, receipt) => sum + Number(receipt.amount || 0), 0);
      const receivedRatio = Number(row.amount || 0) > 0 ? Math.min(1, receivedAmount / Number(row.amount)) : 0;
      const items = entryItems.filter((item: any) => String(item.financial_entry_id) === String(row.id));
      const allocations = items.length ? items : [row];

      for (const item of allocations) {
        const rubric = resolveRubric(row, items.length ? item : undefined);
        if (!rubric) continue;
        const amount = Number(items.length ? item.amount : row.amount || 0);
        const realizedAmount = items.length ? amount * receivedRatio : receivedAmount;
        if (dueDate < firstMonth) {
          if (receivedAmount > 0) initialBalance += row.entry_type === 'Receber' ? realizedAmount : -realizedAmount;
          continue;
        }
        const month = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}`;
        if (months.includes(month)) addAmount(row.entry_type, rubric, month, amount, receivedAmount > 0 ? realizedAmount : 0);
      }
    }

    let accumulatedPrevisto = initialBalance;
    let accumulatedRealizado = initialBalance;
    for (const month of months) {
      totals.netIncome[month].previsto = totals.revenues[month].previsto - totals.expenses[month].previsto;
      totals.netIncome[month].realizado = totals.revenues[month].realizado - totals.expenses[month].realizado;
      accumulatedPrevisto += totals.netIncome[month].previsto;
      accumulatedRealizado += totals.netIncome[month].realizado;
      totals.accumulatedBalance[month] = { previsto: accumulatedPrevisto, realizado: accumulatedRealizado };
    }
    const toRows = (source: Map<string, CategoryBucket>) => Array.from(source.values())
      .sort((a, b) => a.category.localeCompare(b.category, 'pt-BR'))
      .map((category) => ({ ...category, subcategories: Array.from(category.subcategories.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')) }));
    const toCostRows = (source: Map<string, Series>) => costTypes.map((costType) => ({ costType, data: source.get(costType)! }));

    return { period: { startDate, endDate }, months, initialBalance, totals, revenues: toRows(revenueCategories), expenses: toRows(expenseCategories), costTypeBreakdown: { revenues: toCostRows(revenueCostTypes), expenses: toCostRows(expenseCostTypes) } };
  }

  private groupBy(rows: any[], key: string) {
    const groups = new Map<string, any[]>();
    for (const row of rows) {
      const groupKey = String(row[key]);
      groups.set(groupKey, [...(groups.get(groupKey) ?? []), row]);
    }
    return groups;
  }

  private emptyProductionCost(): ProductionCostBreakdown {
    return {
      milkLiters: 0,
      milkCost: 0,
      suppliesCost: 0,
      creamQuantity: 0,
      creamCost: 0,
      reprocessedQuantity: 0,
      reprocessingCost: 0,
      totalCost: 0,
      inputs: [],
    };
  }

  private scaleProductionCost(cost: ProductionCostBreakdown, factor: number): ProductionCostBreakdown {
    return {
      milkLiters: cost.milkLiters * factor,
      milkCost: cost.milkCost * factor,
      suppliesCost: cost.suppliesCost * factor,
      creamQuantity: cost.creamQuantity * factor,
      creamCost: cost.creamCost * factor,
      reprocessedQuantity: cost.reprocessedQuantity * factor,
      reprocessingCost: cost.reprocessingCost * factor,
      totalCost: cost.totalCost * factor,
      inputs: cost.inputs.map((input) => ({
        ...input,
        quantity: input.quantity * factor,
        totalCost: input.totalCost * factor,
      })),
    };
  }

  private isCream(item?: any) {
    const label = `${item?.name ?? ''} ${item?.category ?? ''}`
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    return label.includes('creme');
  }

  private salesReturnKey(salesOrderId: unknown, productId: unknown, productLotId: unknown) {
    return `${String(salesOrderId)}:${String(productId)}:${String(productLotId)}`;
  }

  private stockMovementReferenceLabel(referenceTable: unknown) {
    const labels: Record<string, string> = {
      purchases: 'Compra',
      production_orders: 'Ordem de produção',
      sales_order_fulfillments: 'Atendimento de venda',
      sale_expeditions: 'Expedição de venda',
      sales_returns: 'Devolução de venda',
      warehouse_withdrawals: 'Retirada de almoxarifado',
      finished_product_manual_exits: 'Saída manual',
      expired_lot_disposals: 'Baixa de lote vencido',
      inventory_count_items: 'Ajuste de inventário',
    };
    return labels[String(referenceTable)] ?? (referenceTable ? String(referenceTable) : 'Movimentação de estoque');
  }


  private async selectMany(table: string) {
    const { data, error } = await this.supabaseService.admin.from(table).select('*');

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data ?? [];
  }

  private matchesPeriod(dateValue: string, filters: ListReportsDto) {
    if (filters.startDate && new Date(dateValue) < new Date(filters.startDate)) {
      return false;
    }

    if (filters.endDate) {
      const endDate = new Date(filters.endDate);
      endDate.setHours(23, 59, 59, 999);
      if (new Date(dateValue) > endDate) {
        return false;
      }
    }

    return true;
  }

  private period(filters: ListReportsDto) {
    return {
      startDate: filters.startDate ?? null,
      endDate: filters.endDate ?? null,
    };
  }
}
