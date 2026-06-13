import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MILK_LOT_STATUS,
  PRODUCTION_ORDER_STATUS,
  SUPPLY_LOT_STATUS,
} from '../common/constants/domain';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { DomainRulesService } from '../common/services/domain-rules.service';
import { SupabaseService } from '../supabase/supabase.service';
import { CompleteProductionOrderDto } from './dto/complete-production-order.dto';
import { CreateProductionOrderDto } from './dto/create-production-order.dto';

@Injectable()
export class ProductionService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly domainRulesService: DomainRulesService,
  ) {}

  async listOrders() {
    const { data, error } = await this.supabaseService.admin
      .from('production_orders')
      .select('*')
      .order('started_at', { ascending: false });

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data;
  }

  async createOrder(payload: CreateProductionOrderDto, user?: AuthenticatedUser) {
    const milkLot = await this.getById('milk_lots', payload.milkLotId);
    const product = await this.getById('finished_products', payload.productId);
    const productSpec = await this.getActiveProductSpec(payload.productId);
    const analysis = milkLot.latest_analysis_id
      ? await this.getById('milk_lot_analyses', String(milkLot.latest_analysis_id))
      : null;

    if (!product.active) {
      throw new BadRequestException('Finished product is inactive');
    }

    if (!([MILK_LOT_STATUS.APPROVED, MILK_LOT_STATUS.PARTIALLY_USED] as string[]).includes(String(milkLot.status))) {
      throw new BadRequestException('Milk lot is not available for production');
    }

    if (Number(milkLot.available_volume_liters) < payload.litersToUse) {
      throw new BadRequestException('Milk lot does not have enough available volume');
    }

    const expectedYield = this.domainRulesService.calculateExpectedYield(
      payload.litersToUse,
      Number(product.theoretical_yield),
    );
    const fatAdjustment = this.domainRulesService.calculateFatAdjustment(
      payload.litersToUse,
      analysis?.gordura as number | undefined,
      productSpec?.ideal_fat as number | undefined,
    );
    const orderNumber = `OP-${new Date().getFullYear()}-${Date.now()}`;

    const { data: order, error } = await this.supabaseService.admin
      .from('production_orders')
      .insert({
        order_number: orderNumber,
        milk_lot_id: payload.milkLotId,
        product_id: payload.productId,
        liters_planned: payload.litersToUse,
        expected_yield: expectedYield,
        fat_adjustment_kg: fatAdjustment,
        status: PRODUCTION_ORDER_STATUS.IN_PROGRESS,
        started_at: new Date().toISOString(),
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      })
      .select('*')
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    await this.supabaseService.admin.from('production_order_milk_consumptions').insert({
      production_order_id: order.id,
      milk_lot_id: payload.milkLotId,
      liters_consumed: payload.litersToUse,
      created_by: user?.id ?? null,
      updated_by: user?.id ?? null,
    });

    return {
      order,
      expectedYield,
      fatAdjustmentKg: fatAdjustment,
      estimatedRevenue:
        product.sale_price != null ? expectedYield * Number(product.sale_price) : null,
    };
  }

  async completeOrder(
    orderId: string,
    payload: CompleteProductionOrderDto,
    user?: AuthenticatedUser,
  ) {
    const order = await this.getById('production_orders', orderId);

    if (order.status !== PRODUCTION_ORDER_STATUS.IN_PROGRESS) {
      throw new BadRequestException('Production order is not in progress');
    }

    const milkLot = await this.getById('milk_lots', String(order.milk_lot_id));
    const product = await this.getById('finished_products', String(order.product_id));
    const productSpec = await this.getActiveProductSpec(String(order.product_id));

    const supplyConsumptions =
      payload.supplyConsumptions?.length
        ? payload.supplyConsumptions
        : await this.buildFefoConsumptions(productSpec, Number(order.liters_planned));

    for (const consumption of supplyConsumptions) {
      const supplyLot = await this.getById('supply_lots', consumption.supplyLotId);
      const availableQuantity = Number(supplyLot.available_quantity);
      const isExpired =
        supplyLot.expiration_date != null &&
        (supplyLot.expiration_date && String(supplyLot.expiration_date).split('T')[0] < new Date().toISOString().split('T')[0]);

      if (
        ([SUPPLY_LOT_STATUS.BLOCKED, SUPPLY_LOT_STATUS.EXPIRED, SUPPLY_LOT_STATUS.USED] as string[]).includes(String(supplyLot.status)) ||
        isExpired
      ) {
        throw new BadRequestException(`Supply lot ${supplyLot.internal_lot_code} is unavailable`);
      }

      if (availableQuantity < consumption.quantity) {
        throw new BadRequestException(`Supply lot ${supplyLot.internal_lot_code} has insufficient stock`);
      }
    }

    if (new Date(milkLot.received_at) > new Date()) {
      throw new BadRequestException('Milk lot received date is invalid');
    }

    const newAvailableVolume =
      Number(milkLot.available_volume_liters) - Number(order.liters_planned);

    if (newAvailableVolume < 0) {
      throw new BadRequestException('Milk lot would end with negative available volume');
    }

    const milkStatus =
      newAvailableVolume <= 0 ? MILK_LOT_STATUS.USED : MILK_LOT_STATUS.PARTIALLY_USED;

    const { data: completedOrder, error: orderError } = await this.supabaseService.admin
      .from('production_orders')
      .update({
        actual_quantity_produced: payload.actualQuantityProduced,
        actual_yield: Number(
          (Number(order.liters_planned) / payload.actualQuantityProduced).toFixed(3),
        ),
        status: PRODUCTION_ORDER_STATUS.FINISHED,
        finished_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      })
      .eq('id', orderId)
      .select('*')
      .single();

    if (orderError) {
      throw new BadRequestException(orderError.message);
    }

    const { error: milkUpdateError } = await this.supabaseService.admin
      .from('milk_lots')
      .update({
        available_volume_liters: newAvailableVolume,
        status: milkStatus,
        updated_by: user?.id ?? null,
      })
      .eq('id', milkLot.id);

    if (milkUpdateError) {
      throw new BadRequestException(milkUpdateError.message);
    }

    for (const consumption of supplyConsumptions) {
      const supplyLot = await this.getById('supply_lots', consumption.supplyLotId);
      const nextAvailable = Number(supplyLot.available_quantity) - consumption.quantity;

      if (nextAvailable < 0) {
        throw new BadRequestException(`Supply lot ${supplyLot.internal_lot_code} would become negative`);
      }

      const nextStatus =
        nextAvailable <= 0 ? SUPPLY_LOT_STATUS.USED : SUPPLY_LOT_STATUS.PARTIALLY_USED;

      await this.supabaseService.admin.from('production_order_supply_consumptions').insert({
        production_order_id: orderId,
        supply_lot_id: consumption.supplyLotId,
        quantity_consumed: consumption.quantity,
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      });

      await this.supabaseService.admin
        .from('supply_lots')
        .update({
          available_quantity: nextAvailable,
          status: nextStatus,
          updated_by: user?.id ?? null,
        })
        .eq('id', consumption.supplyLotId);

      const { data: supplyItem } = await this.supabaseService.admin
        .from('supply_items')
        .select('id, current_stock')
        .eq('id', supplyLot.supply_item_id)
        .maybeSingle();

      if (supplyItem) {
        const nextCurrentStock = Number(supplyItem.current_stock) - consumption.quantity;
        await this.supabaseService.admin
          .from('supply_items')
          .update({
            current_stock: Math.max(nextCurrentStock, 0),
            updated_by: user?.id ?? null,
          })
          .eq('id', supplyLot.supply_item_id);
      }
    }

    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + Number(product.shelf_life_days));

    const finishedProductLotCode = `PA-${new Date().getFullYear()}-${Date.now()}`;
    const { data: productLot, error: productLotError } = await this.supabaseService.admin
      .from('finished_product_lots')
      .insert({
        product_id: product.id,
        production_order_id: orderId,
        lot_code: finishedProductLotCode,
        quantity_produced: payload.actualQuantityProduced,
        available_quantity: payload.actualQuantityProduced,
        produced_at: new Date().toISOString(),
        expiration_date: expirationDate.toISOString(),
        storage_location_id: await this.getDefaultFinishedProductLocationId(),
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      })
      .select('*')
      .single();

    if (productLotError) {
      throw new BadRequestException(productLotError.message);
    }

    await this.supabaseService.admin.from('stock_movements').insert([
      {
        movement_type: 'saida',
        lot_type: 'Leite',
        lot_id: milkLot.id,
        quantity: Number(order.liters_planned),
        reference_table: 'production_orders',
        reference_id: orderId,
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      },
      {
        movement_type: 'entrada',
        lot_type: 'Produto Acabado',
        lot_id: productLot.id,
        quantity: payload.actualQuantityProduced,
        reference_table: 'production_orders',
        reference_id: orderId,
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      },
    ]);

    return {
      order: completedOrder,
      productLot,
      supplyConsumptions,
    };
  }

  private async getById(table: string, id: string) {
    const { data, error } = await this.supabaseService.admin
      .from(table)
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new BadRequestException(error.message);
    }

    if (!data) {
      throw new NotFoundException(`${table} record not found`);
    }

    return data;
  }

  private async getActiveProductSpec(productId: string) {
    const { data, error } = await this.supabaseService.admin
      .from('product_specs')
      .select('*, product_spec_items(*)')
      .eq('product_id', productId)
      .eq('active', true)
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data;
  }

  private async buildFefoConsumptions(productSpec: Record<string, unknown> | null, litersPlanned: number) {
    if (!productSpec) {
      return [];
    }

    const items = (productSpec.product_spec_items as Array<Record<string, unknown>> | undefined) ?? [];
    const consumptions: Array<{ supplyLotId: string; quantity: number }> = [];

    for (const item of items) {
      const quantityPerUnit = Number(item.quantity);
      const totalRequired = Number(
        ((litersPlanned / Number(productSpec.standard_milk_amount)) * quantityPerUnit).toFixed(4),
      );

      const { data: lots, error } = await this.supabaseService.admin
        .from('supply_lots')
        .select('*')
        .eq('supply_item_id', item.supply_item_id as string)
        .in('status', [SUPPLY_LOT_STATUS.AVAILABLE, SUPPLY_LOT_STATUS.PARTIALLY_USED])
        .order('expiration_date', { ascending: true, nullsFirst: false })
        .order('entry_date', { ascending: true });

      if (error) {
        throw new BadRequestException(error.message);
      }

      let remaining = totalRequired;

      for (const lot of lots ?? []) {
        if (remaining <= 0) {
          break;
        }

        if (lot.expiration_date) {
          const expDateStr = String(lot.expiration_date).split('T')[0];
          const todayStr = new Date().toISOString().split('T')[0];
          if (expDateStr < todayStr) {
            continue;
          }
        }

        const available = Number(lot.available_quantity);
        if (available <= 0) {
          continue;
        }

        const used = Math.min(available, remaining);
        consumptions.push({
          supplyLotId: String(lot.id),
          quantity: used,
        });
        remaining -= used;
      }

      if (remaining > 0) {
        throw new BadRequestException(
          `Not enough supply lots available for item ${String(item.supply_item_id)}`,
        );
      }
    }

    return consumptions;
  }

  private async getDefaultFinishedProductLocationId() {
    const { data, error } = await this.supabaseService.admin
      .from('stock_locations')
      .select('id')
      .eq('stock_type', 'Produto Acabado')
      .eq('active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new BadRequestException(error.message);
    }

    if (!data?.id) {
      throw new BadRequestException('No active finished product stock location found');
    }

    return data.id as string;
  }
}
