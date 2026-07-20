import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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

  async deleteSupplyLot(id: string) {
    const { data: lot, error: findError } = await this.supabaseService.admin
      .from('supply_lots')
      .select('id, received_quantity, available_quantity')
      .eq('id', id)
      .maybeSingle();

    if (findError) throw new BadRequestException(findError.message);
    if (!lot) throw new NotFoundException('Lote de insumo não encontrado');

    if (lot.available_quantity < lot.received_quantity) {
      throw new BadRequestException('Não é possível excluir o lote de insumo pois ele já foi parcialmente ou totalmente consumido.');
    }

    const { error: deleteError } = await this.supabaseService.admin
      .from('supply_lots')
      .delete()
      .eq('id', id);

    if (deleteError) throw new BadRequestException(deleteError.message);
    return { success: true };
  }

  async deleteFinishedProductLot(id: string) {
    const { data: lot, error: findError } = await this.supabaseService.admin
      .from('finished_product_lots')
      .select('id, quantity_produced, available_quantity')
      .eq('id', id)
      .maybeSingle();

    if (findError) throw new BadRequestException(findError.message);
    if (!lot) throw new NotFoundException('Lote de produto acabado não encontrado');

    if (lot.available_quantity < lot.quantity_produced) {
      throw new BadRequestException('Não é possível excluir o lote de produto pois ele já foi parcialmente ou totalmente vendido.');
    }

    const { error: deleteError } = await this.supabaseService.admin
      .from('finished_product_lots')
      .delete()
      .eq('id', id);

    if (deleteError) throw new BadRequestException(deleteError.message);
    return { success: true };
  }
}
