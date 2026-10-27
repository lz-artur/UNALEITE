import {
  BadRequestException,
  ForbiddenException,
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
import { UsersService } from '../users/users.service';
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
  source?: 'Disponivel' | 'Devolucao';
  quantity: number;
  pieces?: number;
};

type ResolvedFinishedProductConsumption = {
  finishedProductLotId: string;
  source?: 'Disponivel' | 'Devolucao';
  quantity: number;
  pieces?: number;
};

@Injectable()
export class ProductionService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly domainRulesService: DomainRulesService,
    private readonly usersService?: UsersService,
  ) {}

  private actor(user?: AuthenticatedUser) {
    return {
      id: user?.id ?? null,
      name: user?.email?.trim() || 'Sistema',
    };
  }

  private rpcOrder(result: any) {
    return result?.order ?? result;
  }

  private async logOperationFailure(input: {
    orderId?: string;
    milkLotId?: string;
    action: string;
    message: string;
    user?: AuthenticatedUser;
  }) {
    const actor = this.actor(input.user);
    try {
      await this.supabaseService.admin.from('production_events').insert({
        production_order_id: input.orderId ?? null,
        milk_lot_id: input.milkLotId ?? null,
        event_type: 'operation_failed',
        title: 'Operação não concluída',
        description: `Não foi possível ${input.action}: ${input.message}`,
        actor_id: actor.id,
        actor_name: actor.name,
        metadata: { action: input.action },
      });
    } catch {
      // A operação principal deve manter sua mensagem original mesmo se o
      // registro visual da falha também estiver indisponível.
    }
  }

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
      const source = consumption.source ?? 'Disponivel';
      
      if (consumption.finishedProductLotId) {
        resolved.push({
          finishedProductLotId: consumption.finishedProductLotId,
          ...(consumption.source ? { source } : {}),
          quantity: consumption.quantity,
          ...(consumption.pieces != null ? { pieces: consumption.pieces } : {}),
        });
        continue;
      }

      if (!consumption.finishedProductId) {
        throw new BadRequestException('Informe o produto acabado a ser consumido.');
      }

      const { data: lots, error } = await this.supabaseService.admin
        .from('finished_product_lots')
        .select('id, available_quantity, returned_quantity')
        .eq('product_id', consumption.finishedProductId)
        .gt(source === 'Devolucao' ? 'returned_quantity' : 'available_quantity', 0)
        .order('produced_at', { ascending: true })
        .order('created_at', { ascending: true })
        .order('id', { ascending: true });

      if (error) {
        throw new BadRequestException(error.message);
      }

      let remaining = consumption.quantity;
      for (const lot of lots ?? []) {
        if (remaining <= 0) break;
        const balance = source === 'Devolucao' ? Number(lot.returned_quantity) : Number(lot.available_quantity);
        const quantity = Math.min(balance, remaining);
        resolved.push({
          finishedProductLotId: String(lot.id),
          ...(consumption.source ? { source } : {}),
          quantity,
        });
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

    if (error) throw new BadRequestException(error.message);

    return data;
  }

  async createOrder(payload: CreateProductionOrderDto, user?: AuthenticatedUser) {
    const milkLot = payload.milkLotId ? await this.getById('milk_lots', payload.milkLotId) : null;
    const product = await this.getById('finished_products', payload.productId);

    if (!product.active) {
      throw new BadRequestException('Finished product is inactive');
    }

    const isSecondary = (payload.productionType ?? product.production_type) === 'Secundario';
    let order: any;
    let expectedYield: number | null = null;
    let fatAdjustment: number | null = null;

    if (isSecondary) {
      const hasSupplies = Boolean(payload.supplyConsumptions && payload.supplyConsumptions.length > 0);
      const hasFinished = Boolean(payload.finishedProductConsumptions && payload.finishedProductConsumptions.length > 0);
      if (!hasSupplies && !hasFinished) {
        throw new BadRequestException('Para produção secundária, informe ao menos uma matéria-prima ou coproduto a ser consumido.');
      }

      const orderNumber = `OP-${new Date().getFullYear()}-${Date.now()}`;
      const actor = this.actor(user);

      const { data: newOrder, error: createError } = await this.supabaseService.admin
        .from('production_orders')
        .insert({
          order_number: orderNumber,
          product_id: payload.productId,
          milk_lot_id: null,
          liters_planned: 0,
          expected_yield: null,
          fat_adjustment_kg: null,
          status: PRODUCTION_ORDER_STATUS.IN_PROGRESS,
          production_type: 'Secundario',
          commercial_presentation: payload.commercialPresentation ?? product.commercial_presentation ?? null,
          package_size: payload.packageSize ?? product.package_size ?? null,
          started_at: new Date().toISOString(),
          created_by: actor.id,
          updated_by: actor.id,
        })
        .select('*')
        .single();

      if (createError) {
        await this.logOperationFailure({
          action: 'criar a OP secundária',
          message: createError.message,
          user,
        });
        throw new BadRequestException(createError.message);
      }

      order = newOrder;

      await this.supabaseService.admin.from('production_events').insert({
        production_order_id: order.id,
        event_type: 'order_created',
        title: 'OP secundária criada',
        description: `Ordem de produção secundária ${orderNumber} iniciada para ${product.name}.`,
        actor_id: actor.id,
        actor_name: actor.name,
        before_state: {},
        after_state: { status: 'Em Andamento', productionType: 'Secundario' },
        metadata: { orderNumber, productId: product.id },
      });
    } else {
      if (!payload.milkLotId || !milkLot) {
        throw new BadRequestException('Informe o lote de leite para produtos primários.');
      }
      if (!payload.litersToUse || payload.litersToUse <= 0) {
        throw new BadRequestException('Informe o volume de leite a ser utilizado.');
      }

      const productSpec = await this.getActiveProductSpec(payload.productId);
      const analysis = milkLot.latest_analysis_id
        ? await this.getById('milk_lot_analyses', String(milkLot.latest_analysis_id))
        : null;

      if (!([MILK_LOT_STATUS.APPROVED, MILK_LOT_STATUS.PARTIALLY_USED] as string[]).includes(String(milkLot.status))) {
        throw new BadRequestException('Milk lot is not available for production');
      }

      if (Number(milkLot.available_volume_liters) < payload.litersToUse) {
        throw new BadRequestException('Milk lot does not have enough available volume');
      }

      expectedYield = this.domainRulesService.calculateExpectedYield(
        payload.litersToUse,
        Number(product.theoretical_yield),
      );
      fatAdjustment = this.domainRulesService.calculateFatAdjustment(
        payload.litersToUse,
        analysis?.gordura as number | undefined,
        productSpec?.ideal_fat as number | undefined,
      );
      const orderNumber = `OP-${new Date().getFullYear()}-${Date.now()}`;

      const actor = this.actor(user);
      const { data: reservationResult, error } = await this.supabaseService.admin.rpc(
        'create_production_order_with_milk_reservation',
        {
          p_order_number: orderNumber,
          p_milk_lot_id: payload.milkLotId,
          p_product_id: payload.productId,
          p_liters: payload.litersToUse,
          p_expected_yield: expectedYield,
          p_fat_adjustment_kg: fatAdjustment,
          p_unit_cost: milkLot.cost_per_liter,
          p_actor_id: actor.id,
          p_actor_name: actor.name,
        },
      );

      if (error) {
        await this.logOperationFailure({
          milkLotId: payload.milkLotId,
          action: 'criar a OP e reservar o leite',
          message: error.message,
          user,
        });
        throw new BadRequestException(error.message);
      }
      order = this.rpcOrder(reservationResult);
    }

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
        const sourceProduct = await this.getById('finished_products', String(productLot.product_id));
        const tracksPieces = Boolean(sourceProduct.tracks_quantity_and_weight ?? sourceProduct.tracks_pieces);
        if (tracksPieces && (!consumption.finishedProductLotId || !Number.isInteger(consumption.pieces) || Number(consumption.pieces) <= 0)) {
          throw new BadRequestException('Informe lote e peças para consumir este produto acabado.');
        }
        if (!tracksPieces && consumption.pieces != null) throw new BadRequestException('Este produto não controla peças e peso.');
        const balanceField = consumption.source === 'Devolucao' ? 'returned_quantity' : 'available_quantity';
        const nextBalance = Number(productLot[balanceField]) - consumption.quantity;

        if (nextBalance < 0) {
          throw new BadRequestException(`Finished product lot ${productLot.lot_code} would become negative`);
        }

        await this.supabaseService.admin.from('production_order_finished_product_consumptions').insert({
          production_order_id: order.id,
          finished_product_lot_id: consumption.finishedProductLotId,
          quantity_consumed: consumption.quantity,
          pieces_consumed: tracksPieces ? consumption.pieces : null,
          ...(consumption.source ? { consumption_source: consumption.source } : {}),
          created_by: user?.id ?? null,
          updated_by: user?.id ?? null,
        });

        await this.supabaseService.admin
          .from('finished_product_lots')
          .update({
          [balanceField]: nextBalance,
          ...(tracksPieces ? { available_pieces: Number(productLot.available_pieces) - Number(consumption.pieces) } : {}),
            updated_by: user?.id ?? null,
          })
          .eq('id', consumption.finishedProductLotId);

        await this.supabaseService.admin.from('stock_movements').insert({
          movement_type: 'saida',
          lot_type: 'Produto Acabado',
          lot_id: consumption.finishedProductLotId,
          quantity: consumption.quantity,
          pieces_quantity: tracksPieces ? consumption.pieces : null,
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
        product.sale_price != null && expectedYield != null ? expectedYield * Number(product.sale_price) : null,
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

    const milkLot = order.milk_lot_id ? await this.getById('milk_lots', String(order.milk_lot_id)) : null;
    const product = await this.getById('finished_products', String(order.product_id));
    const tracksPieces = Boolean(product.tracks_quantity_and_weight ?? product.tracks_pieces);
    if (tracksPieces && (!Number.isInteger(payload.actualPiecesProduced) || Number(payload.actualPiecesProduced) <= 0)) {
      throw new BadRequestException('Informe a quantidade de peças produzidas para finalizar a OP deste produto');
    }
    if (!tracksPieces && payload.actualPiecesProduced != null) {
      throw new BadRequestException('Este produto não está configurado para controle de peças e peso');
    }
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
        .select('finished_product_lot_id, quantity_consumed, consumption_source')
        .eq('production_order_id', orderId);

      if (existingFPConsumptions && existingFPConsumptions.length > 0) {
        finishedProductConsumptions = existingFPConsumptions.map(c => ({
          finishedProductLotId: c.finished_product_lot_id,
          source: c.consumption_source === 'Devolucao' ? 'Devolucao' : 'Disponivel',
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
        const availableQuantity = Number(productLot[consumption.source === 'Devolucao' ? 'returned_quantity' : 'available_quantity']);

        if (availableQuantity < consumption.quantity) {
          throw new BadRequestException(`Finished product lot ${productLot.lot_code} has insufficient stock`);
        }
      }
    }

    // Desabilitado temporariamente para inserção de dados retroativos
    // if (new Date(milkLot.received_at) > new Date()) {
    //   throw new BadRequestException('Milk lot received date is invalid');
    // }

    // O leite já foi reservado na abertura da OP. A finalização apenas converte
    // essa reserva em consumo, sem uma segunda baixa no saldo do lote.
    const actualYield = order.liters_planned && Number(order.liters_planned) > 0 && payload.actualQuantityProduced > 0
      ? Number((Number(order.liters_planned) / payload.actualQuantityProduced).toFixed(3))
      : null;
    const actor = this.actor(user);
    const { data: completionResult, error: orderError } = await this.supabaseService.admin.rpc(
      'complete_production_order_milk_reservation',
      {
        p_order_id: orderId,
        p_actual_quantity: payload.actualQuantityProduced,
        p_actual_yield: actualYield,
        p_actor_id: actor.id,
        p_actor_name: actor.name,
      },
    );

    if (orderError) {
      await this.logOperationFailure({
        orderId,
        milkLotId: String(order.milk_lot_id),
        action: 'finalizar a OP',
        message: orderError.message,
        user,
      });
      throw new BadRequestException(orderError.message);
    }
    const completedOrder = this.rpcOrder(completionResult);

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
        .select('finished_product_lot_id, quantity_consumed, consumption_source')
        .eq('production_order_id', orderId);

      if (oldFPConsumptions && oldFPConsumptions.length > 0) {
        for (const sc of oldFPConsumptions) {
          const { data: productLot } = await this.supabaseService.admin
            .from('finished_product_lots')
            .select('available_quantity, returned_quantity')
            .eq('id', sc.finished_product_lot_id)
            .single();

          if (productLot) {
            const balanceField = sc.consumption_source === 'Devolucao' ? 'returned_quantity' : 'available_quantity';
            const restoredVolume = Number(productLot[balanceField]) + Number(sc.quantity_consumed);
            await this.supabaseService.admin
              .from('finished_product_lots')
              .update({ [balanceField]: restoredVolume })
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
        const balanceField = consumption.source === 'Devolucao' ? 'returned_quantity' : 'available_quantity';
        const nextAvailable = Number(productLot[balanceField]) - consumption.quantity;

        if (nextAvailable < 0) {
          throw new BadRequestException(`Finished product lot ${productLot.lot_code} would become negative`);
        }

        await this.supabaseService.admin.from('production_order_finished_product_consumptions').insert({
          production_order_id: orderId,
          finished_product_lot_id: consumption.finishedProductLotId,
          quantity_consumed: consumption.quantity,
          ...(consumption.source ? { consumption_source: consumption.source } : {}),
          created_by: user?.id ?? null,
          updated_by: user?.id ?? null,
        });

        await this.supabaseService.admin
          .from('finished_product_lots')
          .update({
            [balanceField]: nextAvailable,
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
    const commercialPresentation = payload.commercialPresentation ?? product.commercial_presentation ?? order.commercial_presentation ?? null;
    const commercialUnits = payload.actualCommercialUnitsProduced ?? null;

    const { data: productLot, error: productLotError } = await this.supabaseService.admin
      .from('finished_product_lots')
      .insert({
        product_id: product.id,
        production_order_id: orderId,
        lot_code: finishedProductLotCode,
        quantity_produced: payload.actualQuantityProduced,
        available_quantity: payload.actualQuantityProduced,
        quantity_pieces: payload.actualPiecesProduced ?? null,
        available_pieces: payload.actualPiecesProduced ?? null,
        commercial_units: commercialUnits,
        available_commercial_units: commercialUnits,
        commercial_presentation: commercialPresentation,
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

    if (payload.actualCommercialUnitsProduced != null || payload.commercialPresentation || payload.packageSize) {
      await this.supabaseService.admin
        .from('production_orders')
        .update({
          commercial_units_produced: payload.actualCommercialUnitsProduced ?? null,
          commercial_presentation: commercialPresentation,
          package_size: payload.packageSize ?? product.package_size ?? null,
        })
        .eq('id', orderId);
    }

    const movements: any[] = [];
    if (milkLot && Number(order.liters_planned) > 0) {
      movements.push({
        movement_type: 'saida',
        lot_type: 'Leite',
        lot_id: milkLot.id,
        quantity: Number(order.liters_planned),
        reference_table: 'production_orders',
        reference_id: orderId,
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      });
    }
    movements.push({
      movement_type: 'entrada',
      lot_type: 'Produto Acabado',
      lot_id: productLot.id,
      quantity: payload.actualQuantityProduced,
      pieces_quantity: payload.actualPiecesProduced ?? null,
      reference_table: 'production_orders',
      reference_id: orderId,
      created_by: user?.id ?? null,
      updated_by: user?.id ?? null,
    });

    await this.supabaseService.admin.from('stock_movements').insert(movements);

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

  private sameFinishedProductConsumptions(
    requested: FinishedProductConsumptionInput[],
    existing: FinishedProductConsumptionInput[],
  ): boolean {
    const totals = (rows: FinishedProductConsumptionInput[]) => {
      const grouped = new Map<string, { quantity: number; pieces: number }>();
      for (const row of rows) {
        if (!row.finishedProductLotId) return null;
        const key = `${row.finishedProductLotId}:${row.source ?? 'Disponivel'}`;
        const previous = grouped.get(key) ?? { quantity: 0, pieces: 0 };
        grouped.set(key, {
          quantity: Number((previous.quantity + row.quantity).toFixed(4)),
          pieces: previous.pieces + (row.pieces ?? 0),
        });
      }
      return JSON.stringify([...grouped].sort(([a], [b]) => a.localeCompare(b)));
    };
    const requestedTotals = totals(requested);
    return requestedTotals !== null && requestedTotals === totals(existing);
  }

  /** Keep existing lot allocations; only allocate and move the edited difference. */
  private async updateSupplyConsumptions(
    orderId: string,
    consumptions: SupplyConsumptionInput[],
    user?: AuthenticatedUser,
  ) {
    const { data: existing, error } = await this.supabaseService.admin
      .from('production_order_supply_consumptions')
      .select('id, supply_lot_id, quantity_consumed, supply_lots(supply_item_id)')
      .eq('production_order_id', orderId);
    if (error) throw new BadRequestException(error.message);

    const oldByLot = new Map<string, number>();
    const itemByLot = new Map<string, string>();
    for (const row of existing ?? []) {
      oldByLot.set(row.supply_lot_id, Number(((oldByLot.get(row.supply_lot_id) ?? 0) + Number(row.quantity_consumed)).toFixed(4)));
      const joinedLot: any = Array.isArray(row.supply_lots) ? row.supply_lots[0] : row.supply_lots;
      if (joinedLot?.supply_item_id) itemByLot.set(row.supply_lot_id, joinedLot.supply_item_id);
    }

    // Aggregate repeated rows before allocating, so the same balance is never reused.
    const requested = new Map<string, SupplyConsumptionInput>();
    for (const consumption of consumptions) {
      const key = consumption.supplyItemId ? `item:${consumption.supplyItemId}` : `lot:${consumption.supplyLotId}`;
      const previous = requested.get(key);
      requested.set(key, { ...consumption, quantity: Number(((previous?.quantity ?? 0) + consumption.quantity).toFixed(4)) });
    }

    const targetByLot = new Map<string, number>();
    // Explicit lot requests take priority over aggregated item requests.
    const requests = [...requested.values()].sort((a, b) => Number(Boolean(a.supplyItemId)) - Number(Boolean(b.supplyItemId)));
    for (const consumption of requests) {
      if (!consumption.supplyItemId) {
        const resolved = await this.resolveSupplyConsumptions([consumption], user);
        for (const row of resolved) {
          targetByLot.set(row.supplyLotId, Number(((targetByLot.get(row.supplyLotId) ?? 0) + row.quantity).toFixed(4)));
        }
        continue;
      }

      let remaining = consumption.quantity;
      for (const [lotId, oldQuantity] of oldByLot) {
        if (itemByLot.get(lotId) !== consumption.supplyItemId || remaining <= 0) continue;
        const retained = Math.min(Math.max(oldQuantity - (targetByLot.get(lotId) ?? 0), 0), remaining);
        if (retained <= 0) continue;
        targetByLot.set(lotId, Number(((targetByLot.get(lotId) ?? 0) + retained).toFixed(4)));
        remaining = Number((remaining - retained).toFixed(4));
      }
      if (remaining <= 0) continue;

      const { data: lots, error: lotsError } = await this.supabaseService.admin
        .from('supply_lots')
        .select('id, available_quantity')
        .eq('supply_item_id', consumption.supplyItemId)
        .in('status', [SUPPLY_LOT_STATUS.AVAILABLE, SUPPLY_LOT_STATUS.PARTIALLY_USED])
        .gt('available_quantity', 0)
        .order('entry_date', { ascending: true })
        .order('created_at', { ascending: true })
        .order('id', { ascending: true });
      if (lotsError) throw new BadRequestException(lotsError.message);
      for (const lot of lots ?? []) {
        if (remaining <= 0) break;
        const alreadyAllocated = Math.max((targetByLot.get(lot.id) ?? 0) - (oldByLot.get(lot.id) ?? 0), 0);
        const quantity = Math.min(Math.max(Number(lot.available_quantity) - alreadyAllocated, 0), remaining);
        if (quantity <= 0) continue;
        targetByLot.set(lot.id, Number(((targetByLot.get(lot.id) ?? 0) + quantity).toFixed(4)));
        remaining = Number((remaining - quantity).toFixed(4));
      }
      if (remaining > 0) {
        throw new BadRequestException('O insumo selecionado não possui saldo disponível suficiente.');
      }
    }

    let hasChanges = false;
    // Validate every difference before changing any consumption or stock balance.
    for (const lotId of new Set([...oldByLot.keys(), ...targetByLot.keys()])) {
      const quantity = targetByLot.get(lotId) ?? 0;
      const delta = Number((quantity - (oldByLot.get(lotId) ?? 0)).toFixed(4));
      if (delta === 0) continue;
      const lot = await this.getById('supply_lots', lotId);
      if (Number(lot.available_quantity) - delta < 0) {
        throw new BadRequestException(`O lote de insumo ${lot.internal_lot_code} não possui saldo disponível suficiente.`);
      }
      hasChanges = true;
    }

    // Apply all balances and movements atomically, rechecking stock under row locks.
    if (hasChanges) {
      const { error: updateError } = await this.supabaseService.admin.rpc(
        'update_production_order_supply_consumptions',
        {
          p_order_id: orderId,
          p_consumptions: [...targetByLot].map(([supplyLotId, quantity]) => ({ supplyLotId, quantity })),
          p_expected_consumptions: [...oldByLot].map(([supplyLotId, quantity]) => ({ supplyLotId, quantity })),
          p_actor_id: user?.id ?? null,
        },
      );
      if (updateError) throw new BadRequestException(updateError.message);
    }
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

    const isSecondary = order.production_type === 'Secundario' || !order.milk_lot_id;
    if (payload.commercialUnitsProduced != null) {
      updateData.commercial_units_produced = payload.commercialUnitsProduced;
    }
    if (payload.commercialPresentation !== undefined) {
      updateData.commercial_presentation = payload.commercialPresentation;
    }
    if (payload.packageSize !== undefined) {
      updateData.package_size = payload.packageSize;
    }

    const nextLitersPlanned = payload.litersToUse ?? Number(order.liters_planned ?? 0);
    const isMilkLotChanging =
      payload.milkLotId != null && payload.milkLotId !== String(order.milk_lot_id);

    if (isMilkLotChanging) {
      if (order.status !== PRODUCTION_ORDER_STATUS.IN_PROGRESS) {
        throw new BadRequestException('Não é possível alterar o lote de leite de uma OP finalizada.');
      }
    }

    if (payload.actualQuantityProduced != null) {
      updateData.actual_quantity_produced = payload.actualQuantityProduced;
      updateData.actual_yield = nextLitersPlanned > 0
        ? Number((nextLitersPlanned / payload.actualQuantityProduced).toFixed(3))
        : null;
    }

    if (!isSecondary && order.status === PRODUCTION_ORDER_STATUS.IN_PROGRESS && (isMilkLotChanging || payload.litersToUse != null)) {
      const product = await this.getById('finished_products', String(order.product_id));
      const expectedYield = this.domainRulesService.calculateExpectedYield(
        nextLitersPlanned,
        Number(product.theoretical_yield),
      );
      const actor = this.actor(user);
      const { error: reservationError } = await this.supabaseService.admin.rpc(
        'update_production_order_milk_reservation',
        {
          p_order_id: orderId,
          p_new_milk_lot_id: payload.milkLotId ?? String(order.milk_lot_id),
          p_new_liters: nextLitersPlanned,
          p_expected_yield: expectedYield,
          p_actor_id: actor.id,
          p_actor_name: actor.name,
        },
      );

      if (reservationError) {
        await this.logOperationFailure({
          orderId,
          milkLotId: payload.milkLotId ?? String(order.milk_lot_id),
          action: 'alterar a reserva de leite',
          message: reservationError.message,
          user,
        });
        throw new BadRequestException(reservationError.message);
      }
    }

    if (payload.supplyConsumptions !== undefined) {
      await this.updateSupplyConsumptions(orderId, payload.supplyConsumptions, user);
    }

    if (payload.finishedProductConsumptions !== undefined) {
      const { data: oldFPConsumptions, error: oldFPError } = await this.supabaseService.admin
        .from('production_order_finished_product_consumptions')
        .select('finished_product_lot_id, quantity_consumed, consumption_source, pieces_consumed')
        .eq('production_order_id', orderId);
      if (oldFPError) throw new BadRequestException(oldFPError.message);
      const unchanged = this.sameFinishedProductConsumptions(
        payload.finishedProductConsumptions,
        (oldFPConsumptions ?? []).map((row) => ({
          finishedProductLotId: row.finished_product_lot_id,
          source: row.consumption_source ?? 'Disponivel',
          quantity: Number(row.quantity_consumed),
          pieces: row.pieces_consumed == null ? undefined : Number(row.pieces_consumed),
        })),
      );
      if (!unchanged) {
        const finishedProductConsumptions = await this.resolveFinishedProductConsumptions(payload.finishedProductConsumptions);

        if (oldFPConsumptions && oldFPConsumptions.length > 0) {
          for (const sc of oldFPConsumptions) {
            const { data: productLot } = await this.supabaseService.admin
              .from('finished_product_lots')
              .select('available_quantity, returned_quantity')
              .eq('id', sc.finished_product_lot_id)
              .single();

            if (productLot) {
              const balanceField = sc.consumption_source === 'Devolucao' ? 'returned_quantity' : 'available_quantity';
              const restoredVolume = Number(productLot[balanceField]) + Number(sc.quantity_consumed);
              await this.supabaseService.admin
                .from('finished_product_lots')
                .update({ [balanceField]: restoredVolume })
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
            .select('available_quantity, returned_quantity, lot_code, product_id, available_pieces')
            .eq('id', consumption.finishedProductLotId)
            .single();

          if (!productLot) {
            throw new BadRequestException(`Finished product lot not found: ${consumption.finishedProductLotId}`);
          }

          const sourceProduct = await this.getById('finished_products', String(productLot.product_id));
          const tracksPieces = Boolean(sourceProduct.tracks_quantity_and_weight ?? sourceProduct.tracks_pieces);

          if (tracksPieces && (!consumption.finishedProductLotId || !Number.isInteger(consumption.pieces) || Number(consumption.pieces) <= 0)) {
            throw new BadRequestException('Informe lote e peças para consumir este produto acabado.');
          }
          if (!tracksPieces && consumption.pieces != null) throw new BadRequestException('Este produto não controla peças e peso.');

          const balanceField = consumption.source === 'Devolucao' ? 'returned_quantity' : 'available_quantity';
          const nextAvailable = Number(productLot[balanceField]) - consumption.quantity;
          if (nextAvailable < 0) {
            throw new BadRequestException(`Finished product lot ${productLot.lot_code} would become negative`);
          }

          await this.supabaseService.admin.from('production_order_finished_product_consumptions').insert({
            production_order_id: orderId,
            finished_product_lot_id: consumption.finishedProductLotId,
            quantity_consumed: consumption.quantity,
            pieces_consumed: tracksPieces ? consumption.pieces : null,
            ...(consumption.source ? { consumption_source: consumption.source } : {}),
            created_by: user?.id ?? null,
            updated_by: user?.id ?? null,
          });

          await this.supabaseService.admin
            .from('finished_product_lots')
            .update({
              [balanceField]: nextAvailable,
              ...(tracksPieces ? { available_pieces: Number(productLot.available_pieces) - Number(consumption.pieces) } : {}),
              updated_by: user?.id ?? null,
            })
            .eq('id', consumption.finishedProductLotId);

          await this.supabaseService.admin.from('stock_movements').insert({
            movement_type: 'saida',
            lot_type: 'Produto Acabado',
            lot_id: consumption.finishedProductLotId,
            quantity: consumption.quantity,
            pieces_quantity: tracksPieces ? consumption.pieces : null,
            reference_table: 'production_orders',
            reference_id: orderId,
            created_by: user?.id ?? null,
            updated_by: user?.id ?? null,
          });
        }
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

  async listEvents(orderId: string) {
    await this.getById('production_orders', orderId);
    const { data, error } = await this.supabaseService.admin
      .from('production_events')
      .select('*')
      .eq('production_order_id', orderId)
      .order('created_at', { ascending: false });

    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  async listMilkLotReconciliation() {
    const [lotsResult, consumptionsResult, eventsResult, exclusionsResult] = await Promise.all([
      this.supabaseService.admin
        .from('milk_lots')
        .select('id, code, volume_liters, available_volume_liters, status, updated_at')
        .order('code', { ascending: true }),
      this.supabaseService.admin
        .from('production_order_milk_consumptions')
        .select('milk_lot_id, production_order_id, liters_consumed, state'),
      this.supabaseService.admin
        .from('production_events')
        .select('milk_lot_id, created_at')
        .order('created_at', { ascending: false }),
      this.supabaseService.admin
        .from('milk_lot_reconciliation_exclusions')
        .select('milk_lot_id, reason')
        .eq('active', true),
    ]);

    if (lotsResult.error) throw new BadRequestException(lotsResult.error.message);
    if (consumptionsResult.error) throw new BadRequestException(consumptionsResult.error.message);
    if (eventsResult.error) throw new BadRequestException(eventsResult.error.message);
    if (exclusionsResult.error) throw new BadRequestException(exclusionsResult.error.message);

    const consumptionsByLot = new Map<string, any[]>();
    for (const consumption of consumptionsResult.data ?? []) {
      const entries = consumptionsByLot.get(String(consumption.milk_lot_id)) ?? [];
      entries.push(consumption);
      consumptionsByLot.set(String(consumption.milk_lot_id), entries);
    }

    const lastEventByLot = new Map<string, string>();
    for (const event of eventsResult.data ?? []) {
      const lotId = String(event.milk_lot_id ?? '');
      if (lotId && !lastEventByLot.has(lotId)) lastEventByLot.set(lotId, String(event.created_at));
    }

    const exclusionsByLot = new Map(
      (exclusionsResult.data ?? []).map((exclusion) => [
        String(exclusion.milk_lot_id),
        String(exclusion.reason),
      ]),
    );

    return (lotsResult.data ?? []).map((lot) => {
      const consumptions = consumptionsByLot.get(String(lot.id)) ?? [];
      const activeConsumptions = consumptions.filter((item) => item.state !== 'Estornado');
      const reservedLiters = activeConsumptions
        .filter((item) => item.state === 'Reservado')
        .reduce((sum, item) => sum + Number(item.liters_consumed), 0);
      const consumedLiters = activeConsumptions
        .filter((item) => item.state === 'Consumido')
        .reduce((sum, item) => sum + Number(item.liters_consumed), 0);
      const expectedAvailableLiters = Math.max(0, Number(lot.volume_liters) - reservedLiters - consumedLiters);
      const recordedAvailableLiters = Number(lot.available_volume_liters);
      const differenceLiters = Number((recordedAvailableLiters - expectedAvailableLiters).toFixed(4));
      const exclusionReason = exclusionsByLot.get(String(lot.id));

      return {
        milkLotId: lot.id,
        code: lot.code,
        status: lot.status,
        originalVolumeLiters: Number(lot.volume_liters),
        recordedAvailableLiters,
        expectedAvailableLiters,
        differenceLiters,
        situation: exclusionReason
          ? 'Desconsiderado'
          : Math.abs(differenceLiters) < 0.0001
            ? 'Conciliado'
            : 'Divergente',
        exclusionReason: exclusionReason ?? null,
        responsibleProductionOrderIds: activeConsumptions.map((item) => item.production_order_id),
        lastKnownChangeAt: lastEventByLot.get(String(lot.id)) ?? lot.updated_at ?? null,
      };
    });
  }

  async getCancellationPreview(id: string, user?: AuthenticatedUser) {
    const { data: order, error: orderError } = await this.supabaseService.admin
      .from('production_orders')
      .select('*, finished_products(name, code)')
      .eq('id', id)
      .maybeSingle();

    if (orderError) throw new BadRequestException(orderError.message);
    if (!order) throw new NotFoundException('Ordem de produção não encontrada');

    const productName = Array.isArray(order.finished_products)
      ? order.finished_products[0]?.name
      : order.finished_products?.name ?? 'Produto';

    if (order.status === 'Cancelada') {
      return {
        canCancel: false,
        blockReason: 'Esta ordem de produção já se encontra cancelada.',
        order: {
          id: order.id,
          orderCode: order.order_code,
          status: order.status,
          productName,
        },
        reversals: {
          milk: [],
          supplies: [],
          reprocessedLots: [],
          generatedLotsToVoid: [],
        },
      };
    }

    if (order.status !== 'Em Andamento' && order.status !== 'Finalizada') {
      return {
        canCancel: false,
        blockReason: `O status atual da OP (${order.status}) não permite cancelamento.`,
        order: {
          id: order.id,
          orderCode: order.order_code,
          status: order.status,
          productName,
        },
        reversals: {
          milk: [],
          supplies: [],
          reprocessedLots: [],
          generatedLotsToVoid: [],
        },
      };
    }

    let isAuthorizedAdmin = true;
    if (order.status === 'Finalizada') {
      if (this.usersService && user) {
        try {
          const appUser = await this.usersService.ensureAppUser(user);
          isAuthorizedAdmin = appUser.role === 'admin' || user.role === 'admin';
        } catch {
          isAuthorizedAdmin = user.role === 'admin';
        }
      } else {
        isAuthorizedAdmin = user?.role === 'admin';
      }
    }

    if (order.status === 'Finalizada' && !isAuthorizedAdmin) {
      return {
        canCancel: false,
        blockReason: 'Apenas administradores possuem autorização para cancelar ordens de produção já finalizadas.',
        order: {
          id: order.id,
          orderCode: order.order_code,
          status: order.status,
          productName,
        },
        reversals: {
          milk: [],
          supplies: [],
          reprocessedLots: [],
          generatedLotsToVoid: [],
        },
      };
    }

    // 1. Milk consumptions
    const { data: milkConsumptions } = await this.supabaseService.admin
      .from('production_order_milk_consumptions')
      .select('liters_consumed, state, milk_lots(internal_lot_code)')
      .eq('production_order_id', id);

    const activeMilk = (milkConsumptions ?? [])
      .filter((c: any) => c.state === 'Reservado' || c.state === 'Consumido')
      .map((c: any) => ({
        lotCode: Array.isArray(c.milk_lots) ? c.milk_lots[0]?.internal_lot_code : c.milk_lots?.internal_lot_code ?? 'Lote de Leite',
        liters: Number(c.liters_consumed),
      }));

    // 2. Supply consumptions
    const { data: supplyConsumptions } = await this.supabaseService.admin
      .from('production_order_supply_consumptions')
      .select('quantity_consumed, supply_lots(internal_lot_code, supply_items(name, code, units(symbol)))')
      .eq('production_order_id', id);

    const supplies = (supplyConsumptions ?? []).map((c: any) => {
      const lot = Array.isArray(c.supply_lots) ? c.supply_lots[0] : c.supply_lots;
      const item = Array.isArray(lot?.supply_items) ? lot?.supply_items[0] : lot?.supply_items;
      const unit = Array.isArray(item?.units) ? item?.units[0] : item?.units;
      return {
        lotCode: lot?.internal_lot_code ?? 'Lote Insumo',
        supplyName: item?.name ?? 'Insumo',
        quantity: Number(c.quantity_consumed),
        unitSymbol: unit?.symbol ?? 'un',
      };
    });

    // 3. Finished product consumptions (reprocessing)
    const { data: finishedConsumptions } = await this.supabaseService.admin
      .from('production_order_finished_product_consumptions')
      .select('quantity_consumed, pieces_consumed, finished_product_lots(lot_code, finished_products(name))')
      .eq('production_order_id', id);

    const reprocessedLots = (finishedConsumptions ?? []).map((c: any) => {
      const lot = Array.isArray(c.finished_product_lots) ? c.finished_product_lots[0] : c.finished_product_lots;
      const prod = Array.isArray(lot?.finished_products) ? lot?.finished_products[0] : lot?.finished_products;
      return {
        lotCode: lot?.lot_code ?? 'Lote',
        productName: prod?.name ?? 'Produto Acabado',
        quantity: Number(c.quantity_consumed),
        pieces: c.pieces_consumed != null ? Number(c.pieces_consumed) : null,
      };
    });

    // 4. Generated lots
    const { data: generatedLots } = await this.supabaseService.admin
      .from('finished_product_lots')
      .select('id, lot_code, quantity_produced, available_quantity, quantity_pieces, available_pieces, finished_products(name)')
      .eq('production_order_id', id);

    const generatedLotsToVoid = (generatedLots ?? []).map((lot: any) => {
      const prod = Array.isArray(lot.finished_products) ? lot.finished_products[0] : lot.finished_products;
      return {
        id: lot.id,
        lotCode: lot.lot_code,
        productName: prod?.name ?? 'Produto Produzido',
        quantityProduced: Number(lot.quantity_produced),
        availableQuantity: Number(lot.available_quantity),
        quantityPieces: lot.quantity_pieces != null ? Number(lot.quantity_pieces) : null,
        availablePieces: lot.available_pieces != null ? Number(lot.available_pieces) : null,
      };
    });

    // Check blockers for generated lots if OP was completed / has lots
    let blockReason: string | null = null;
    for (const lot of generatedLotsToVoid) {
      if (lot.availableQuantity < lot.quantityProduced) {
        blockReason = `O lote ${lot.lotCode} (${lot.productName}) já teve ${(lot.quantityProduced - lot.availableQuantity).toFixed(2)} kg consumidos ou expedidos. Não é possível cancelar a OP automaticamente.`;
        break;
      }
      if (lot.quantityPieces != null && (lot.availablePieces ?? 0) < lot.quantityPieces) {
        blockReason = `O lote ${lot.lotCode} (${lot.productName}) já teve ${lot.quantityPieces - (lot.availablePieces ?? 0)} peças expedidas. Não é possível cancelar a OP automaticamente.`;
        break;
      }

      // Check sales fulfillments
      const { count: salesCount } = await this.supabaseService.admin
        .from('sales_order_fulfillments')
        .select('*', { count: 'exact', head: true })
        .eq('finished_product_lot_id', lot.id);

      if ((salesCount ?? 0) > 0) {
        blockReason = `O lote ${lot.lotCode} (${lot.productName}) possui ${salesCount} atendimento(s) de venda vinculado(s). Não é possível cancelar a OP.`;
        break;
      }

      // Check consumptions in other OPs
      const { count: consumptionCount } = await this.supabaseService.admin
        .from('production_order_finished_product_consumptions')
        .select('*', { count: 'exact', head: true })
        .eq('finished_product_lot_id', lot.id);

      if ((consumptionCount ?? 0) > 0) {
        blockReason = `O lote ${lot.lotCode} (${lot.productName}) já foi consumido em outra ordem de produção. Não é possível cancelar a OP.`;
        break;
      }

      // Check manual exits
      const { count: manualExitCount } = await this.supabaseService.admin
        .from('finished_product_manual_exits')
        .select('*', { count: 'exact', head: true })
        .eq('finished_product_lot_id', lot.id);

      if ((manualExitCount ?? 0) > 0) {
        blockReason = `O lote ${lot.lotCode} (${lot.productName}) possui saída manual de estoque registrada. Não é possível cancelar a OP.`;
        break;
      }

      // Check expired disposals
      const { count: disposalCount } = await this.supabaseService.admin
        .from('expired_lot_disposals')
        .select('*', { count: 'exact', head: true })
        .eq('lot_id', lot.id);

      if ((disposalCount ?? 0) > 0) {
        blockReason = `O lote ${lot.lotCode} (${lot.productName}) possui baixa de vencimento registrada. Não é possível cancelar a OP.`;
        break;
      }
    }

    return {
      canCancel: blockReason === null,
      blockReason,
      order: {
        id: order.id,
        orderCode: order.order_code,
        status: order.status,
        productName,
      },
      reversals: {
        milk: activeMilk,
        supplies,
        reprocessedLots,
        generatedLotsToVoid,
      },
    };
  }

  async cancelOrder(id: string, reason: string, user?: AuthenticatedUser) {
    if (!reason || reason.trim().length < 3) {
      throw new BadRequestException('Informe obrigatoriamente o motivo do cancelamento (mínimo 3 caracteres)');
    }

    const { data: order, error: orderError } = await this.supabaseService.admin
      .from('production_orders')
      .select('id, status')
      .eq('id', id)
      .maybeSingle();

    if (orderError) throw new BadRequestException(orderError.message);
    if (!order) throw new NotFoundException('Ordem de produção não encontrada');

    if (order.status === 'Finalizada') {
      let isAdmin = false;
      if (this.usersService && user) {
        try {
          const appUser = await this.usersService.ensureAppUser(user);
          isAdmin = appUser.role === 'admin' || user.role === 'admin';
        } catch {
          isAdmin = user.role === 'admin';
        }
      } else {
        isAdmin = user?.role === 'admin';
      }

      if (!isAdmin) {
        await this.logOperationFailure({
          orderId: id,
          action: 'cancelar OP finalizada',
          message: 'Apenas administradores podem cancelar ordens de produção finalizadas.',
          user,
        });
        throw new ForbiddenException('Apenas administradores podem cancelar ordens de produção finalizadas.');
      }
    }

    const actor = this.actor(user);
    const { data, error } = await this.supabaseService.admin.rpc(
      'cancel_production_order_administrative',
      {
        p_order_id: id,
        p_reason: reason.trim(),
        p_actor_id: actor.id,
        p_actor_name: actor.name,
      },
    );

    if (error) {
      await this.logOperationFailure({
        orderId: id,
        action: 'cancelar a OP',
        message: error.message,
        user,
      });
      throw new BadRequestException(error.message);
    }
    return { success: true, order: this.rpcOrder(data?.order ?? data) };
  }
}
