import { BadRequestException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { ListReportsDto } from './dto/list-reports.dto';

@Injectable()
export class ReportsService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async getProductionReport(filters: ListReportsDto = {}) {
    const [orders, products, lots] = await Promise.all([
      this.selectMany('production_orders'),
      this.selectMany('finished_products'),
      this.selectMany('milk_lots'),
    ]);

    const productMap = new Map(products.map((product) => [String(product.id), product]));
    const lotMap = new Map(lots.map((lot) => [String(lot.id), lot]));
    const rows = orders
      .map((order) => {
        const product = productMap.get(String(order.product_id));
        const lot = lotMap.get(String(order.milk_lot_id));
        const expectedYield = Number(order.expected_yield ?? 0);
        const actualQuantity = Number(order.actual_quantity_produced ?? 0);
        const yieldDelta = actualQuantity - expectedYield;

        return {
          orderId: String(order.id),
          orderNumber: String(order.order_number),
          productId: String(order.product_id),
          productName: String(product?.name ?? '-'),
          milkLotId: String(order.milk_lot_id),
          milkLotCode: String(lot?.code ?? '-'),
          litersPlanned: Number(order.liters_planned ?? 0),
          expectedYield,
          actualQuantityProduced: actualQuantity,
          actualYield: Number(order.actual_yield ?? 0),
          yieldDelta,
          status: String(order.status),
          startedAt: String(order.started_at),
          finishedAt: order.finished_at ? String(order.finished_at) : null,
        };
      })
      .filter((row) => this.matchesPeriod(row.startedAt, filters))
      .filter((row) => !filters.productId || row.productId === filters.productId)
      .filter((row) => !filters.status || row.status === filters.status)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));

    const totals = {
      ordersCount: rows.length,
      litersPlanned: rows.reduce((sum, row) => sum + row.litersPlanned, 0),
      expectedYield: rows.reduce((sum, row) => sum + row.expectedYield, 0),
      actualQuantityProduced: rows.reduce((sum, row) => sum + row.actualQuantityProduced, 0),
    };

    return {
      period: this.period(filters),
      totals,
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
    const entries = await this.selectMany('financial_entries');

    const rows = entries.filter((entry) => {
      const dateField = basis === 'cash' ? String(entry.payment_date || entry.due_date) : String(entry.due_date);
      if (!this.matchesPeriod(dateField, filters)) {
        return false;
      }
      if (basis === 'cash' && String(entry.status) !== 'Pago') {
        return false;
      }
      return true;
    });

    const revenueCategories = new Map<string, number>();
    const expenseCategories = new Map<string, number>();

    let totalRevenue = 0;
    let totalExpense = 0;

    for (const row of rows) {
      const category = String(row.category || 'Sem Categoria');
      const amount = Number(row.amount || 0);

      if (row.entry_type === 'Receber') {
        totalRevenue += amount;
        revenueCategories.set(category, (revenueCategories.get(category) || 0) + amount);
      } else if (row.entry_type === 'Pagar') {
        totalExpense += amount;
        expenseCategories.set(category, (expenseCategories.get(category) || 0) + amount);
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
      revenues: Array.from(revenueCategories.entries()).map(([category, amount]) => ({ category, amount })),
      expenses: Array.from(expenseCategories.entries()).map(([category, amount]) => ({ category, amount })),
    };
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
