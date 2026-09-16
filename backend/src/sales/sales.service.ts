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
    await this.clientsService.getActiveClient(payload.clientId);
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

    return this.getSalesOrder(String(salesOrder.id));
  }

  /**
   * Realiza um atendimento parcial ou total de uma venda.
   *
   * Toda a lógica roda dentro de uma única transação no banco via RPC
   * `create_sale_attendance`, garantindo:
   * - Concorrência (FOR UPDATE nos itens e lotes)
   * - Idempotência (idempotency_key)
   * - Atomicidade (tudo ou nada — fulfillments, stock, financeiro)
   */
  async fulfillSalesOrder(
    salesOrderId: string,
    payload: FulfillSalesOrderDto,
    user?: AuthenticatedUser,
  ) {
    if (!payload.paymentMethod?.trim()) {
      throw new BadRequestException('Informe a forma de pagamento para atender o pedido.');
    }

    if (!payload.bankAccountId?.trim()) {
      throw new BadRequestException('Informe a conta de recebimento para atender o pedido.');
    }

    const fulfilledAt = payload.fulfilledAt ?? new Date().toISOString();

    // Prepare installment entries for the RPC
    let installmentEntries: Array<{ amount: number; dueDate: string }> | null = null;
    if (payload.installmentEntries?.length) {
      installmentEntries = payload.installmentEntries.map((entry) => ({
        amount: Number(entry.amount),
        dueDate: entry.dueDate,
      }));
    }

    const { data: attendanceId, error: rpcError } = await this.supabaseService.admin.rpc(
      'create_sale_attendance',
      {
        p_sales_order_id: salesOrderId,
        p_user_id: user?.id ?? null,
        p_fulfilled_at: fulfilledAt,
        p_idempotency_key: payload.idempotencyKey,
        p_items: payload.items,
        p_payment_method: payload.paymentMethod.trim(),
        p_bank_account_id: payload.bankAccountId,
        p_installment_entries: installmentEntries,
        p_notes: payload.notes ?? null,
      },
    );

    if (rpcError) {
      throw new BadRequestException(rpcError.message);
    }

    return this.getSalesOrder(salesOrderId);
  }

  /**
   * Fecha comercialmente um pedido já conferido na expedição. A expedição
   * baixa o estoque; esta etapa registra as condições financeiras e gera o
   * contas a receber, sem repetir a baixa ou as quantidades atendidas.
   */
  async finalizeConferredSalesOrder(
    salesOrderId: string,
    payload: Omit<FulfillSalesOrderDto, 'items' | 'fulfilledAt'>,
    user?: AuthenticatedUser,
  ) {
    if (!payload.paymentMethod?.trim()) {
      throw new BadRequestException('Informe a forma de pagamento para finalizar a venda.');
    }
    if (!payload.bankAccountId?.trim()) {
      throw new BadRequestException('Informe a conta de recebimento para finalizar a venda.');
    }

    const installmentEntries = payload.installmentEntries?.length
      ? payload.installmentEntries.map((entry) => ({ amount: Number(entry.amount), dueDate: entry.dueDate }))
      : null;
    const { error } = await this.supabaseService.admin.rpc('finalize_conferred_sales_order', {
      p_sales_order_id: salesOrderId,
      p_user_id: user?.id ?? null,
      p_payment_method: payload.paymentMethod.trim(),
      p_bank_account_id: payload.bankAccountId,
      p_installment_entries: installmentEntries,
    });
    if (error) throw new BadRequestException(error.message);
    return this.getSalesOrder(salesOrderId);
  }

  /**
   * Cancela um atendimento específico.
   *
   * - Restaura saldo dos lotes
   * - Reverte quantidades atendidas
   * - Recalcula status da venda
   * - Remove contas a receber não pagas
   * - Bloqueia se houver recebimentos vinculados
   */
  async cancelAttendance(
    salesOrderId: string,
    attendanceId: string,
    user?: AuthenticatedUser,
  ) {
    // Verify attendance belongs to the order
    const { data: attendance, error: fetchError } = await this.supabaseService.admin
      .from('sale_attendances')
      .select('*')
      .eq('id', attendanceId)
      .eq('sales_order_id', salesOrderId)
      .maybeSingle();

    if (fetchError) {
      throw new BadRequestException(fetchError.message);
    }

    if (!attendance) {
      throw new NotFoundException('Atendimento não encontrado para este pedido.');
    }

    const { error: rpcError } = await this.supabaseService.admin.rpc(
      'cancel_sale_attendance',
      {
        p_attendance_id: attendanceId,
        p_user_id: user?.id ?? null,
      },
    );

    if (rpcError) {
      throw new BadRequestException(rpcError.message);
    }

    return this.getSalesOrder(salesOrderId);
  }

  async returnSalesOrder(
    salesOrderId: string,
    payload: ReturnSalesOrderDto,
    user?: AuthenticatedUser,
  ) {
    const { error } = await this.supabaseService.admin.rpc('process_sales_return', {
      p_sales_order_id: salesOrderId,
      p_return_date: payload.returnDate,
      p_items: payload.items,
      p_discount_amount: payload.discountAmount,
      p_excess_handling_strategy: payload.excessHandlingStrategy ?? null,
      p_user_id: user?.id ?? null,
    });

    if (error) {
      throw new BadRequestException(error.message);
    }

    return this.getSalesOrder(salesOrderId);

    /* Legacy, non-atomic flow retained below temporarily for reference while
       the database migration is rolled out.
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
      // Vendas finalizadas pelo fluxo atual têm os lançamentos vinculados à
      // finalização financeira, e não diretamente ao pedido. Mantemos também
      // a consulta legada para que devoluções de pedidos antigos continuem
      // funcionando.
      const { data: legacyEntries } = await this.supabaseService.admin
        .from('financial_entries')
        .select('*, financial_entry_receipts(*)')
        .eq('reference_table', 'sales_orders')
        .eq('reference_id', salesOrderId);

      const { data: finalizations } = await this.supabaseService.admin
        .from('sales_order_financial_finalizations')
        .select('id')
        .eq('sales_order_id', salesOrderId);

      const finalizedEntries = await Promise.all(
        (finalizations || []).map(async (finalization) => {
          const { data } = await this.supabaseService.admin
            .from('financial_entries')
            .select('*, financial_entry_receipts(*)')
            .eq('reference_table', 'sales_order_financial_finalizations')
            .eq('reference_id', finalization.id);

          return data || [];
        }),
      );

      const relatedEntries = [...(legacyEntries || []), ...finalizedEntries.flat()];

      if (relatedEntries.length > 0) {
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
        
        // Crédito só existe quando um recebimento já superou o novo saldo do
        // título. Já o reembolso é uma escolha explícita do usuário: deve
        // gerar a obrigação de pagar pelo valor devolvido, mesmo que o contas
        // a receber também tenha sido abatido nesta operação.
        const reimbursementAmount = payload.excessHandlingStrategy === 'refund'
          ? totalDiscount
          : totalNewlyGeneratedExcess;

        if (reimbursementAmount > 0 && payload.excessHandlingStrategy) {
          if (payload.excessHandlingStrategy === 'credit' && salesOrder.client_id) {
            const { data: client } = await this.supabaseService.admin
              .from('clients')
              .select('credit_balance')
              .eq('id', salesOrder.client_id)
              .single();
            
            if (client) {
              const newBalance = Number(client.credit_balance || 0) + reimbursementAmount;
              await this.supabaseService.admin
                .from('clients')
                .update({ credit_balance: newBalance })
                .eq('id', salesOrder.client_id);
                
              await this.supabaseService.admin
                .from('client_credits')
                .insert({
                  client_id: salesOrder.client_id,
                  amount: reimbursementAmount,
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
                amount: reimbursementAmount,
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

    */
  }

  private async loadSalesBundle() {
    const [salesOrders, salesOrderItems, fulfillments, clients, finishedProducts, finishedProductLots, salesReturns, attendances, attendanceItems] =
      await Promise.all([
        this.selectMany('sales_orders'),
        this.selectMany('sales_order_items'),
        this.selectMany('sales_order_fulfillments'),
        this.selectMany('clients'),
        this.selectMany('finished_products'),
        this.selectMany('finished_product_lots'),
        this.selectMany('sales_returns'),
        this.selectMany('sale_attendances'),
        this.selectMany('sale_attendance_items'),
      ]);

    return {
      salesOrders,
      salesOrderItems,
      fulfillments,
      clients,
      finishedProducts,
      finishedProductLots,
      salesReturns,
      attendances,
      attendanceItems,
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
      attendances?: Array<Record<string, unknown>>;
      attendanceItems?: Array<Record<string, unknown>>;
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
              attendanceId: fulfillment.attendance_id ? String(fulfillment.attendance_id) : null,
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

    // ── Hydrate attendances ──────────────────────────────────────────────────
    const attendances = (payload.attendances ?? [])
      .filter((a) => String(a.sales_order_id) === String(salesOrder.id))
      .map((a) => {
        const attItems = (payload.attendanceItems ?? [])
          .filter((ai) => String(ai.attendance_id) === String(a.id))
          .map((ai) => {
            const soi = payload.salesOrderItems.find((s) => String(s.id) === String(ai.sales_order_item_id));
            const product = soi
              ? payload.finishedProducts.find((p) => String(p.id) === String(soi.product_id))
              : null;

            return {
              id: String(ai.id),
              salesOrderItemId: String(ai.sales_order_item_id),
              productName: String(product?.name ?? '-'),
              quantity: Number(ai.quantity),
              unitPrice: Number(ai.unit_price),
              totalValue: Number(ai.total_value),
            };
          });

        return {
          id: String(a.id),
          attendanceNumber: String(a.attendance_number),
          fulfilledAt: String(a.fulfilled_at),
          totalValue: Number(a.total_value),
          status: String(a.status),
          notes: a.notes ? String(a.notes) : null,
          items: attItems,
        };
      })
      .sort((a, b) => a.fulfilledAt.localeCompare(b.fulfilledAt));

    // ── Calculate summary ────────────────────────────────────────────────────
    const totalAmount = Number(salesOrder.total_amount ?? 0);
    const totalFulfilled = attendances
      .filter((a) => a.status === 'Concluído')
      .reduce((sum, a) => sum + a.totalValue, 0);
    const remainingAmount = Math.max(0, totalAmount - totalFulfilled);
    const fulfilledPercent = totalAmount > 0 ? Math.min(100, (totalFulfilled / totalAmount) * 100) : 0;

    return {
      id: String(salesOrder.id),
      number: String(salesOrder.order_number),
      clientId: String(salesOrder.client_id),
      clientName: String(client?.name ?? '-'),
      clientDocument: client?.document ? String(client.document) : '',
      orderDate: String(salesOrder.order_date),
      dueDate: String(salesOrder.due_date),
      status: String(salesOrder.status),
      totalAmount,
      notes: salesOrder.notes ? String(salesOrder.notes) : '',
      hasReturn: Boolean(salesOrder.has_return),
      items,
      attendances,
      totalFulfilled,
      remainingAmount,
      fulfilledPercent: Number(fulfilledPercent.toFixed(2)),
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

    // Delete attendances (cascade will handle attendance_items)
    await this.supabaseService.admin
      .from('sale_attendances')
      .delete()
      .eq('sales_order_id', id);

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
