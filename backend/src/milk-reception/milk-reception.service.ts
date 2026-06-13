import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MILK_LOT_STATUS } from '../common/constants/domain';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateMilkReceptionDto } from './dto/create-milk-reception.dto';

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

    const [analysis, pricing, blockEvents, milkConsumptions] = await Promise.all([
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
}
