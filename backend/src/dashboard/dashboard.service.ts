import { BadRequestException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class DashboardService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async getSummary() {
    const [milkLots, productionOrders, financialEntries, analyses, supplyItems] =
      await Promise.all([
        this.selectMany('milk_lots'),
        this.selectMany('production_orders'),
        this.selectMany('financial_entries'),
        this.selectMany('milk_lot_analyses'),
        this.selectMany('supply_items'),
      ]);

    const now = new Date();
    const milkReceivedMonth = milkLots.reduce(
      (sum, lot) =>
        this.isCurrentMonth(String(lot.received_at), now)
          ? sum + Number(lot.volume_liters ?? 0)
          : sum,
      0,
    );
    const approvedLots = milkLots.filter((lot) => lot.status === 'Aprovado').length;
    const blockedLots = milkLots.filter((lot) => lot.status === 'Bloqueado').length;
    const pendingAnalysisCount = milkLots.filter(
      (lot) => lot.status === 'Aguardando Análise' || lot.status === 'Aguardando Analise',
    ).length;
    const openOrders = productionOrders.filter((op) => op.status === 'Em Andamento').length;
    const finishedOrders = productionOrders.filter((op) => op.status === 'Finalizada').length;
    const averageCostPerLiter =
      milkLots.filter((lot) => lot.cost_per_liter != null).reduce(
        (sum, lot) => sum + Number(lot.cost_per_liter),
        0,
      ) / Math.max(milkLots.filter((lot) => lot.cost_per_liter != null).length, 1);
    const accountsPayable = financialEntries
      .filter((entry) => entry.entry_type === 'Pagar' && entry.status !== 'Pago')
      .reduce((sum, entry) => sum + Number(entry.amount), 0);
    const accountsReceivable = financialEntries
      .filter((entry) => entry.entry_type === 'Receber' && entry.status !== 'Pago')
      .reduce((sum, entry) => sum + Number(entry.amount), 0);
    const milkPayroll = financialEntries
      .filter((entry) => 
        String(entry.category).toUpperCase().includes('MATÉRIA-PRIMA') || 
        String(entry.category).toUpperCase().includes('MATÉRIA PRIMA')
      )
      .reduce((sum, entry) => sum + Number(entry.amount), 0);
    const overdueEntries = financialEntries.filter((entry) => this.isOverdue(entry)).length;
    const overdueAmount = financialEntries
      .filter((entry) => this.isOverdue(entry))
      .reduce((sum, entry) => sum + Number(entry.amount), 0);
    const lowStockItemsCount = supplyItems.filter(
      (item) => Number(item.current_stock) < Number(item.minimum_stock),
    ).length;

    return {
      milkReceivedMonth,
      approvedLots,
      blockedLots,
      pendingAnalysisCount,
      openOrders,
      finishedOrders,
      averageCostPerLiter: Number(averageCostPerLiter.toFixed(2)),
      accountsPayable,
      accountsReceivable,
      milkPayroll,
      overdueEntries,
      overdueAmount,
      lowStockItemsCount,
      analysesCount: analyses.length,
    };
  }

  private async selectMany(table: string) {
    const { data, error } = await this.supabaseService.admin.from(table).select('*');

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data ?? [];
  }

  private isCurrentMonth(dateValue: string, now: Date) {
    const date = new Date(dateValue);
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  }

  private isOverdue(entry: Record<string, unknown>) {
    return (
      String(entry.status) !== 'Pago' &&
      String(entry.status) !== 'Cancelado' &&
      new Date(String(entry.due_date)) < new Date()
    );
  }
}
