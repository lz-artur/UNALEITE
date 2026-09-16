import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PURCHASE_STATUS,
  SUPPLY_LOT_STATUS,
} from '../common/constants/domain';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { SupabaseService } from '../supabase/supabase.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { ListPurchasesDto } from './dto/list-purchases.dto';
import { ReceivePurchaseDto } from './dto/receive-purchase.dto';

@Injectable()
export class PurchasesService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async listPurchases(filters: ListPurchasesDto = {}) {
    const payload = await this.loadPurchaseBundle();

    return payload.purchases
      .map((purchase) => this.hydratePurchase(purchase, payload))
      .filter((purchase) => this.matchesFilters(purchase, filters))
      .sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate));
  }

  async getPurchase(id: string) {
    const payload = await this.loadPurchaseBundle();
    const purchase = payload.purchases.find((entry) => String(entry.id) === id);

    if (!purchase) {
      throw new NotFoundException('Purchase not found');
    }

    return this.hydratePurchase(purchase, payload);
  }

  async createPurchase(payload: CreatePurchaseDto, user?: AuthenticatedUser) {
    const [supplier, supplyItems, financialReferences] = await Promise.all([
      this.getSupplier(payload.supplierId),
      this.getSupplyItems(payload.items.map((item) => item.supplyItemId)),
      this.getFinancialReferences(payload),
    ]);
    const purchaseNumber = `CMP-${new Date(payload.purchaseDate).getFullYear()}-${Date.now()}`;
    const totalAmount = payload.items.reduce(
      (sum, item) => sum + Number((item.quantity * item.unitCost).toFixed(4)),
      0,
    );
    const uncategorizedItems = supplyItems.filter(
      (item) => !item.cost_center_id || !item.accounting_category_id || !item.accounting_subcategory_id,
    );
    if (uncategorizedItems.length > 0) {
      const names = uncategorizedItems.map((item) => String(item.name ?? item.id)).join(', ');
      throw new BadRequestException(
        `Cadastre centro de custo, categoria e subcategoria contábil nos seguintes insumos antes de comprar: ${names}.`,
      );
    }
    const dueDate = payload.dueDate ?? payload.purchaseDate;

    const { data: purchase, error: purchaseError } = await this.supabaseService.admin
      .from('purchases')
      .insert({
        purchase_number: purchaseNumber,
        supplier_id: payload.supplierId,
        purchase_date: payload.purchaseDate,
        due_date: dueDate,
        status: PURCHASE_STATUS.OPEN,
        total_amount: totalAmount,
        notes: payload.notes ?? null,
        payment_method_id: payload.paymentMethodId ?? null,
        payment_type_id: payload.paymentTypeId ?? null,
        // A classificação contábil de uma compra pertence a cada item, nunca
        // ao cabeçalho: uma única compra pode reunir insumos distintos.
        cost_center_id: null,
        accounting_category_id: null,
        accounting_subcategory_id: null,
        bank_account_id: payload.bankAccountId ?? null,
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      })
      .select('*')
      .single();

    if (purchaseError) {
      throw new BadRequestException(purchaseError.message);
    }

    const itemsToInsert = payload.items.map((item) => {
      const supplyItem = supplyItems.find((entry) => String(entry.id) === item.supplyItemId);
      if (!supplyItem) {
        throw new BadRequestException(`Supply item ${item.supplyItemId} not found`);
      }

      return {
        purchase_id: purchase.id,
        supply_item_id: item.supplyItemId,
        ordered_quantity: item.quantity,
        received_quantity: 0,
        unit_cost: item.unitCost,
        total_value: Number((item.quantity * item.unitCost).toFixed(4)),
        status: PURCHASE_STATUS.OPEN,
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      };
    });

    const { error: itemsError } = await this.supabaseService.admin
      .from('purchase_items')
      .insert(itemsToInsert);

    if (itemsError) {
      throw new BadRequestException(itemsError.message);
    }

    await this.upsertFinancialEntry(
      purchase,
      supplier,
      totalAmount,
      payload,
      supplyItems,
      financialReferences,
      user,
    );

    return this.getPurchase(String(purchase.id));
  }

  async receivePurchase(
    purchaseId: string,
    payload: ReceivePurchaseDto,
    user?: AuthenticatedUser,
  ) {
    const purchaseBundle = await this.loadPurchaseBundle();
    const purchase = purchaseBundle.purchases.find((entry) => String(entry.id) === purchaseId);

    if (!purchase) {
      throw new NotFoundException('Purchase not found');
    }

    if (String(purchase.status) === PURCHASE_STATUS.RECEIVED || String(purchase.status) === PURCHASE_STATUS.CANCELED) {
      throw new BadRequestException('Purchase cannot receive more items');
    }

    const purchaseItems = purchaseBundle.purchaseItems.filter(
      (entry) => String(entry.purchase_id) === purchaseId,
    );
    const supplyItems = await this.getSupplyItems(
      purchaseItems.map((item) => String(item.supply_item_id)),
    );
    const defaultLocationId = await this.getDefaultSupplyLocationId();
    const receivedAt = payload.receivedAt ?? new Date().toISOString();

    for (const receivedItem of payload.items) {
      const purchaseItem = purchaseItems.find(
        (entry) => String(entry.id) === receivedItem.purchaseItemId,
      );

      if (!purchaseItem) {
        throw new BadRequestException(`Purchase item ${receivedItem.purchaseItemId} not found`);
      }

      const pendingQuantity =
        Number(purchaseItem.ordered_quantity) - Number(purchaseItem.received_quantity);
      if (receivedItem.receivedQuantity > pendingQuantity) {
        throw new BadRequestException(
          `Received quantity for item ${receivedItem.purchaseItemId} exceeds pending quantity`,
        );
      }

      const supplyItem = supplyItems.find(
        (entry) => String(entry.id) === String(purchaseItem.supply_item_id),
      );

      if (!supplyItem) {
        throw new BadRequestException(
          `Supply item ${String(purchaseItem.supply_item_id)} not found for purchase item`,
        );
      }

      if (supplyItem.tracks_lot && !receivedItem.supplierLotNumber) {
        throw new BadRequestException(
          `Supply item ${String(supplyItem.name)} requires supplier lot number`,
        );
      }

      if (supplyItem.tracks_expiration && !receivedItem.expirationDate) {
        throw new BadRequestException(
          `Supply item ${String(supplyItem.name)} requires expiration date`,
        );
      }

      const unitCost =
        receivedItem.unitCost != null ? receivedItem.unitCost : Number(purchaseItem.unit_cost);
      const totalValue = Number((receivedItem.receivedQuantity * unitCost).toFixed(4));
      const internalLotCode = `CP-L${new Date().getFullYear()}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      const { data: createdLot, error: lotError } = await this.supabaseService.admin
        .from('supply_lots')
        .insert({
          supply_item_id: purchaseItem.supply_item_id,
          supplier_id: purchase.supplier_id,
          supplier_lot_number: receivedItem.supplierLotNumber ?? null,
          internal_lot_code: internalLotCode,
          entry_date: receivedAt,
          manufacture_date: receivedItem.manufactureDate ?? null,
          expiration_date: receivedItem.expirationDate ?? null,
          received_quantity: receivedItem.receivedQuantity,
          available_quantity: receivedItem.receivedQuantity,
          unit_cost: unitCost,
          total_value: totalValue,
          location_id: receivedItem.locationId ?? defaultLocationId,
          status: SUPPLY_LOT_STATUS.AVAILABLE,
          purchase_id: purchase.id,
          purchase_item_id: purchaseItem.id,
          created_by: user?.id ?? null,
          updated_by: user?.id ?? null,
        })
        .select('id')
        .single();

      if (lotError) {
        throw new BadRequestException(lotError.message);
      }

      const nextReceivedQuantity =
        Number(purchaseItem.received_quantity) + receivedItem.receivedQuantity;
      const nextItemStatus =
        nextReceivedQuantity >= Number(purchaseItem.ordered_quantity)
          ? PURCHASE_STATUS.RECEIVED
          : PURCHASE_STATUS.PARTIALLY_RECEIVED;

      const { error: updatePurchaseItemError } = await this.supabaseService.admin
        .from('purchase_items')
        .update({
          received_quantity: nextReceivedQuantity,
          unit_cost: unitCost,
          total_value: Number(
            (Number(purchaseItem.ordered_quantity) * unitCost).toFixed(4),
          ),
          status: nextItemStatus,
          updated_by: user?.id ?? null,
        })
        .eq('id', purchaseItem.id);

      if (updatePurchaseItemError) {
        throw new BadRequestException(updatePurchaseItemError.message);
      }

      const { error: updateSupplyItemError } = await this.supabaseService.admin
        .from('supply_items')
        .update({
          current_stock:
            Number(supplyItem.current_stock) + receivedItem.receivedQuantity,
          updated_by: user?.id ?? null,
        })
        .eq('id', purchaseItem.supply_item_id);

      if (updateSupplyItemError) {
        throw new BadRequestException(updateSupplyItemError.message);
      }

      const { error: stockMovementError } = await this.supabaseService.admin
        .from('stock_movements')
        .insert({
          movement_type: 'entrada',
          lot_type: 'Insumo',
          lot_id: createdLot.id,
          quantity: receivedItem.receivedQuantity,
          reference_table: 'purchases',
          reference_id: purchase.id,
          created_by: user?.id ?? null,
          updated_by: user?.id ?? null,
        });

      if (stockMovementError) {
        throw new BadRequestException(stockMovementError.message);
      }
    }

    await this.refreshPurchaseStatus(purchaseId, user);

    return this.getPurchase(purchaseId);
  }

  private async loadPurchaseBundle() {
    const [purchases, purchaseItems, suppliers, supplyItems] = await Promise.all([
      this.selectMany('purchases'),
      this.selectMany('purchase_items'),
      this.selectMany('suppliers'),
      this.selectMany('supply_items'),
    ]);

    return {
      purchases,
      purchaseItems,
      suppliers,
      supplyItems,
    };
  }

  private hydratePurchase(
    purchase: Record<string, unknown>,
    payload: {
      purchases: Array<Record<string, unknown>>;
      purchaseItems: Array<Record<string, unknown>>;
      suppliers: Array<Record<string, unknown>>;
      supplyItems: Array<Record<string, unknown>>;
    },
  ) {
    const supplier = payload.suppliers.find(
      (entry) => String(entry.id) === String(purchase.supplier_id),
    );
    const items = payload.purchaseItems
      .filter((entry) => String(entry.purchase_id) === String(purchase.id))
      .map((entry) => {
        const supplyItem = payload.supplyItems.find(
          (item) => String(item.id) === String(entry.supply_item_id),
        );
        const orderedQuantity = Number(entry.ordered_quantity);
        const receivedQuantity = Number(entry.received_quantity);

        return {
          id: String(entry.id),
          supplyItemId: String(entry.supply_item_id),
          supplyItemName: String(supplyItem?.name ?? '-'),
          unitId: supplyItem?.unit_id ? String(supplyItem.unit_id) : undefined,
          orderedQuantity,
          receivedQuantity,
          pendingQuantity: orderedQuantity - receivedQuantity,
          unitCost: Number(entry.unit_cost),
          totalValue: Number(entry.total_value),
          status: String(entry.status),
          tracksExpiration: Boolean(supplyItem?.tracks_expiration),
          tracksLot: Boolean(supplyItem?.tracks_lot),
        };
      })
      .sort((a, b) => a.supplyItemName.localeCompare(b.supplyItemName));

    return {
      id: String(purchase.id),
      number: String(purchase.purchase_number),
      supplierId: String(purchase.supplier_id),
      supplierName: String(supplier?.name ?? '-'),
      purchaseDate: String(purchase.purchase_date),
      dueDate: String(purchase.due_date),
      status: String(purchase.status),
      totalAmount: Number(purchase.total_amount ?? 0),
      notes: purchase.notes ? String(purchase.notes) : '',
      paymentMethodId: purchase.payment_method_id ? String(purchase.payment_method_id) : undefined,
      paymentTypeId: purchase.payment_type_id ? String(purchase.payment_type_id) : undefined,
      costCenterId: purchase.cost_center_id ? String(purchase.cost_center_id) : undefined,
      accountingCategoryId: purchase.accounting_category_id ? String(purchase.accounting_category_id) : undefined,
      accountingSubcategoryId: purchase.accounting_subcategory_id ? String(purchase.accounting_subcategory_id) : undefined,
      bankAccountId: purchase.bank_account_id ? String(purchase.bank_account_id) : undefined,
      items,
    };
  }

  private matchesFilters(
    purchase: ReturnType<PurchasesService['hydratePurchase']>,
    filters: ListPurchasesDto,
  ) {
    if (filters.supplierId && purchase.supplierId !== filters.supplierId) {
      return false;
    }

    if (filters.status && purchase.status !== filters.status) {
      return false;
    }

    if (filters.startDate && new Date(purchase.purchaseDate) < new Date(filters.startDate)) {
      return false;
    }

    if (filters.endDate) {
      const endDate = new Date(filters.endDate);
      endDate.setHours(23, 59, 59, 999);
      if (new Date(purchase.purchaseDate) > endDate) {
        return false;
      }
    }

    return true;
  }

  private async getSupplier(id: string) {
    const { data, error } = await this.supabaseService.admin
      .from('suppliers')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new BadRequestException(error.message);
    }

    if (!data) {
      throw new NotFoundException('Supplier not found');
    }

    if (!data.active) {
      throw new BadRequestException('Supplier is inactive');
    }

    return data;
  }

  private async getSupplyItems(ids: string[]) {
    const uniqueIds = Array.from(new Set(ids));
    const { data, error } = await this.supabaseService.admin
      .from('supply_items')
      .select('*')
      .in('id', uniqueIds);

    if (error) {
      throw new BadRequestException(error.message);
    }

    const missingInactive = (data ?? []).find((entry) => !entry.active);
    if (missingInactive) {
      throw new BadRequestException(`Supply item ${String(missingInactive.name)} is inactive`);
    }

    if ((data ?? []).length !== uniqueIds.length) {
      throw new BadRequestException('One or more supply items were not found');
    }

    return data ?? [];
  }

  private async getFinancialReferences(payload: CreatePurchaseDto) {
    const [paymentMethod, paymentType, bankAccount] = await Promise.all([
      this.getActiveReference('payment_methods', payload.paymentMethodId, 'Forma de pagamento'),
      this.getActiveReference('payment_types', payload.paymentTypeId, 'Tipo de pagamento'),
      this.getActiveReference('bank_accounts', payload.bankAccountId, 'Conta bancária'),
    ]);

    return { paymentMethod, paymentType, bankAccount };
  }

  private async getActiveReference(table: string, id: string, label: string) {
    const { data, error } = await this.supabaseService.admin
      .from(table)
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new BadRequestException(error.message);
    }

    if (!data) {
      throw new BadRequestException(`${label} não encontrado(a).`);
    }

    if (!data.active) {
      throw new BadRequestException(`${label} está inativo(a).`);
    }

    return data;
  }

  private async refreshPurchaseStatus(purchaseId: string, user?: AuthenticatedUser) {
    const { data: items, error } = await this.supabaseService.admin
      .from('purchase_items')
      .select('*')
      .eq('purchase_id', purchaseId);

    if (error) {
      throw new BadRequestException(error.message);
    }

    const nextStatus = (items ?? []).every(
      (item) => Number(item.received_quantity) >= Number(item.ordered_quantity),
    )
      ? PURCHASE_STATUS.RECEIVED
      : (items ?? []).some((item) => Number(item.received_quantity) > 0)
        ? PURCHASE_STATUS.PARTIALLY_RECEIVED
        : PURCHASE_STATUS.OPEN;

    const { error: purchaseUpdateError } = await this.supabaseService.admin
      .from('purchases')
      .update({
        status: nextStatus,
        updated_by: user?.id ?? null,
      })
      .eq('id', purchaseId);

    if (purchaseUpdateError) {
      throw new BadRequestException(purchaseUpdateError.message);
    }
  }

  private async upsertFinancialEntry(
    purchase: Record<string, unknown>,
    supplier: Record<string, unknown>,
    amount: number,
    payload: CreatePurchaseDto,
    supplyItems: Record<string, any>[],
    financialReferences: { paymentMethod: any; paymentType: any },
    user?: AuthenticatedUser,
  ) {
    const description = `Compra ${String(purchase.purchase_number)} - ${String(supplier.name)}`;
    const commonFields = {
      entry_type: 'Pagar',
      status: 'Aberto',
      category: 'Compras',
      supplier_id: purchase.supplier_id,
      reference_table: 'purchases',
      reference_id: purchase.id,
      cost_center_id: null,
      // As categorias ficam nas linhas de rateio, vindas do cadastro do insumo.
      accounting_category_id: null,
      accounting_subcategory_id: null,
      bank_account_id: payload.bankAccountId ?? null,
      payment_method: financialReferences.paymentMethod.name,
      payment_type: financialReferences.paymentType.name,
      created_by: user?.id ?? null,
      updated_by: user?.id ?? null,
    };

    let insertedEntries: any[] = [];

    if (payload.installments && payload.installments.length > 0) {
      // Usar a mesma lógica para agrupar as parcelas
      const installmentGroupId = require('crypto').randomUUID();
      
      const entries = payload.installments.map((installment, index) => ({
        ...commonFields,
        description: `${description} (Parcela ${index + 1}/${payload.installments!.length})`,
        amount: installment.amount,
        due_date: installment.dueDate,
        installment_group_id: installmentGroupId,
        installment_number: index + 1,
      }));

      const { data, error } = await this.supabaseService.admin.from('financial_entries').insert(entries).select('id, amount');

      if (error) {
        throw new BadRequestException(error.message);
      }
      insertedEntries = data || [];
    } else {
      const { data, error } = await this.supabaseService.admin.from('financial_entries').insert({
        ...commonFields,
        description,
        amount,
        due_date: purchase.due_date,
      }).select('id, amount');

      if (error) {
        throw new BadRequestException(error.message);
      }
      insertedEntries = data || [];
    }

    if (insertedEntries.length > 0 && amount > 0) {
      const rateioItemsToInsert: any[] = [];

      for (const entry of insertedEntries) {
        let remainingAmount = Number(entry.amount);

        payload.items.forEach((item, index) => {
          const supplyItem = supplyItems.find((s) => String(s.id) === item.supplyItemId);
          const itemTotal = Number(item.quantity) * Number(item.unitCost);
          const proportion = itemTotal / amount;
          
          let rateioAmount = Number((Number(entry.amount) * proportion).toFixed(4));
          
          // Ajuste de arredondamento no último item
          if (index === payload.items.length - 1) {
            rateioAmount = remainingAmount;
          } else {
            remainingAmount -= rateioAmount;
          }

          rateioItemsToInsert.push({
            financial_entry_id: entry.id,
            supply_item_id: supplyItem?.id ?? null,
            amount: rateioAmount,
            cost_center_id: supplyItem?.cost_center_id ?? null,
            accounting_category_id: supplyItem?.accounting_category_id ?? null,
            accounting_subcategory_id: supplyItem?.accounting_subcategory_id ?? null,
            cost_type: supplyItem?.cost_type ?? null,
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
          throw new BadRequestException(`Erro ao inserir itens de rateio financeiro: ${itemsError.message}`);
        }
      }
    }
  }

  private async getDefaultSupplyLocationId() {
    const { data, error } = await this.supabaseService.admin
      .from('stock_locations')
      .select('id')
      .eq('stock_type', 'Insumos')
      .eq('active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new BadRequestException(error.message);
    }

    if (!data?.id) {
      throw new BadRequestException('No active supply stock location found');
    }

    return String(data.id);
  }

  private async selectMany(table: string) {
    const { data, error } = await this.supabaseService.admin.from(table).select('*');

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data ?? [];
  }

  async deletePurchase(id: string) {
    const purchase = await this.getPurchase(id);

    const { data: supplyLots, error: supplyLotsError } = await this.supabaseService.admin
      .from('supply_lots')
      .select('id, received_quantity, available_quantity, supply_item_id')
      .eq('purchase_id', id);

    if (supplyLotsError) {
      throw new BadRequestException(supplyLotsError.message);
    }

    if (supplyLots && supplyLots.length > 0) {
      for (const lot of supplyLots) {
        if (lot.available_quantity < lot.received_quantity) {
          throw new BadRequestException('Não é possível excluir a compra pois os insumos recebidos já foram parcialmente ou totalmente consumidos.');
        }
      }
    }

    if (supplyLots && supplyLots.length > 0) {
      for (const lot of supplyLots) {
        const { data: supplyItem } = await this.supabaseService.admin
          .from('supply_items')
          .select('current_stock')
          .eq('id', lot.supply_item_id)
          .single();
        
        if (supplyItem) {
          await this.supabaseService.admin
            .from('supply_items')
            .update({ current_stock: Number(supplyItem.current_stock) - Number(lot.received_quantity) })
            .eq('id', lot.supply_item_id);
        }
      }

      await this.supabaseService.admin
        .from('stock_movements')
        .delete()
        .eq('reference_table', 'purchases')
        .eq('reference_id', id);

      await this.supabaseService.admin
        .from('supply_lots')
        .delete()
        .eq('purchase_id', id);
    }

    await this.supabaseService.admin
      .from('purchase_items')
      .delete()
      .eq('purchase_id', id);

    await this.supabaseService.admin
      .from('financial_entries')
      .delete()
      .eq('reference_table', 'purchases')
      .eq('reference_id', id);

    const { error: deletePurchaseError } = await this.supabaseService.admin
      .from('purchases')
      .delete()
      .eq('id', id);

    if (deletePurchaseError) {
      throw new BadRequestException(deletePurchaseError.message);
    }

    return { success: true };
  }
}
