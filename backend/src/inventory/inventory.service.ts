import { BadRequestException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class InventoryService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async getSummary() {
    const [milkLots, supplyLots, finishedProductLots] = await Promise.all([
      this.getMilkLots(),
      this.getSupplyLots(),
      this.getFinishedProductLots(),
    ]);

    return {
      milkLotsCount: milkLots.length,
      supplyLotsCount: supplyLots.length,
      finishedProductLotsCount: finishedProductLots.length,
      supplyBelowMinimumCount: supplyLots.filter(
        (lot) => Number(lot.available_quantity) <= Number(lot.minimum_stock ?? 0),
      ).length,
    };
  }

  async getMilkLots() {
    const { data, error } = await this.supabaseService.admin
      .from('milk_lots')
      .select('*')
      .order('received_at', { ascending: false });

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data ?? [];
  }

  async getSupplyLots() {
    const { data, error } = await this.supabaseService.admin
      .from('supply_lots_with_item')
      .select('*')
      .order('entry_date', { ascending: false });

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data ?? [];
  }

  async getFinishedProductLots() {
    const { data, error } = await this.supabaseService.admin
      .from('finished_product_lots')
      .select('*')
      .order('produced_at', { ascending: false });

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data ?? [];
  }
}
