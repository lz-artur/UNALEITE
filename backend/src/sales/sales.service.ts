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
import { ReturnSalesOrderDto } from './dto/return-sales-order.dto';

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
    const orderItems = bundle.salesOrderItems.filter((entry) => String(entry.sales_order_id) === salesOrderId);

    if (!salesOrder) {
      throw new NotFoundException('Pedido de venda não encontrado');
    }

    if (
      String(salesOrder.status) === SALES_ORDER_STATUS.FULFILLED ||
      String(salesOrder.status) === SALES_ORDER_STATUS.CANCELED
    ) {
      throw new BadRequestException('O pedido de venda não pode ser atendido');
    }

    let fulfilledValue = 0;
    let fullOrderAmount = 0;

    for (const item of orderItems) {
      fullOrderAmount += Number(item.total_value) || (Number(item.ordered_quantity) * Number(item.unit_price));
    }

    for (const item of payload.items) {
      const orderItem = orderItems.find(i => String(i.id) === item.salesOrderItemId);
      if (orderItem) {
        fulfilledValue += item.quantity * Number(orderItem.unit_price);
      }
    }

    const fulfilledAt = payload.fulfilledAt ?? new Date().toISOString();

    const { error: rpcError } = await this.supabaseService.admin.rpc('fulfill_sales_order_items', {
      p_sales_order_id: salesOrderId,
      p_user_id: user?.id ?? null,
      p_fulfilled_at: fulfilledAt,
      p_items: payload.items,
    });

    if (rpcError) {
      throw new BadRequestException(rpcError.message);
    }

    if (fulfilledValue > 0) {
      const { data: openEntries } = await this.supabaseService.admin
        .from('financial_entries')
        .select('*')
        .eq('reference_table', 'sales_orders')
        .eq('reference_id', salesOrderId)
        .eq('status', 'Aberto')
        .order('created_at', { ascending: true });

      const provisionEntry = openEntries?.[0];

      if (provisionEntry) {
        let billedAmount = fulfilledValue;
        if (payload.installmentEntries?.length) {
          billedAmount = payload.installmentEntries.reduce((sum, p) => sum + p.amount, 0);
        }

        const remainingProvisionAmount = Number(provisionEntry.amount) - billedAmount;

        await this.supabaseService.admin
          .from('financial_entry_items')
          .delete()
          .eq('financial_entry_id', provisionEntry.id);

        if (remainingProvisionAmount <= 0) {
          await this.supabaseService.admin
            .from('financial_entries')
            .delete()
            .eq('id', provisionEntry.id);
        } else {
          await this.supabaseService.admin
            .from('financial_entries')
            .update({ amount: remainingProvisionAmount, updated_by: user?.id ?? null })
            .eq('id', provisionEntry.id);
            
          await this.generateRateio([{ ...provisionEntry, amount: remainingProvisionAmount }], salesOrderId, fullOrderAmount, user);
        }

        const groupId = require('crypto').randomUUID();
        let newEntriesToInsert = [];

        if (payload.installmentEntries?.length) {
          newEntriesToInsert = payload.installmentEntries.map((installment, index) => {
            const { id, created_at, updated_at, computed_status, ...rest } = provisionEntry;
            return {
              ...rest,
              amount: installment.amount,
              due_date: installment.dueDate,
              description: `${provisionEntry.description} (Fatura Parcela ${index + 1}/${payload.installmentEntries!.length})`,
              installment_group_id: groupId,
              installment_number: index + 1,
              payment_method: payload.paymentMethod || provisionEntry.payment_method,
              bank_account_id: payload.bankAccountId || provisionEntry.bank_account_id,
              updated_by: user?.id ?? null,
            };
          });
        } else {
          const { id, created_at, updated_at, computed_status, ...rest } = provisionEntry;
          newEntriesToInsert = [{
            ...rest,
            amount: billedAmount,
            description: `${provisionEntry.description} (Fatura)`,
            payment_method: payload.paymentMethod || provisionEntry.payment_method,
            installments: payload.installments || provisionEntry.installments,
            bank_account_id: payload.bankAccountId || provisionEntry.bank_account_id,
            updated_by: user?.id ?? null,
          }];
        }

        const { data: insertedEntries, error: insertError } = await this.supabaseService.admin
          .from('financial_entries')
          .insert(newEntriesToInsert)
          .select('id, amount');

        if (insertError) {
          throw new BadRequestException(insertError.message);
        }

        if (insertedEntries && insertedEntries.length > 0) {
          await this.generateRateio(insertedEntries, salesOrderId, fullOrderAmount, user);
        }
      } else {
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
      }
    }

    return this.getSalesOrder(salesOrderId);
  }

  async returnSalesOrder(
    salesOrderId: string,
    payload: ReturnSalesOrderDto,
    user?: AuthenticatedUser,
  ) {
    const bundle = await this.loadSalesBundle();
    const salesOrder = bundle.salesOrders.find((entry) => String(entry.id) === salesOrderId);

    if (!salesOrder) {
      throw new NotFoundException('Pedido de venda não encontrado');
    }

    let totalDiscount = Number(payload.discountAmount) || 0;

    // Registrar o retorno por item
    for (const item of payload.items) {
      const fulfillment = bundle.fulfillments.find(
        (entry) =>
          String(entry.finished_product_lot_id) === item.lotId
          && String(entry.sales_order_id) === salesOrderId
          && String(entry.sales_order_item_id) === item.salesOrderItemId,
      );

      const salesOrderItem = bundle.salesOrderItems.find(
        (entry) =>
          String(entry.id) === item.salesOrderItemId
          && String(entry.sales_order_id) === salesOrderId,
      );

      if (!fulfillment || !salesOrderItem) {
        throw new BadRequestException(`Atendimento não encontrado para o lote ${item.lotId}`);
      }

      const lot = bundle.finishedProductLots.find(l => String(l.id) === item.lotId);
      if (!lot) {
        throw new BadRequestException(`Lote não encontrado`);
      }

      // Query already returned quantities for this exact fulfillment (this order, this item, this lot)
      const { data: pastReturns } = await this.supabaseService.admin
        .from('sales_returns')
        .select('returned_quantity')
        .eq('sales_order_id', salesOrderId)
        .eq('product_id', salesOrderItem.product_id)
        .eq('finished_product_lot_id', item.lotId);

      const alreadyReturned = (pastReturns || []).reduce((sum, r) => sum + Number(r.returned_quantity), 0);
      const originalQuantity = Number(fulfillment.quantity);
      
      if (item.returnedQuantity > (originalQuantity - alreadyReturned)) {
        throw new BadRequestException(`Quantidade devolvida excede a quantidade atendida e não devolvida do lote.`);
      }

      // Update finished_product_lots returned_quantity
      const currentReturnedQuantity = Number(lot.returned_quantity || 0);
      await this.supabaseService.admin
        .from('finished_product_lots')
        .update({ returned_quantity: currentReturnedQuantity + item.returnedQuantity })
        .eq('id', item.lotId);

      // Insert return history
      await this.supabaseService.admin
        .from('sales_returns')
        .insert({
          sales_order_id: salesOrderId,
          product_id: salesOrderItem.product_id,
          finished_product_lot_id: item.lotId,
          original_quantity: originalQuantity,
          returned_quantity: item.returnedQuantity,
          return_date: payload.returnDate,
          reason: item.reason || null,
          discount_amount: totalDiscount,
          original_sale_value: Number(salesOrder.total_amount),
          new_sale_value: Number(salesOrder.total_amount) - totalDiscount,
          created_by: user?.id ?? null,
          updated_by: user?.id ?? null,
        });
    }

    // Mark sales order as having return
    await this.supabaseService.admin
      .from('sales_orders')
      .update({ has_return: true })
      .eq('id', salesOrderId);

    // Apply financial discount
    if (totalDiscount > 0) {
      const { data: relatedEntries } = await this.supabaseService.admin
        .from('financial_entries')
        .select('*, financial_entry_receipts(*)')
        .eq('reference_table', 'sales_orders')
        .eq('reference_id', salesOrderId);

      if (relatedEntries && relatedEntries.length > 0) {
        const totalAmount = relatedEntries.reduce((sum, e) => sum + Number(e.amount), 0);
        
        if (totalDiscount > totalAmount) {
          totalDiscount = totalAmount; // Max limit to avoid negative entries
        }

        let totalNewlyGeneratedExcess = 0;

        for (const entry of relatedEntries) {
          const entryAmount = Number(entry.amount);
          const currentDiscount = Number(entry.discount_amount || 0);
          const proportionalDiscount = Number((totalDiscount * (entryAmount / totalAmount)).toFixed(4));
          const newDiscountAmount = currentDiscount + proportionalDiscount;
          
          await this.supabaseService.admin
            .from('financial_entries')
            .update({ discount_amount: newDiscountAmount, updated_by: user?.id ?? null })
            .eq('id', entry.id);

          const receipts = Array.isArray(entry.financial_entry_receipts) ? entry.financial_entry_receipts : [];
          const receivedAmount = receipts.reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);
          
          const previousNetAmount = entryAmount - currentDiscount;
          const netAmount = entryAmount - newDiscountAmount;
          
          const previousExcess = Math.max(0, receivedAmount - previousNetAmount);
          const currentExcess = Math.max(0, receivedAmount - netAmount);
          const newlyGeneratedExcess = currentExcess - previousExcess;
          
          totalNewlyGeneratedExcess += newlyGeneratedExcess;

          // Update financial_entry_items (rateio) if needed
          const { data: rateioItems } = await this.supabaseService.admin
            .from('financial_entry_items')
            .select('*')
            .eq('financial_entry_id', entry.id);
            
          if (rateioItems && rateioItems.length > 0) {
             for (const rateio of rateioItems) {
               const rateioAmount = Number(rateio.amount);
               const propRateioDiscount = Number((proportionalDiscount * (rateioAmount / entryAmount)).toFixed(4));
               await this.supabaseService.admin
                 .from('financial_entry_items')
                 .update({ amount: rateioAmount - propRateioDiscount }) // reducing amount directly for rateios to keep it simple
                 .eq('id', rateio.id);
             }
          }
        }
        
        // Handle the excess if there is any and a strategy is provided
        if (totalNewlyGeneratedExcess > 0 && payload.excessHandlingStrategy) {
          if (payload.excessHandlingStrategy === 'credit' && salesOrder.client_id) {
            const { data: client } = await this.supabaseService.admin
              .from('clients')
              .select('credit_balance')
              .eq('id', salesOrder.client_id)
              .single();
            
            if (client) {
              const newBalance = Number(client.credit_balance || 0) + totalNewlyGeneratedExcess;
              await this.supabaseService.admin
                .from('clients')
                .update({ credit_balance: newBalance })
                .eq('id', salesOrder.client_id);
                
              await this.supabaseService.admin
                .from('client_credits')
                .insert({
                  client_id: salesOrder.client_id,
                  amount: totalNewlyGeneratedExcess,
                  transaction_type: 'Credit_Earned',
                  reference_type: 'sales_orders',
                  reference_id: salesOrderId,
                  notes: `Crédito gerado por devolução no pedido ${salesOrderId}`,
                  created_by: user?.id ?? null
                });
            }
          } else if (payload.excessHandlingStrategy === 'refund' && salesOrder.client_id) {
            await this.supabaseService.admin
              .from('financial_entries')
              .insert({
                entry_type: 'Pagar',
                description: `Reembolso de Devolução (Pedido ${salesOrder.id})`,
                amount: totalNewlyGeneratedExcess,
                due_date: payload.returnDate || new Date().toISOString(),
                status: 'Aberto',
                category: 'Reembolsos',
                client_id: salesOrder.client_id,
                reference_table: 'sales_orders',
                reference_id: salesOrderId,
                created_by: user?.id ?? null
              });
          }
        }
      }
    }

    return this.getSalesOrder(salesOrderId);
  }

  private async loadSalesBundle() {
    const [salesOrders, salesOrderItems, fulfillments, clients, finishedProducts, finishedProductLots, salesReturns] =
      await Promise.all([
        this.selectMany('sales_orders'),
        this.selectMany('sales_order_items'),
        this.selectMany('sales_order_fulfillments'),
        this.selectMany('clients'),
        this.selectMany('finished_products'),
        this.selectMany('finished_product_lots'),
        this.selectMany('sales_returns'),
      ]);

    return {
      salesOrders,
      salesOrderItems,
      fulfillments,
      clients,
      finishedProducts,
      finishedProductLots,
      salesReturns,
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
      salesReturns?: Array<Record<string, unknown>>;
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

            const pastReturns = payload.salesReturns?.filter(
              (r) => String(r.sales_order_id) === String(salesOrder.id) &&
                     String(r.product_id) === String(entry.product_id) &&
                     String(r.finished_product_lot_id) === String(fulfillment.finished_product_lot_id)
            ) || [];
            
            const alreadyReturned = pastReturns.reduce((sum, r) => sum + Number(r.returned_quantity), 0);

            return {
              id: String(fulfillment.id),
              finishedProductLotId: String(fulfillment.finished_product_lot_id),
              lotCode: String(lot?.lot_code ?? '-'),
              quantity: Number(fulfillment.quantity),
              returnedQuantity: alreadyReturned,
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
      hasReturn: Boolean(salesOrder.has_return),
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

    const { data: insertedEntry, error } = await this.supabaseService.admin.from('financial_entries').insert({
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
    }).select('id, amount').single();

    if (error && !error.message.includes('duplicate')) {
      throw new BadRequestException(error.message);
    }

    if (insertedEntry && amount > 0) {
      await this.generateRateio([insertedEntry], String(salesOrder.id), amount, user);
    }
  }

  private async generateRateio(entries: any[], salesOrderId: string, totalAmount: number, user?: AuthenticatedUser) {
    const bundle = await this.loadSalesBundle();
    const orderItems = bundle.salesOrderItems.filter(item => String(item.sales_order_id) === salesOrderId);
    const products = bundle.finishedProducts;

    if (entries.length > 0 && totalAmount > 0 && orderItems.length > 0) {
      const rateioItemsToInsert: any[] = [];

      for (const entry of entries) {
        let remainingAmount = Number(entry.amount);

        orderItems.forEach((item, index) => {
          const product = products.find((p) => String(p.id) === String(item.product_id));
          const itemTotal = Number(item.total_value) || (Number(item.ordered_quantity) * Number(item.unit_price));
          const proportion = itemTotal / totalAmount;
          
          let rateioAmount = Number((Number(entry.amount) * proportion).toFixed(4));
          
          if (index === orderItems.length - 1) {
            rateioAmount = remainingAmount;
          } else {
            remainingAmount -= rateioAmount;
          }

          rateioItemsToInsert.push({
            financial_entry_id: entry.id,
            amount: rateioAmount,
            cost_center_id: product?.cost_center_id ?? null,
            accounting_category_id: product?.accounting_category_id ?? null,
            accounting_subcategory_id: product?.accounting_subcategory_id ?? null,
            cost_type: product?.cost_type ?? null,
            created_by: user?.id ?? null,
            updated_by: user?.id ?? null,
          });
        });
      }

      if (rateioItemsToInsert.length > 0) {
        const { error: itemsError } = await this.supabaseService.admin
          .from('financial_entry_items')
          .insert(rateioItemsToInsert);

        if (itemsError) {
          console.error(`Erro ao inserir itens de rateio de venda: ${itemsError.message}`);
        }
      }
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
    const returns = bundle.salesReturns.filter((entry) => String(entry.sales_order_id) === id);
    const fulfilledByLot = new Map<string, number>();
    const returnedByLot = new Map<string, number>();

    for (const fulfillment of fulfillments) {
      const lotId = String(fulfillment.finished_product_lot_id);
      fulfilledByLot.set(
        lotId,
        (fulfilledByLot.get(lotId) ?? 0) + Number(fulfillment.quantity),
      );
    }

    for (const salesReturn of returns) {
      const lotId = String(salesReturn.finished_product_lot_id);
      returnedByLot.set(
        lotId,
        (returnedByLot.get(lotId) ?? 0) + Number(salesReturn.returned_quantity),
      );
    }

    const affectedLotIds = new Set([...fulfilledByLot.keys(), ...returnedByLot.keys()]);
    for (const lotId of affectedLotIds) {
      const lot = bundle.finishedProductLots.find((entry) => String(entry.id) === lotId);

      if (lot) {
        const restoredVolume = Number((
          Number(lot.available_quantity) + (fulfilledByLot.get(lotId) ?? 0)
        ).toFixed(4));
        const restoredReturnedQuantity = Number(Math.max(
          0,
          Number(lot.returned_quantity || 0) - (returnedByLot.get(lotId) ?? 0),
        ).toFixed(4));
        const { error: lotUpdateError } = await this.supabaseService.admin
          .from('finished_product_lots')
          .update({
            available_quantity: restoredVolume,
            returned_quantity: restoredReturnedQuantity,
          })
          .eq('id', lot.id);

        if (lotUpdateError) {
          throw new BadRequestException(lotUpdateError.message);
        }
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
