import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateManualExitDto } from './dto/create-manual-exit.dto';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';

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

  async createManualExit(payload: CreateManualExitDto, user?: AuthenticatedUser) {
    const { data: lot, error: findError } = await this.supabaseService.admin
      .from('finished_product_lots')
      .select('id, available_quantity, lot_code')
      .eq('id', payload.finishedProductLotId)
      .maybeSingle();

    if (findError) throw new BadRequestException(findError.message);
    if (!lot) throw new NotFoundException('Lote de produto acabado não encontrado');

    if (payload.quantity > Number(lot.available_quantity)) {
      throw new BadRequestException(`O lote ${String(lot.lot_code)} não tem quantidade disponível suficiente (Disponível: ${lot.available_quantity})`);
    }

    const exitDate = payload.exitDate ?? new Date().toISOString();

    const { data: exitRecord, error: exitError } = await this.supabaseService.admin
      .from('finished_product_manual_exits')
      .insert({
        finished_product_lot_id: payload.finishedProductLotId,
        quantity: payload.quantity,
        reason: payload.reason,
        notes: payload.notes ?? null,
        exit_date: exitDate,
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      })
      .select('*')
      .single();

    if (exitError) {
      throw new BadRequestException(exitError.message);
    }

    const { error: lotUpdateError } = await this.supabaseService.admin
      .from('finished_product_lots')
      .update({
        available_quantity: Number(lot.available_quantity) - payload.quantity,
        updated_by: user?.id ?? null,
      })
      .eq('id', payload.finishedProductLotId);

    if (lotUpdateError) {
      throw new BadRequestException(lotUpdateError.message);
    }

    const { error: movementError } = await this.supabaseService.admin
      .from('stock_movements')
      .insert({
        movement_type: 'saida',
        lot_type: 'Produto Acabado',
        lot_id: payload.finishedProductLotId,
        quantity: payload.quantity,
        reference_table: 'finished_product_manual_exits',
        reference_id: exitRecord.id,
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      });

    if (movementError) {
      throw new BadRequestException(movementError.message);
    }

    return { success: true, exitRecord };
  }
}
