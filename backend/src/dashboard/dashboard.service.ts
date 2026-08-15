import { BadRequestException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class DashboardService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async getSummary() {
    const { data, error } = await this.supabaseService.admin.rpc('get_dashboard_summary');

    if (error) {
      throw new BadRequestException(error.message);
    }

    return {
      milkReceivedMonth: Number(data.milkReceivedMonth || 0),
      approvedLots: Number(data.approvedLots || 0),
      blockedLots: Number(data.blockedLots || 0),
      pendingAnalysisCount: Number(data.pendingAnalysisCount || 0),
      openOrders: Number(data.openOrders || 0),
      finishedOrders: Number(data.finishedOrders || 0),
      averageCostPerLiter: Number((data.averageCostPerLiter || 0).toFixed(2)),
      averageCostPerKg: Number((data.averageCostPerKg || 0).toFixed(2)),
      accountsPayable: Number(data.accountsPayable || 0),
      accountsReceivable: Number(data.accountsReceivable || 0),
      milkPayroll: Number(data.milkPayroll || 0),
      overdueEntries: Number(data.overdueEntries || 0),
      overdueAmount: Number(data.overdueAmount || 0),
      lowStockItemsCount: Number(data.lowStockItemsCount || 0),
      analysesCount: Number(data.analysesCount || 0),
    };
  }
}
