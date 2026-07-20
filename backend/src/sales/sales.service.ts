import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SALES_ORDER_STATUS } from '../common/constants/domain';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ClientsService } from '../clients/clients.service';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateSalesOrderDto } from './dto/create-sales-order.dto';
import { FulfillSalesOrderDto } from './dto/fulfill-sales-order.dto';
import { ListSalesOrdersDto } from './dto/list-sales-orders.dto';

@Injectable()
export class SalesService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly clientsService: ClientsService,
  ) {}

  async listSalesOrders(filters: ListSalesOrdersDto = {}) {
    const payload = await this.loadSalesBundle();

    return payload.salesOrders
      .map((order) => this.hydrateSalesOrder(order, payload))
      .filter((order) => this.matchesFilters(order, filters))
      .sort((a, b) => b.orderDate.localeCompare(a.orderDate));
  }

  async getSalesOrder(id: string) {
    const payload = await this.loadSalesBundle();
    const order = payload.salesOrders.find((entry) => String(entry.id) === id);

    if (!order) {
      throw new NotFoundException('Pedido de venda não encontrado');
    }

    return this.hydrateSalesOrder(order, payload);
  }

  async createSalesOrder(payload: CreateSalesOrderDto, user?: AuthenticatedUser) {
    const client = await this.clientsService.getActiveClient(payload.clientId);
    const products = await this.getFinishedProducts(payload.items.map((item) => item.productId));
    const orderNumber = `VEN-${new Date(payload.orderDate).getFullYear()}-${Date.now()}`;
    const totalAmount = payload.items.reduce(
      (sum, item) => sum + Number((item.quantity * item.unitPrice).toFixed(4)),
      0,
    );
    const dueDate = payload.dueDate ?? payload.orderDate;

    const { data: salesOrder, error: salesOrderError } = await this.supabaseService.admin
      .from('sales_orders')
      .insert({
        order_number: orderNumber,
        client_id: payload.clientId,
        order_date: payload.orderDate,
        due_date: dueDate,
        delivery_date: payload.deliveryDate ?? null,
        status: SALES_ORDER_STATUS.OPEN,
        total_amount: totalAmount,
        notes: payload.notes ?? null,
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      })
      .select('*')
      .single();

    if (salesOrderError) {
      throw new BadRequestException(salesOrderError.message);
    }

    const itemsToInsert = payload.items.map((item) => {
      const product = products.find((entry) => String(entry.id) === item.productId);
      if (!product) {
        throw new BadRequestException(`Produto final ${item.productId} não encontrado`);
      }

      return {
        sales_order_id: salesOrder.id,
        product_id: item.productId,
        ordered_quantity: item.quantity,
        fulfilled_quantity: 0,
        unit_price: item.unitPrice,
        total_value: Number((item.quantity * item.unitPrice).toFixed(4)),
        status: SALES_ORDER_STATUS.OPEN,
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      };
    });

    const { error: itemsError } = await this.supabaseService.admin
      .from('sales_order_items')
      .insert(itemsToInsert);

    if (itemsError) {
      throw new BadRequestException(itemsError.message);
    }

    await this.upsertFinancialEntry(salesOrder, client, totalAmount, user);

    return this.getSalesOrder(String(salesOrder.id));
  }

  async fulfillSalesOrder(
    salesOrderId: string,
    payload: FulfillSalesOrderDto,
    user?: AuthenticatedUser,
  ) {
    const bundle = await this.loadSalesBundle();
    const salesOrder = bundle.salesOrders.find((entry) => String(entry.id) === salesOrderId);

    if (!salesOrder) {
      throw new NotFoundException('Pedido de venda não encontrado');
    }

    if (
      String(salesOrder.status) === SALES_ORDER_STATUS.FULFILLED ||
      String(salesOrder.status) === SALES_ORDER_STATUS.CANCELED
    ) {
      throw new BadRequestException('O pedido de venda não pode ser atendido');
    }

    const salesOrderItems = bundle.salesOrderItems.filter(
      (entry) => String(entry.sales_order_id) === salesOrderId,
    );
    const lots = await this.getFinishedProductLots(
      payload.items.map((item) => item.finishedProductLotId),
    );
    const itemProgress = new Map<string, number>();
    const fulfilledAt = payload.fulfilledAt ?? new Date().toISOString();

    for (const itemPayload of payload.items) {
      const salesOrderItem = salesOrderItems.find(
        (entry) => String(entry.id) === itemPayload.salesOrderItemId,
      );

      if (!salesOrderItem) {
        throw new BadRequestException(`Item do pedido de venda ${itemPayload.salesOrderItemId} não encontrado`);
      }

      const lot = lots.find((entry) => String(entry.id) === itemPayload.finishedProductLotId);

      if (!lot) {
        throw new BadRequestException(`Lote de produto acabado ${itemPayload.finishedProductLotId} não encontrado`);
      }

      if (String(lot.product_id) !== String(salesOrderItem.product_id)) {
        throw new BadRequestException('O lote do produto acabado não corresponde ao item do pedido');
      }

      // Desabilitado temporariamente para inserção de dados retroativos
      // if (lot.expiration_date) {
      //   const expDateStr = String(lot.expiration_date).split('T')[0];
      //   const todayStr = new Date().toISOString().split('T')[0];
      //   if (expDateStr < todayStr) {
      //     throw new BadRequestException(`O lote ${String(lot.lot_code)} está vencido`);
      //   }
      // }

      if (itemPayload.quantity > Number(lot.available_quantity)) {
        throw new BadRequestException(`O lote ${String(lot.lot_code)} não tem quantidade disponível suficiente`);
      }

      const alreadyPlanned = itemProgress.get(itemPayload.salesOrderItemId) ?? 0;
      const pendingQuantity =
        Number(salesOrderItem.ordered_quantity) - Number(salesOrderItem.fulfilled_quantity) - alreadyPlanned;

      if (itemPayload.quantity > pendingQuantity) {
        throw new BadRequestException(
          `A quantidade atendida do item ${itemPayload.salesOrderItemId} excede a quantidade pendente`,
        );
      }

      itemProgress.set(itemPayload.salesOrderItemId, alreadyPlanned + itemPayload.quantity);

      const { error: fulfillmentError } = await this.supabaseService.admin
        .from('sales_order_fulfillments')
        .insert({
          sales_order_id: salesOrder.id,
          sales_order_item_id: salesOrderItem.id,
          finished_product_lot_id: lot.id,
          quantity: itemPayload.quantity,
          fulfilled_at: fulfilledAt,
          created_by: user?.id ?? null,
          updated_by: user?.id ?? null,
        });

      if (fulfillmentError) {
        throw new BadRequestException(fulfillmentError.message);
      }

      const { error: lotUpdateError } = await this.supabaseService.admin
        .from('finished_product_lots')
        .update({
          available_quantity: Number(lot.available_quantity) - itemPayload.quantity,
          updated_by: user?.id ?? null,
        })
        .eq('id', lot.id);

      if (lotUpdateError) {
        throw new BadRequestException(lotUpdateError.message);
      }

      const { error: movementError } = await this.supabaseService.admin
        .from('stock_movements')
        .insert({
          movement_type: 'saida',
          lot_type: 'Produto Acabado',
          lot_id: lot.id,
          quantity: itemPayload.quantity,
          reference_table: 'sales_orders',
          reference_id: salesOrder.id,
          created_by: user?.id ?? null,
          updated_by: user?.id ?? null,
        });

      if (movementError) {
        throw new BadRequestException(movementError.message);
      }
    }

    for (const [salesOrderItemId, extraFulfilledQuantity] of itemProgress.entries()) {
      const salesOrderItem = salesOrderItems.find((entry) => String(entry.id) === salesOrderItemId);

      if (!salesOrderItem) {
        continue;
      }

      const nextFulfilledQuantity =
        Number(salesOrderItem.fulfilled_quantity) + Number(extraFulfilledQuantity);
      const nextStatus =
        nextFulfilledQuantity >= Number(salesOrderItem.ordered_quantity)
          ? SALES_ORDER_STATUS.FULFILLED
          : SALES_ORDER_STATUS.PARTIALLY_FULFILLED;

      const { error: updateItemError } = await this.supabaseService.admin
        .from('sales_order_items')
        .update({
          fulfilled_quantity: nextFulfilledQuantity,
          status: nextStatus,
          updated_by: user?.id ?? null,
        })
        .eq('id', salesOrderItem.id);

      if (updateItemError) {
        throw new BadRequestException(updateItemError.message);
      }
    }

    await this.refreshSalesOrderStatus(salesOrderId, user);

    if (payload.paymentMethod || payload.installments || payload.bankAccountId) {
      await this.supabaseService.admin
        .from('financial_entries')
        .update({
          ...(payload.paymentMethod ? { payment_method: payload.paymentMethod } : {}),
          ...(payload.installments ? { installments: payload.installments } : {}),
          ...(payload.bankAccountId ? { bank_account_id: payload.bankAccountId } : {}),
          updated_by: user?.id ?? null,
        })
        .eq('reference_table', 'sales_orders')
        .eq('reference_id', salesOrderId);
    }

    return this.getSalesOrder(salesOrderId);
  }

  private async loadSalesBundle() {
    const [salesOrders, salesOrderItems, fulfillments, clients, finishedProducts, finishedProductLots] =
      await Promise.all([
        this.selectMany('sales_orders'),
        this.selectMany('sales_order_items'),
        this.selectMany('sales_order_fulfillments'),
        this.selectMany('clients'),
        this.selectMany('finished_products'),
        this.selectMany('finished_product_lots'),
      ]);

    return {
      salesOrders,
      salesOrderItems,
      fulfillments,
      clients,
      finishedProducts,
      finishedProductLots,
    };
  }

  private hydrateSalesOrder(
    salesOrder: Record<string, unknown>,
    payload: {
      salesOrders: Array<Record<string, unknown>>;
      salesOrderItems: Array<Record<string, unknown>>;
      fulfillments: Array<Record<string, unknown>>;
      clients: Array<Record<string, unknown>>;
      finishedProducts: Array<Record<string, unknown>>;
      finishedProductLots: Array<Record<string, unknown>>;
    },
  ) {
    const client = payload.clients.find(
      (entry) => String(entry.id) === String(salesOrder.client_id),
    );
    const items = payload.salesOrderItems
      .filter((entry) => String(entry.sales_order_id) === String(salesOrder.id))
      .map((entry) => {
        const product = payload.finishedProducts.find(
          (item) => String(item.id) === String(entry.product_id),
        );
        const fulfillments = payload.fulfillments
          .filter((fulfillment) => String(fulfillment.sales_order_item_id) === String(entry.id))
          .map((fulfillment) => {
            const lot = payload.finishedProductLots.find(
              (lotEntry) => String(lotEntry.id) === String(fulfillment.finished_product_lot_id),
            );

            return {
              id: String(fulfillment.id),
              finishedProductLotId: String(fulfillment.finished_product_lot_id),
              lotCode: String(lot?.lot_code ?? '-'),
              quantity: Number(fulfillment.quantity),
              fulfilledAt: String(fulfillment.fulfilled_at),
            };
          });

        return {
          id: String(entry.id),
          productId: String(entry.product_id),
          productName: String(product?.name ?? '-'),
          unitId: product?.unit_id ? String(product.unit_id) : undefined,
          orderedQuantity: Number(entry.ordered_quantity),
          fulfilledQuantity: Number(entry.fulfilled_quantity),
          pendingQuantity: Number(entry.ordered_quantity) - Number(entry.fulfilled_quantity),
          unitPrice: Number(entry.unit_price),
          totalValue: Number(entry.total_value),
          status: String(entry.status),
          fulfillments,
        };
      })
      .sort((a, b) => a.productName.localeCompare(b.productName));

    return {
      id: String(salesOrder.id),
      number: String(salesOrder.order_number),
      clientId: String(salesOrder.client_id),
      clientName: String(client?.name ?? '-'),
      clientDocument: client?.document ? String(client.document) : '',
      orderDate: String(salesOrder.order_date),
      dueDate: String(salesOrder.due_date),
      status: String(salesOrder.status),
      totalAmount: Number(salesOrder.total_amount ?? 0),
      notes: salesOrder.notes ? String(salesOrder.notes) : '',
      items,
    };
  }

  private matchesFilters(
    salesOrder: ReturnType<SalesService['hydrateSalesOrder']>,
    filters: ListSalesOrdersDto,
  ) {
    if (filters.clientId && salesOrder.clientId !== filters.clientId) {
      return false;
    }

    if (filters.status && salesOrder.status !== filters.status) {
      return false;
    }

    if (filters.startDate && new Date(salesOrder.orderDate) < new Date(filters.startDate)) {
      return false;
    }

    if (filters.endDate) {
      const endDate = new Date(filters.endDate);
      endDate.setHours(23, 59, 59, 999);
      if (new Date(salesOrder.orderDate) > endDate) {
        return false;
      }
    }

    return true;
  }

  private async getFinishedProducts(ids: string[]) {
    const uniqueIds = Array.from(new Set(ids));
    const { data, error } = await this.supabaseService.admin
      .from('finished_products')
      .select('*')
      .in('id', uniqueIds);

    if (error) {
      throw new BadRequestException(error.message);
    }

    const inactive = (data ?? []).find((entry) => !entry.active);
    if (inactive) {
      throw new BadRequestException(`O produto final ${String(inactive.name)} está inativo`);
    }

    if ((data ?? []).length !== uniqueIds.length) {
      throw new BadRequestException('Um ou mais produtos finais não foram encontrados');
    }

    return data ?? [];
  }

  private async getFinishedProductLots(ids: string[]) {
    const uniqueIds = Array.from(new Set(ids));
    const { data, error } = await this.supabaseService.admin
      .from('finished_product_lots')
      .select('*')
      .in('id', uniqueIds);

    if (error) {
      throw new BadRequestException(error.message);
    }

    if ((data ?? []).length !== uniqueIds.length) {
      throw new BadRequestException('Um ou mais lotes de produto acabado não foram encontrados');
    }

    return data ?? [];
  }

  private async refreshSalesOrderStatus(salesOrderId: string, user?: AuthenticatedUser) {
    const { data: items, error } = await this.supabaseService.admin
      .from('sales_order_items')
      .select('*')
      .eq('sales_order_id', salesOrderId);

    if (error) {
      throw new BadRequestException(error.message);
    }

    const nextStatus = (items ?? []).every(
      (item) => Number(item.fulfilled_quantity) >= Number(item.ordered_quantity),
    )
      ? SALES_ORDER_STATUS.FULFILLED
      : (items ?? []).some((item) => Number(item.fulfilled_quantity) > 0)
        ? SALES_ORDER_STATUS.PARTIALLY_FULFILLED
        : SALES_ORDER_STATUS.OPEN;

    const { error: updateError } = await this.supabaseService.admin
      .from('sales_orders')
      .update({
        status: nextStatus,
        updated_by: user?.id ?? null,
      })
      .eq('id', salesOrderId);

    if (updateError) {
      throw new BadRequestException(updateError.message);
    }
  }

  private async upsertFinancialEntry(
    salesOrder: Record<string, unknown>,
    client: Record<string, unknown>,
    amount: number,
    user?: AuthenticatedUser,
  ) {
    const description = `Venda ${String(salesOrder.order_number)} - ${String(client.name)}`;

    const { error } = await this.supabaseService.admin.from('financial_entries').insert({
      entry_type: 'Receber',
      description,
      amount,
      due_date: salesOrder.due_date,
      status: 'Aberto',
      category: 'Vendas',
      client_id: salesOrder.client_id,
      reference_table: 'sales_orders',
      reference_id: salesOrder.id,
      created_by: user?.id ?? null,
      updated_by: user?.id ?? null,
    });

    if (error && !error.message.includes('duplicate')) {
      throw new BadRequestException(error.message);
    }
  }

  private async selectMany(table: string) {
    const { data, error } = await this.supabaseService.admin.from(table).select('*');

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data ?? [];
  }

  async deleteOrder(id: string) {
    const bundle = await this.loadSalesBundle();
    const salesOrder = bundle.salesOrders.find((entry) => String(entry.id) === id);

    if (!salesOrder) {
      throw new NotFoundException('Pedido de venda não encontrado');
    }

    const fulfillments = bundle.fulfillments.filter((f) => String(f.sales_order_id) === id);

    for (const fulfillment of fulfillments) {
      const lot = bundle.finishedProductLots.find(
        (l) => String(l.id) === String(fulfillment.finished_product_lot_id)
      );

      if (lot) {
        const restoredVolume = Number(lot.available_quantity) + Number(fulfillment.quantity);
        await this.supabaseService.admin
          .from('finished_product_lots')
          .update({ available_quantity: restoredVolume })
          .eq('id', lot.id);
      }
    }

    if (fulfillments.length > 0) {
      await this.supabaseService.admin
        .from('sales_order_fulfillments')
        .delete()
        .eq('sales_order_id', id);
    }

    await this.supabaseService.admin
      .from('stock_movements')
      .delete()
      .eq('reference_table', 'sales_orders')
      .eq('reference_id', id);

    await this.supabaseService.admin
      .from('sales_order_items')
      .delete()
      .eq('sales_order_id', id);

    await this.supabaseService.admin
      .from('financial_entries')
      .delete()
      .eq('reference_table', 'sales_orders')
      .eq('reference_id', id);

    const { error: deleteOrderError } = await this.supabaseService.admin
      .from('sales_orders')
      .delete()
      .eq('id', id);

    if (deleteOrderError) {
      throw new BadRequestException(deleteOrderError.message);
    }

    return { success: true };
  }
}
