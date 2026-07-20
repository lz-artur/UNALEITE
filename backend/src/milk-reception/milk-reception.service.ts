import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MILK_LOT_STATUS } from '../common/constants/domain';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateMilkReceptionDto } from './dto/create-milk-reception.dto';
import { UpdateMilkReceptionDto } from './dto/update-milk-reception.dto';

@Injectable()
export class MilkReceptionService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async listReceptions() {
    const { data, error } = await this.supabaseService.admin
      .from('milk_receptions')
      .select('*')
      .order('received_at', { ascending: false });

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data;
  }

  async createReception(payload: CreateMilkReceptionDto, user?: AuthenticatedUser) {
    await this.ensureActive('producers', payload.producerId);
    await this.ensureActive('routes', payload.routeId);
    await this.ensureActive('transporters', payload.transporterId);

    const milkTypeId = payload.milkTypeId ?? (await this.getDefaultMilkTypeId());
    const lotCode = `LT-${new Date(payload.receivedAt).getFullYear()}-${Date.now()}`;

    const receptionPayload = {
      producer_id: payload.producerId,
      route_id: payload.routeId,
      transporter_id: payload.transporterId,
      milk_type_id: milkTypeId,
      volume_liters: payload.volumeLiters,
      temperature: payload.temperatura,
      received_at: payload.receivedAt,
      car_plate: payload.carPlate,
      driver_name: payload.driverName,
      analyst_name: payload.analystName,
      observations: payload.observations,
      created_by: user?.id ?? null,
      updated_by: user?.id ?? null,
    };

    const { data: reception, error: receptionError } = await this.supabaseService.admin
      .from('milk_receptions')
      .insert(receptionPayload)
      .select('*')
      .single();

    if (receptionError) {
      throw new BadRequestException(receptionError.message);
    }

    const { data: lot, error: lotError } = await this.supabaseService.admin
      .from('milk_lots')
      .insert({
        code: lotCode,
        milk_reception_id: reception.id,
        producer_id: payload.producerId,
        route_id: payload.routeId,
        transporter_id: payload.transporterId,
        milk_type_id: milkTypeId,
        volume_liters: payload.volumeLiters,
        available_volume_liters: payload.volumeLiters,
        temperature: payload.temperatura,
        received_at: payload.receivedAt,
        status: MILK_LOT_STATUS.PENDING_ANALYSIS,
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      })
      .select('*')
      .single();

    if (lotError) {
      throw new BadRequestException(lotError.message);
    }

    return {
      reception,
      lot,
    };
  }

  async updateReception(milkLotId: string, payload: UpdateMilkReceptionDto, user?: AuthenticatedUser) {
    const { data: lotData, error: lotFindError } = await this.supabaseService.admin
      .from('milk_lots')
      .select('id, milk_reception_id')
      .eq('id', milkLotId)
      .maybeSingle();

    if (lotFindError) {
      throw new BadRequestException(lotFindError.message);
    }

    if (!lotData) {
      throw new NotFoundException('Milk lot not found');
    }

    if (payload.producerId) await this.ensureActive('producers', payload.producerId);
    if (payload.routeId) await this.ensureActive('routes', payload.routeId);
    if (payload.transporterId) await this.ensureActive('transporters', payload.transporterId);

    const updateReceptionPayload: any = {
      updated_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
    };
    
    if (payload.producerId) updateReceptionPayload.producer_id = payload.producerId;
    if (payload.routeId) updateReceptionPayload.route_id = payload.routeId;
    if (payload.transporterId) updateReceptionPayload.transporter_id = payload.transporterId;
    if (payload.volumeLiters !== undefined) updateReceptionPayload.volume_liters = payload.volumeLiters;
    if (payload.temperatura !== undefined) updateReceptionPayload.temperature = payload.temperatura;
    if (payload.receivedAt) updateReceptionPayload.received_at = payload.receivedAt;
    if (payload.carPlate !== undefined) updateReceptionPayload.car_plate = payload.carPlate;
    if (payload.driverName !== undefined) updateReceptionPayload.driver_name = payload.driverName;
    if (payload.analystName !== undefined) updateReceptionPayload.analyst_name = payload.analystName;
    if (payload.observations !== undefined) updateReceptionPayload.observations = payload.observations;

    const { data: reception, error: receptionError } = await this.supabaseService.admin
      .from('milk_receptions')
      .update(updateReceptionPayload)
      .eq('id', lotData.milk_reception_id)
      .select('*')
      .single();

    if (receptionError) {
      throw new BadRequestException(receptionError.message);
    }

    const updateLotPayload: any = {
      updated_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
    };

    if (payload.producerId) updateLotPayload.producer_id = payload.producerId;
    if (payload.routeId) updateLotPayload.route_id = payload.routeId;
    if (payload.transporterId) updateLotPayload.transporter_id = payload.transporterId;
    if (payload.volumeLiters !== undefined) updateLotPayload.volume_liters = payload.volumeLiters;
    // Note: updating available_volume_liters correctly based on the diff could be complex, 
    // assuming here it's edited only initially before partial usages, or we don't update available_volume_liters implicitly unless logic requires it.
    if (payload.temperatura !== undefined) updateLotPayload.temperature = payload.temperatura;
    if (payload.receivedAt) updateLotPayload.received_at = payload.receivedAt;

    const { data: lot, error: lotError } = await this.supabaseService.admin
      .from('milk_lots')
      .update(updateLotPayload)
      .eq('id', milkLotId)
      .select('*')
      .single();

    if (lotError) {
      throw new BadRequestException(lotError.message);
    }

    return {
      reception,
      lot,
    };
  }

  async listMilkLots() {
    const { data, error } = await this.supabaseService.admin
      .from('milk_lots')
      .select('*')
      .order('received_at', { ascending: false });

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data;
  }

  async getMilkLot(id: string) {
    const { data: lot, error } = await this.supabaseService.admin
      .from('milk_lots')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new BadRequestException(error.message);
    }

    if (!lot) {
      throw new NotFoundException('Milk lot not found');
    }

    const [analysis, pricing, blockEvents, milkConsumptions, receptionData] = await Promise.all([
      this.supabaseService.admin
        .from('milk_lot_analyses')
        .select('*')
        .eq('milk_lot_id', id)
        .order('analyzed_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      this.supabaseService.admin
        .from('milk_lot_pricing')
        .select('*')
        .eq('milk_lot_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      this.supabaseService.admin
        .from('lot_block_events')
        .select('*')
        .eq('lot_id', id)
        .order('created_at', { ascending: false }),
      this.supabaseService.admin
        .from('production_order_milk_consumptions')
        .select('*')
        .eq('milk_lot_id', id)
        .order('created_at', { ascending: false }),
      this.supabaseService.admin
        .from('milk_receptions')
        .select('*')
        .eq('id', lot.milk_reception_id)
        .maybeSingle(),
    ]);

    const productionOrderIds =
      milkConsumptions.data?.map((consumption) => consumption.production_order_id).filter(Boolean) ?? [];

    const [productionOrders, finishedProductLots] = productionOrderIds.length
      ? await Promise.all([
          this.supabaseService.admin
            .from('production_orders')
            .select('*')
            .in('id', productionOrderIds)
            .order('started_at', { ascending: false }),
          this.supabaseService.admin
            .from('finished_product_lots')
            .select('*')
            .in('production_order_id', productionOrderIds)
            .order('produced_at', { ascending: false }),
        ])
      : [
          { data: [], error: null },
          { data: [], error: null },
        ];

    if (productionOrders.error) {
      throw new BadRequestException(productionOrders.error.message);
    }

    if (finishedProductLots.error) {
      throw new BadRequestException(finishedProductLots.error.message);
    }

    return {
      lot,
      reception: receptionData.data,
      analysis: analysis.data,
      pricing: pricing.data,
      blockEvents: blockEvents.data ?? [],
      milkConsumptions: milkConsumptions.data ?? [],
      productionOrders: productionOrders.data ?? [],
      finishedProductLots: finishedProductLots.data ?? [],
    };
  }

  private async ensureActive(table: string, id: string) {
    const { data, error } = await this.supabaseService.admin
      .from(table)
      .select('id, active')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new BadRequestException(error.message);
    }

    if (!data) {
      throw new NotFoundException(`${table} record not found`);
    }

    if ('active' in data && !data.active) {
      throw new BadRequestException(`${table} record is inactive`);
    }
  }

  private async getDefaultMilkTypeId() {
    const { data, error } = await this.supabaseService.admin
      .from('milk_types')
      .select('id')
      .eq('active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new BadRequestException(error.message);
    }

    if (!data?.id) {
      throw new BadRequestException('No active milk type available');
    }

    return data.id as string;
  }

  async deleteReception(milkLotId: string) {
    const { data: lot, error: lotFindError } = await this.supabaseService.admin
      .from('milk_lots')
      .select('id, milk_reception_id, volume_liters, available_volume_liters')
      .eq('id', milkLotId)
      .maybeSingle();

    if (lotFindError) {
      throw new BadRequestException(lotFindError.message);
    }

    if (!lot) {
      throw new NotFoundException('Milk lot not found');
    }

    if (lot.available_volume_liters < lot.volume_liters) {
      throw new BadRequestException('Não é possível excluir o lote pois ele já foi parcialmente ou totalmente consumido na produção.');
    }

    const { count: analysisCount, error: analysisError } = await this.supabaseService.admin
      .from('milk_lot_analyses')
      .select('*', { count: 'exact', head: true })
      .eq('milk_lot_id', milkLotId);

    if (analysisError) {
      throw new BadRequestException(analysisError.message);
    }

    if (analysisCount && analysisCount > 0) {
      throw new BadRequestException('Não é possível excluir o lote pois existem análises de qualidade vinculadas a ele.');
    }

    const { count: productionOrderCount, error: productionOrderError } = await this.supabaseService.admin
      .from('production_orders')
      .select('*', { count: 'exact', head: true })
      .eq('milk_lot_id', milkLotId);

    if (productionOrderError) {
      throw new BadRequestException(productionOrderError.message);
    }

    if (productionOrderCount && productionOrderCount > 0) {
      throw new BadRequestException('Não é possível excluir o lote pois ele está vinculado a uma ordem de produção.');
    }

    await this.supabaseService.admin.from('lot_block_events').delete().eq('lot_id', milkLotId);

    const { error: deleteLotError } = await this.supabaseService.admin
      .from('milk_lots')
      .delete()
      .eq('id', milkLotId);

    if (deleteLotError) {
      throw new BadRequestException(deleteLotError.message);
    }

    const { error: deleteReceptionError } = await this.supabaseService.admin
      .from('milk_receptions')
      .delete()
      .eq('id', lot.milk_reception_id);

    if (deleteReceptionError) {
      throw new BadRequestException(deleteReceptionError.message);
    }

    return { success: true };
  }
}
