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
import { UpdateProductionOrderDto } from './dto/update-production-order.dto';
import { AdjustProductionOrderDto } from './dto/adjust-production-order.dto';

type SupplyConsumptionInput = {
  supplyLotId?: string;
  supplyItemId?: string;
  quantity: number;
};

type ResolvedSupplyConsumption = {
  supplyLotId: string;
  quantity: number;
};

type FinishedProductConsumptionInput = {
  finishedProductLotId?: string;
  finishedProductId?: string;
  quantity: number;
};

type ResolvedFinishedProductConsumption = {
  finishedProductLotId: string;
  quantity: number;
};

@Injectable()
export class ProductionService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly domainRulesService: DomainRulesService,
  ) {}

  private async resolveSupplyLotId(virtualOrRealId: string, quantity: number, user?: AuthenticatedUser): Promise<string> {
    if (virtualOrRealId.startsWith('virtual-lot-')) {
      const supplyItemId = virtualOrRealId.replace('virtual-lot-', '');
      
      const { data: existingLot } = await this.supabaseService.admin
        .from('supply_lots')
        .select('id')
        .eq('supply_item_id', supplyItemId)
        .eq('internal_lot_code', 'ESTOQUE INICIAL')
        .limit(1)
        .maybeSingle();

      if (existingLot) return existingLot.id as string;

      const { data: supplyItem } = await this.supabaseService.admin
        .from('supply_items')
        .select('current_stock, default_supplier_id')
        .eq('id', supplyItemId)
        .single();

      const { data: newLot } = await this.supabaseService.admin
        .from('supply_lots')
        .insert({
          supply_item_id: supplyItemId,
          internal_lot_code: 'ESTOQUE INICIAL',
          entry_date: new Date().toISOString(),
          received_quantity: supplyItem?.current_stock ?? quantity,
          available_quantity: supplyItem?.current_stock ?? quantity,
          unit_cost: 0,
          total_value: 0,
          status: SUPPLY_LOT_STATUS.AVAILABLE,
          supplier_id: supplyItem?.default_supplier_id ?? null,
          created_by: user?.id ?? null,
          updated_by: user?.id ?? null,
        })
        .select('id')
        .single();

      return newLot!.id as string;
    }
    return virtualOrRealId;
  }

  /** Expands one aggregated insumo consumption into its oldest available lots (FIFO). */
  private async resolveSupplyConsumptions(
    consumptions: SupplyConsumptionInput[],
    user?: AuthenticatedUser,
  ): Promise<ResolvedSupplyConsumption[]> {
    const resolved: ResolvedSupplyConsumption[] = [];

    for (const consumption of consumptions) {
      if (!consumption.supplyItemId) {
        if (!consumption.supplyLotId) {
          throw new BadRequestException('Informe o insumo a ser consumido.');
        }
        resolved.push({
          supplyLotId: await this.resolveSupplyLotId(consumption.supplyLotId, consumption.quantity, user),
          quantity: consumption.quantity,
        });
        continue;
      }

      const { data: lots, error } = await this.supabaseService.admin
        .from('supply_lots')
        .select('id, available_quantity')
        .eq('supply_item_id', consumption.supplyItemId)
        .in('status', [SUPPLY_LOT_STATUS.AVAILABLE, SUPPLY_LOT_STATUS.PARTIALLY_USED])
        .gt('available_quantity', 0)
        .order('entry_date', { ascending: true })
        .order('created_at', { ascending: true })
        .order('id', { ascending: true });

      if (error) {
        throw new BadRequestException(error.message);
      }

      let remaining = consumption.quantity;
      for (const lot of lots ?? []) {
        if (remaining <= 0) break;
        const quantity = Math.min(Number(lot.available_quantity), remaining);
        resolved.push({ supplyLotId: String(lot.id), quantity });
        remaining = Number((remaining - quantity).toFixed(4));
      }

      if (remaining > 0) {
        throw new BadRequestException('O insumo selecionado não possui saldo disponível suficiente.');
      }
    }

    return resolved;
  }

  /** Expands one aggregated finished-product consumption into its oldest produced lots (FIFO). */
  private async resolveFinishedProductConsumptions(
    consumptions: FinishedProductConsumptionInput[],
  ): Promise<ResolvedFinishedProductConsumption[]> {
    const resolved: ResolvedFinishedProductConsumption[] = [];

    for (const consumption of consumptions) {
      if (!consumption.finishedProductId) {
        if (!consumption.finishedProductLotId) {
          throw new BadRequestException('Informe o produto acabado a ser consumido.');
        }
        resolved.push({ finishedProductLotId: consumption.finishedProductLotId, quantity: consumption.quantity });
        continue;
      }

      const { data: lots, error } = await this.supabaseService.admin
        .from('finished_product_lots')
        .select('id, available_quantity')
        .eq('product_id', consumption.finishedProductId)
        .gt('available_quantity', 0)
        .order('produced_at', { ascending: true })
        .order('created_at', { ascending: true })
        .order('id', { ascending: true });

      if (error) {
        throw new BadRequestException(error.message);
      }

      let remaining = consumption.quantity;
      for (const lot of lots ?? []) {
        if (remaining <= 0) break;
        const quantity = Math.min(Number(lot.available_quantity), remaining);
        resolved.push({ finishedProductLotId: String(lot.id), quantity });
        remaining = Number((remaining - quantity).toFixed(4));
      }

      if (remaining > 0) {
        throw new BadRequestException('O produto acabado selecionado não possui saldo disponível suficiente.');
      }
    }

    return resolved;
  }

  async listOrders() {
    const { data, error } = await this.supabaseService.admin
      .from('production_orders')
      .select('*, production_order_supply_consumptions(*, supply_lots(supply_item_id)), production_order_finished_product_consumptions(*, finished_product_lots(product_id))')
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
      // A consumption must retain the amount actually paid for the milk at the
      // time the production order was opened.  Editing the reception later must
      // never rewrite the cost of a completed production.
      unit_cost: milkLot.cost_per_liter,
      created_by: user?.id ?? null,
      updated_by: user?.id ?? null,
    });

    if (payload.supplyConsumptions?.length) {
      const supplyConsumptions = await this.resolveSupplyConsumptions(payload.supplyConsumptions, user);
      for (const consumption of supplyConsumptions) {
        const supplyLot = await this.getById('supply_lots', consumption.supplyLotId);
        const nextAvailable = Number(supplyLot.available_quantity) - consumption.quantity;

        if (nextAvailable < 0) {
          throw new BadRequestException(`Supply lot ${supplyLot.internal_lot_code} would become negative`);
        }

        const nextStatus =
          nextAvailable <= 0 ? SUPPLY_LOT_STATUS.USED : SUPPLY_LOT_STATUS.PARTIALLY_USED;

        await this.supabaseService.admin.from('production_order_supply_consumptions').insert({
          production_order_id: order.id,
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

        await this.supabaseService.admin.from('stock_movements').insert({
          movement_type: 'saida',
          lot_type: 'Insumo',
          lot_id: consumption.supplyLotId,
          quantity: consumption.quantity,
          reference_table: 'production_orders',
          reference_id: order.id,
          created_by: user?.id ?? null,
          updated_by: user?.id ?? null,
        });
      }
    }

    if (payload.finishedProductConsumptions?.length) {
      const finishedProductConsumptions = await this.resolveFinishedProductConsumptions(payload.finishedProductConsumptions);
      for (const consumption of finishedProductConsumptions) {
        const productLot = await this.getById('finished_product_lots', consumption.finishedProductLotId);
        const nextAvailable = Number(productLot.available_quantity) - consumption.quantity;

        if (nextAvailable < 0) {
          throw new BadRequestException(`Finished product lot ${productLot.lot_code} would become negative`);
        }

        await this.supabaseService.admin.from('production_order_finished_product_consumptions').insert({
          production_order_id: order.id,
          finished_product_lot_id: consumption.finishedProductLotId,
          quantity_consumed: consumption.quantity,
          created_by: user?.id ?? null,
          updated_by: user?.id ?? null,
        });

        await this.supabaseService.admin
          .from('finished_product_lots')
          .update({
            available_quantity: nextAvailable,
            updated_by: user?.id ?? null,
          })
          .eq('id', consumption.finishedProductLotId);

        await this.supabaseService.admin.from('stock_movements').insert({
          movement_type: 'saida',
          lot_type: 'Produto Acabado',
          lot_id: consumption.finishedProductLotId,
          quantity: consumption.quantity,
          reference_table: 'production_orders',
          reference_id: order.id,
          created_by: user?.id ?? null,
          updated_by: user?.id ?? null,
        });
      }
    }

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

    let supplyConsumptions = payload.supplyConsumptions;
    let deductStockForConsumptions = false;
    
    if (!supplyConsumptions?.length) {
      const { data: existingConsumptions } = await this.supabaseService.admin
        .from('production_order_supply_consumptions')
        .select('supply_lot_id, quantity_consumed')
        .eq('production_order_id', orderId);

      if (existingConsumptions && existingConsumptions.length > 0) {
        supplyConsumptions = existingConsumptions.map(c => ({
          supplyLotId: c.supply_lot_id,
          quantity: c.quantity_consumed,
        }));
      } else {
        supplyConsumptions = await this.buildFifoConsumptions(productSpec, Number(order.liters_planned));
        deductStockForConsumptions = true;
      }
    } else {
      deductStockForConsumptions = true;
    }

    const resolvedSupplyConsumptions = deductStockForConsumptions && supplyConsumptions
      ? await this.resolveSupplyConsumptions(supplyConsumptions, user)
      : [];

    let finishedProductConsumptions = payload.finishedProductConsumptions;
    let deductStockForFPConsumptions = false;

    if (!finishedProductConsumptions?.length) {
      const { data: existingFPConsumptions } = await this.supabaseService.admin
        .from('production_order_finished_product_consumptions')
        .select('finished_product_lot_id, quantity_consumed')
        .eq('production_order_id', orderId);

      if (existingFPConsumptions && existingFPConsumptions.length > 0) {
        finishedProductConsumptions = existingFPConsumptions.map(c => ({
          finishedProductLotId: c.finished_product_lot_id,
          quantity: c.quantity_consumed,
        }));
      } else {
        finishedProductConsumptions = await this.buildFifoFinishedProductConsumptions(productSpec, Number(order.liters_planned));
        deductStockForFPConsumptions = true;
      }
    } else {
      deductStockForFPConsumptions = true;
    }

    const resolvedFinishedProductConsumptions = deductStockForFPConsumptions && finishedProductConsumptions
      ? await this.resolveFinishedProductConsumptions(finishedProductConsumptions)
      : [];

    if (deductStockForConsumptions) {
      for (const consumption of resolvedSupplyConsumptions) {
        const supplyLot = await this.getById('supply_lots', consumption.supplyLotId);
        const availableQuantity = Number(supplyLot.available_quantity);
        // Desabilitado temporariamente para inserção de dados retroativos
        // const isExpired =
        //   supplyLot.expiration_date != null &&
        //   (supplyLot.expiration_date && String(supplyLot.expiration_date).split('T')[0] < new Date().toISOString().split('T')[0]);

        if (
          ([SUPPLY_LOT_STATUS.BLOCKED, SUPPLY_LOT_STATUS.USED] as string[]).includes(String(supplyLot.status))
          // || isExpired
        ) {
          throw new BadRequestException(`Supply lot ${supplyLot.internal_lot_code} is unavailable`);
        }

        if (availableQuantity < consumption.quantity) {
          throw new BadRequestException(`Supply lot ${supplyLot.internal_lot_code} has insufficient stock`);
        }
      }
    }

    if (deductStockForFPConsumptions && resolvedFinishedProductConsumptions.length > 0) {
      for (const consumption of resolvedFinishedProductConsumptions) {
        const productLot = await this.getById('finished_product_lots', consumption.finishedProductLotId);
        const availableQuantity = Number(productLot.available_quantity);

        if (availableQuantity < consumption.quantity) {
          throw new BadRequestException(`Finished product lot ${productLot.lot_code} has insufficient stock`);
        }
      }
    }

    // Desabilitado temporariamente para inserção de dados retroativos
    // if (new Date(milkLot.received_at) > new Date()) {
    //   throw new BadRequestException('Milk lot received date is invalid');
    // }

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

    if (deductStockForConsumptions && resolvedSupplyConsumptions.length > 0) {
      // Restore previous consumptions to avoid double deduction
      const { data: oldConsumptions } = await this.supabaseService.admin
        .from('production_order_supply_consumptions')
        .select('supply_lot_id, quantity_consumed')
        .eq('production_order_id', orderId);

      if (oldConsumptions && oldConsumptions.length > 0) {
        for (const sc of oldConsumptions) {
          const { data: supplyLot } = await this.supabaseService.admin
            .from('supply_lots')
            .select('available_quantity, received_quantity, supply_item_id')
            .eq('id', sc.supply_lot_id)
            .single();

          if (supplyLot) {
            const restoredVolume = Number(supplyLot.available_quantity) + Number(sc.quantity_consumed);
            const newStatus = restoredVolume >= supplyLot.received_quantity ? SUPPLY_LOT_STATUS.AVAILABLE : SUPPLY_LOT_STATUS.PARTIALLY_USED;
            await this.supabaseService.admin
              .from('supply_lots')
              .update({ available_quantity: restoredVolume, status: newStatus })
              .eq('id', sc.supply_lot_id);

            const { data: supplyItem } = await this.supabaseService.admin
              .from('supply_items')
              .select('current_stock')
              .eq('id', supplyLot.supply_item_id)
              .single();
            
            if (supplyItem) {
              await this.supabaseService.admin
                .from('supply_items')
                .update({ current_stock: Number(supplyItem.current_stock) + Number(sc.quantity_consumed) })
                .eq('id', supplyLot.supply_item_id);
            }
          }
        }
      }

      await this.supabaseService.admin
        .from('production_order_supply_consumptions')
        .delete()
        .eq('production_order_id', orderId);

      for (const consumption of resolvedSupplyConsumptions) {
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

        await this.supabaseService.admin.from('stock_movements').insert({
          movement_type: 'saida',
          lot_type: 'Insumo',
          lot_id: consumption.supplyLotId,
          quantity: consumption.quantity,
          reference_table: 'production_orders',
          reference_id: orderId,
          created_by: user?.id ?? null,
          updated_by: user?.id ?? null,
        });
      }
    }

    if (deductStockForFPConsumptions && resolvedFinishedProductConsumptions.length > 0) {
      const { data: oldFPConsumptions } = await this.supabaseService.admin
        .from('production_order_finished_product_consumptions')
        .select('finished_product_lot_id, quantity_consumed')
        .eq('production_order_id', orderId);

      if (oldFPConsumptions && oldFPConsumptions.length > 0) {
        for (const sc of oldFPConsumptions) {
          const { data: productLot } = await this.supabaseService.admin
            .from('finished_product_lots')
            .select('available_quantity')
            .eq('id', sc.finished_product_lot_id)
            .single();

          if (productLot) {
            const restoredVolume = Number(productLot.available_quantity) + Number(sc.quantity_consumed);
            await this.supabaseService.admin
              .from('finished_product_lots')
              .update({ available_quantity: restoredVolume })
              .eq('id', sc.finished_product_lot_id);
          }
        }
      }

      await this.supabaseService.admin
        .from('production_order_finished_product_consumptions')
        .delete()
        .eq('production_order_id', orderId);

      for (const consumption of resolvedFinishedProductConsumptions) {
        const productLot = await this.getById('finished_product_lots', consumption.finishedProductLotId);
        const nextAvailable = Number(productLot.available_quantity) - consumption.quantity;

        if (nextAvailable < 0) {
          throw new BadRequestException(`Finished product lot ${productLot.lot_code} would become negative`);
        }

        await this.supabaseService.admin.from('production_order_finished_product_consumptions').insert({
          production_order_id: orderId,
          finished_product_lot_id: consumption.finishedProductLotId,
          quantity_consumed: consumption.quantity,
          created_by: user?.id ?? null,
          updated_by: user?.id ?? null,
        });

        await this.supabaseService.admin
          .from('finished_product_lots')
          .update({
            available_quantity: nextAvailable,
            updated_by: user?.id ?? null,
          })
          .eq('id', consumption.finishedProductLotId);

        await this.supabaseService.admin.from('stock_movements').insert({
          movement_type: 'saida',
          lot_type: 'Produto Acabado',
          lot_id: consumption.finishedProductLotId,
          quantity: consumption.quantity,
          reference_table: 'production_orders',
          reference_id: orderId,
          created_by: user?.id ?? null,
          updated_by: user?.id ?? null,
        });
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

    if (payload.generatedCoProducts?.length) {
      for (const coProduct of payload.generatedCoProducts) {
        const coProductRecord = await this.getById('finished_products', coProduct.productId);
        const coExpirationDate = new Date();
        coExpirationDate.setDate(coExpirationDate.getDate() + Number(coProductRecord.shelf_life_days));

        const coLotCode = `CP-${new Date().getFullYear()}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const { data: coProductLot, error: coProductLotError } = await this.supabaseService.admin
          .from('finished_product_lots')
          .insert({
            product_id: coProduct.productId,
            production_order_id: orderId,
            lot_code: coLotCode,
            quantity_produced: coProduct.quantity,
            available_quantity: coProduct.quantity,
            produced_at: new Date().toISOString(),
            expiration_date: coExpirationDate.toISOString(),
            storage_location_id: await this.getDefaultFinishedProductLocationId(),
            created_by: user?.id ?? null,
            updated_by: user?.id ?? null,
          })
          .select('*')
          .single();

        if (coProductLotError) {
          throw new BadRequestException(coProductLotError.message);
        }

        await this.supabaseService.admin.from('stock_movements').insert([
          {
            movement_type: 'entrada',
            lot_type: 'Produto Acabado',
            lot_id: coProductLot.id,
            quantity: coProduct.quantity,
            reference_table: 'production_orders',
            reference_id: orderId,
            created_by: user?.id ?? null,
            updated_by: user?.id ?? null,
          }
        ]);
      }
    }

    return {
      order: completedOrder,
      productLot,
      supplyConsumptions: deductStockForConsumptions ? resolvedSupplyConsumptions : supplyConsumptions,
    };
  }

  async updateOrder(
    orderId: string,
    payload: UpdateProductionOrderDto,
    user?: AuthenticatedUser,
  ) {
    const order = await this.getById('production_orders', orderId);
    
    const updateData: any = {
      updated_by: user?.id ?? null,
    };

    const nextLitersPlanned = payload.litersToUse ?? Number(order.liters_planned);
    const isMilkLotChanging =
      payload.milkLotId != null && payload.milkLotId !== String(order.milk_lot_id);

    if (isMilkLotChanging) {
      if (order.status !== PRODUCTION_ORDER_STATUS.IN_PROGRESS) {
        throw new BadRequestException('Não é possível alterar o lote de leite de uma OP finalizada.');
      }

      const milkLot = await this.getById('milk_lots', payload.milkLotId!);
      if (!([MILK_LOT_STATUS.APPROVED, MILK_LOT_STATUS.PARTIALLY_USED] as string[]).includes(String(milkLot.status))) {
        throw new BadRequestException('O lote de leite selecionado não está disponível para produção.');
      }
      if (Number(milkLot.available_volume_liters) < nextLitersPlanned) {
        throw new BadRequestException('O lote de leite selecionado não possui volume disponível suficiente.');
      }

      updateData.milk_lot_id = payload.milkLotId;
    }

    if (payload.actualQuantityProduced != null) {
      updateData.actual_quantity_produced = payload.actualQuantityProduced;
      updateData.actual_yield = Number((Number(order.liters_planned) / payload.actualQuantityProduced).toFixed(3));
    }

    if (payload.litersToUse != null && order.status === PRODUCTION_ORDER_STATUS.IN_PROGRESS) {
      updateData.liters_planned = payload.litersToUse;
      const product = await this.getById('finished_products', String(order.product_id));
      const expectedYield = this.domainRulesService.calculateExpectedYield(
        payload.litersToUse,
        Number(product.theoretical_yield),
      );
      updateData.expected_yield = expectedYield;
    }

    // A tabela de consumos é a trilha de rastreabilidade da OP. Ela é criada
    // junto com a ordem e deve acompanhar qualquer alteração feita antes da
    // finalização, inclusive a troca de lote.
    if (order.status === PRODUCTION_ORDER_STATUS.IN_PROGRESS && (isMilkLotChanging || payload.litersToUse != null)) {
      const milkLotId = payload.milkLotId ?? String(order.milk_lot_id);
      const milkLot = isMilkLotChanging
        ? await this.getById('milk_lots', milkLotId)
        : await this.getById('milk_lots', String(order.milk_lot_id));
      const { error: milkConsumptionError } = await this.supabaseService.admin
        .from('production_order_milk_consumptions')
        .update({
          milk_lot_id: milkLotId,
          liters_consumed: nextLitersPlanned,
          unit_cost: milkLot.cost_per_liter,
          updated_by: user?.id ?? null,
        })
        .eq('production_order_id', orderId);

      if (milkConsumptionError) {
        throw new BadRequestException(milkConsumptionError.message);
      }
    }

    if (payload.supplyConsumptions !== undefined) {
      const supplyConsumptions = await this.resolveSupplyConsumptions(payload.supplyConsumptions, user);
      const { data: oldConsumptions } = await this.supabaseService.admin
        .from('production_order_supply_consumptions')
        .select('supply_lot_id, quantity_consumed')
        .eq('production_order_id', orderId);

      if (oldConsumptions && oldConsumptions.length > 0) {
        for (const sc of oldConsumptions) {
          const { data: supplyLot } = await this.supabaseService.admin
            .from('supply_lots')
            .select('available_quantity, received_quantity, supply_item_id')
            .eq('id', sc.supply_lot_id)
            .single();

          if (supplyLot) {
            const restoredVolume = Number(supplyLot.available_quantity) + Number(sc.quantity_consumed);
            const newStatus = restoredVolume >= supplyLot.received_quantity ? SUPPLY_LOT_STATUS.AVAILABLE : SUPPLY_LOT_STATUS.PARTIALLY_USED;
            await this.supabaseService.admin
              .from('supply_lots')
              .update({ available_quantity: restoredVolume, status: newStatus })
              .eq('id', sc.supply_lot_id);

            const { data: supplyItem } = await this.supabaseService.admin
              .from('supply_items')
              .select('current_stock')
              .eq('id', supplyLot.supply_item_id)
              .single();
            
            if (supplyItem) {
              await this.supabaseService.admin
                .from('supply_items')
                .update({ current_stock: Number(supplyItem.current_stock) + Number(sc.quantity_consumed) })
                .eq('id', supplyLot.supply_item_id);
            }
          }
        }
      }
      
      await this.supabaseService.admin
        .from('production_order_supply_consumptions')
        .delete()
        .eq('production_order_id', orderId);

      for (const consumption of supplyConsumptions) {
        const { data: supplyLot } = await this.supabaseService.admin
          .from('supply_lots')
          .select('available_quantity, supply_item_id, internal_lot_code')
          .eq('id', consumption.supplyLotId)
          .single();

        if (!supplyLot) {
          throw new BadRequestException(`Supply lot not found: ${consumption.supplyLotId}`);
        }

        const nextAvailable = Number(supplyLot.available_quantity) - consumption.quantity;
        if (nextAvailable < 0) {
          throw new BadRequestException(`Supply lot ${supplyLot.internal_lot_code} would become negative`);
        }
        const nextStatus = nextAvailable <= 0 ? SUPPLY_LOT_STATUS.USED : SUPPLY_LOT_STATUS.PARTIALLY_USED;

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
          .select('current_stock')
          .eq('id', supplyLot.supply_item_id)
          .single();

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

        await this.supabaseService.admin.from('stock_movements').insert({
          movement_type: 'saida',
          lot_type: 'Insumo',
          lot_id: consumption.supplyLotId,
          quantity: consumption.quantity,
          reference_table: 'production_orders',
          reference_id: orderId,
          created_by: user?.id ?? null,
          updated_by: user?.id ?? null,
        });
      }
    }

    if (payload.finishedProductConsumptions !== undefined) {
      const finishedProductConsumptions = await this.resolveFinishedProductConsumptions(payload.finishedProductConsumptions);
      const { data: oldFPConsumptions } = await this.supabaseService.admin
        .from('production_order_finished_product_consumptions')
        .select('finished_product_lot_id, quantity_consumed')
        .eq('production_order_id', orderId);

      if (oldFPConsumptions && oldFPConsumptions.length > 0) {
        for (const sc of oldFPConsumptions) {
          const { data: productLot } = await this.supabaseService.admin
            .from('finished_product_lots')
            .select('available_quantity')
            .eq('id', sc.finished_product_lot_id)
            .single();

          if (productLot) {
            const restoredVolume = Number(productLot.available_quantity) + Number(sc.quantity_consumed);
            await this.supabaseService.admin
              .from('finished_product_lots')
              .update({ available_quantity: restoredVolume })
              .eq('id', sc.finished_product_lot_id);
          }
        }
      }

      await this.supabaseService.admin
        .from('production_order_finished_product_consumptions')
        .delete()
        .eq('production_order_id', orderId);

      for (const consumption of finishedProductConsumptions) {
        const { data: productLot } = await this.supabaseService.admin
          .from('finished_product_lots')
          .select('available_quantity, lot_code')
          .eq('id', consumption.finishedProductLotId)
          .single();

        if (!productLot) {
          throw new BadRequestException(`Finished product lot not found: ${consumption.finishedProductLotId}`);
        }

        const nextAvailable = Number(productLot.available_quantity) - consumption.quantity;
        if (nextAvailable < 0) {
          throw new BadRequestException(`Finished product lot ${productLot.lot_code} would become negative`);
        }

        await this.supabaseService.admin.from('production_order_finished_product_consumptions').insert({
          production_order_id: orderId,
          finished_product_lot_id: consumption.finishedProductLotId,
          quantity_consumed: consumption.quantity,
          created_by: user?.id ?? null,
          updated_by: user?.id ?? null,
        });

        await this.supabaseService.admin
          .from('finished_product_lots')
          .update({
            available_quantity: nextAvailable,
            updated_by: user?.id ?? null,
          })
          .eq('id', consumption.finishedProductLotId);

        await this.supabaseService.admin.from('stock_movements').insert({
          movement_type: 'saida',
          lot_type: 'Produto Acabado',
          lot_id: consumption.finishedProductLotId,
          quantity: consumption.quantity,
          reference_table: 'production_orders',
          reference_id: orderId,
          created_by: user?.id ?? null,
          updated_by: user?.id ?? null,
        });
      }
    }

    const { data: updatedOrder, error: orderError } = await this.supabaseService.admin
      .from('production_orders')
      .update(updateData)
      .eq('id', orderId)
      .select('*')
      .single();

    if (orderError) {
      throw new BadRequestException(orderError.message);
    }

    if (payload.actualQuantityProduced != null && order.status === PRODUCTION_ORDER_STATUS.FINISHED) {
      const { data: productLot } = await this.supabaseService.admin
        .from('finished_product_lots')
        .select('id, available_quantity, quantity_produced')
        .eq('production_order_id', orderId)
        .maybeSingle();

      if (productLot) {
        const difference = payload.actualQuantityProduced - Number(productLot.quantity_produced);
        const newAvailable = Number(productLot.available_quantity) + difference;

        await this.supabaseService.admin
          .from('finished_product_lots')
          .update({
            quantity_produced: payload.actualQuantityProduced,
            available_quantity: newAvailable >= 0 ? newAvailable : 0,
            updated_by: user?.id ?? null,
          })
          .eq('id', productLot.id);
      }
    }

    return { order: updatedOrder };
  }

  async adjustOrder(
    orderId: string,
    payload: AdjustProductionOrderDto,
    user?: AuthenticatedUser,
  ) {
    const order = await this.getById('production_orders', orderId);

    if (order.status !== PRODUCTION_ORDER_STATUS.FINISHED) {
      throw new BadRequestException('Somente Ordens de Produção finalizadas podem ser ajustadas.');
    }

    // Process each adjustment (main product and/or co-products)
    for (const adjustment of payload.adjustments) {
      const { data: productLot } = await this.supabaseService.admin
        .from('finished_product_lots')
        .select('*')
        .eq('id', adjustment.finishedProductLotId)
        .eq('production_order_id', orderId)
        .single();

      if (!productLot) {
        throw new BadRequestException(`Lote de produto acabado não encontrado para esta OP: ${adjustment.finishedProductLotId}`);
      }

      const oldQuantity = Number(productLot.quantity_produced);
      const newQuantity = Number(adjustment.newQuantity);
      const difference = newQuantity - oldQuantity;
      const newAvailable = Number(productLot.available_quantity) + difference;

      if (newAvailable < 0) {
        throw new BadRequestException(
          'A nova quantidade produzida não suporta as movimentações já realizadas no lote. Estoque ficaria negativo.',
        );
      }

      // Update the lot
      await this.supabaseService.admin
        .from('finished_product_lots')
        .update({
          quantity_produced: newQuantity,
          available_quantity: newAvailable,
          updated_by: user?.id ?? null,
        })
        .eq('id', adjustment.finishedProductLotId);

      // If it is the main product lot, update the production_order actual_quantity_produced
      if (productLot.product_id === order.product_id) {
        const newActualYield = Number((Number(order.liters_planned) / newQuantity).toFixed(3));
        await this.supabaseService.admin
          .from('production_orders')
          .update({
            actual_quantity_produced: newQuantity,
            actual_yield: newActualYield,
            updated_by: user?.id ?? null,
          })
          .eq('id', orderId);
      }

      // Insert into the adjustments log table
      await this.supabaseService.admin
        .from('production_order_adjustments')
        .insert({
          production_order_id: orderId,
          finished_product_lot_id: adjustment.finishedProductLotId,
          old_quantity: oldQuantity,
          new_quantity: newQuantity,
          reason: payload.reason,
          notes: payload.notes,
          created_by: user?.id ?? null,
        });

      // Insert stock movement for the difference
      if (difference !== 0) {
        // Find existing adjustment record to use as reference
        const { data: adjRecord } = await this.supabaseService.admin
          .from('production_order_adjustments')
          .select('id')
          .eq('production_order_id', orderId)
          .eq('finished_product_lot_id', adjustment.finishedProductLotId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        await this.supabaseService.admin.from('stock_movements').insert({
          movement_type: difference > 0 ? 'entrada' : 'saida',
          lot_type: 'Produto Acabado',
          lot_id: adjustment.finishedProductLotId,
          quantity: Math.abs(difference),
          reference_table: 'production_order_adjustments',
          reference_id: adjRecord?.id ?? null,
          created_by: user?.id ?? null,
          updated_by: user?.id ?? null,
        });
      }
    }

    return { success: true };
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

  private async buildFifoConsumptions(productSpec: Record<string, unknown> | null, litersPlanned: number) {
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
        .order('entry_date', { ascending: true })
        .order('created_at', { ascending: true })
        .order('id', { ascending: true });

      if (error) {
        throw new BadRequestException(error.message);
      }

      let remaining = totalRequired;

      for (const lot of lots ?? []) {
        if (remaining <= 0) {
          break;
        }

        // Desabilitado temporariamente para inserção de dados retroativos
        // if (lot.expiration_date) {
        //   const expDateStr = String(lot.expiration_date).split('T')[0];
        //   const todayStr = new Date().toISOString().split('T')[0];
        //   if (expDateStr < todayStr) {
        //     continue;
        //   }
        // }

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

  private async buildFifoFinishedProductConsumptions(productSpec: Record<string, unknown> | null, litersPlanned: number) {
    if (!productSpec) {
      return [];
    }

    const items = (productSpec.product_spec_finished_product_items as Array<Record<string, unknown>> | undefined) ?? [];
    const consumptions: Array<{ finishedProductLotId: string; quantity: number }> = [];

    for (const item of items) {
      const quantityPerUnit = Number(item.quantity);
      const totalRequired = Number(
        ((litersPlanned / Number(productSpec.standard_milk_amount)) * quantityPerUnit).toFixed(4),
      );

      const { data: lots, error } = await this.supabaseService.admin
        .from('finished_product_lots')
        .select('*')
        .eq('product_id', item.finished_product_id as string)
        .gt('available_quantity', 0)
        .order('produced_at', { ascending: true })
        .order('created_at', { ascending: true })
        .order('id', { ascending: true });

      if (error) {
        throw new BadRequestException(error.message);
      }

      let remaining = totalRequired;

      for (const lot of lots ?? []) {
        if (remaining <= 0) {
          break;
        }

        const available = Number(lot.available_quantity);
        if (available <= 0) {
          continue;
        }

        const used = Math.min(available, remaining);
        consumptions.push({
          finishedProductLotId: String(lot.id),
          quantity: used,
        });
        remaining -= used;
      }

      if (remaining > 0) {
        throw new BadRequestException(
          `Not enough finished product lots available for item ${String(item.finished_product_id)}`,
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

  async deleteOrder(id: string) {
    const order = await this.getById('production_orders', id);

    const { data: finishedLots, error: finishedLotsError } = await this.supabaseService.admin
      .from('finished_product_lots')
      .select('id, quantity_produced, available_quantity')
      .eq('production_order_id', id);

    if (finishedLotsError) throw new BadRequestException(finishedLotsError.message);

    if (finishedLots && finishedLots.length > 0) {
      for (const lot of finishedLots) {
        if (lot.available_quantity < lot.quantity_produced) {
          throw new BadRequestException('Não é possível excluir a OP pois os produtos gerados já foram parcialmente ou totalmente vendidos.');
        }
      }
    }

    const { data: milkConsumptions, error: milkError } = await this.supabaseService.admin
      .from('production_order_milk_consumptions')
      .select('milk_lot_id, liters_consumed')
      .eq('production_order_id', id);

    if (milkError) throw new BadRequestException(milkError.message);

    if (milkConsumptions && milkConsumptions.length > 0) {
      for (const mc of milkConsumptions) {
        const { data: milkLot } = await this.supabaseService.admin
          .from('milk_lots')
          .select('available_volume_liters, volume_liters')
          .eq('id', mc.milk_lot_id)
          .single();

        if (milkLot) {
          const restoredVolume = Number(milkLot.available_volume_liters) + Number(mc.liters_consumed);
          const newStatus = restoredVolume >= milkLot.volume_liters ? MILK_LOT_STATUS.APPROVED : MILK_LOT_STATUS.PARTIALLY_USED;
          await this.supabaseService.admin
            .from('milk_lots')
            .update({ available_volume_liters: restoredVolume, status: newStatus })
            .eq('id', mc.milk_lot_id);
        }
      }
      await this.supabaseService.admin.from('production_order_milk_consumptions').delete().eq('production_order_id', id);
    }

    const { data: supplyConsumptions, error: supplyError } = await this.supabaseService.admin
      .from('production_order_supply_consumptions')
      .select('supply_lot_id, quantity_consumed')
      .eq('production_order_id', id);

    if (supplyError) throw new BadRequestException(supplyError.message);

    if (supplyConsumptions && supplyConsumptions.length > 0) {
      for (const sc of supplyConsumptions) {
        const { data: supplyLot } = await this.supabaseService.admin
          .from('supply_lots')
          .select('available_quantity, received_quantity, supply_item_id')
          .eq('id', sc.supply_lot_id)
          .single();

        if (supplyLot) {
          const restoredVolume = Number(supplyLot.available_quantity) + Number(sc.quantity_consumed);
          const newStatus = restoredVolume >= supplyLot.received_quantity ? SUPPLY_LOT_STATUS.AVAILABLE : SUPPLY_LOT_STATUS.PARTIALLY_USED;
          await this.supabaseService.admin
            .from('supply_lots')
            .update({ available_quantity: restoredVolume, status: newStatus })
            .eq('id', sc.supply_lot_id);

          const { data: supplyItem } = await this.supabaseService.admin
            .from('supply_items')
            .select('current_stock')
            .eq('id', supplyLot.supply_item_id)
            .single();
          
          if (supplyItem) {
            await this.supabaseService.admin
              .from('supply_items')
              .update({ current_stock: Number(supplyItem.current_stock) + Number(sc.quantity_consumed) })
              .eq('id', supplyLot.supply_item_id);
          }
        }
      }
      await this.supabaseService.admin.from('production_order_supply_consumptions').delete().eq('production_order_id', id);
    }

    const { data: fpConsumptions, error: fpError } = await this.supabaseService.admin
      .from('production_order_finished_product_consumptions')
      .select('finished_product_lot_id, quantity_consumed')
      .eq('production_order_id', id);

    if (fpError) throw new BadRequestException(fpError.message);

    if (fpConsumptions && fpConsumptions.length > 0) {
      for (const fpc of fpConsumptions) {
        const { data: productLot } = await this.supabaseService.admin
          .from('finished_product_lots')
          .select('available_quantity')
          .eq('id', fpc.finished_product_lot_id)
          .single();

        if (productLot) {
          const restoredVolume = Number(productLot.available_quantity) + Number(fpc.quantity_consumed);
          await this.supabaseService.admin
            .from('finished_product_lots')
            .update({ available_quantity: restoredVolume })
            .eq('id', fpc.finished_product_lot_id);
        }
      }
      await this.supabaseService.admin.from('production_order_finished_product_consumptions').delete().eq('production_order_id', id);
    }

    await this.supabaseService.admin.from('stock_movements').delete().eq('reference_table', 'production_orders').eq('reference_id', id);
    await this.supabaseService.admin.from('finished_product_lots').delete().eq('production_order_id', id);

    const { error: deleteOrderError } = await this.supabaseService.admin
      .from('production_orders')
      .delete()
      .eq('id', id);

    if (deleteOrderError) throw new BadRequestException(deleteOrderError.message);

    return { success: true };
  }
}
