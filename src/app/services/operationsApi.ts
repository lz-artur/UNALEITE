import type {
  AnaliseLaboral,
  ContaFinanceira,
  EstoqueProduto,
  LoteLeite,
  OrdemProducao,
  PrecificacaoLeite,
} from '../data/mockData';
import type { SupplyLotStatus } from '../data/cadastrosData';
import {
  analises as mockAnalises,
  calcularEstatisticas,
  contasFinanceiras as mockContasFinanceiras,
  estoquesProdutos as mockEstoquesProdutos,
  lotes as mockLotes,
  ordensProducao as mockOrdensProducao,
  precificacoes as mockPrecificacoes,
} from '../data/mockData';
import { apiRequest, withFallback } from './api';
import { supabase } from '../lib/supabase';
import { loadCadastrosState } from './cadastrosApi';

export interface DashboardStats {
  leiteRecebidoMes: number;
  lotesAprovados: number;
  lotesBloqueados: number;
  analisesPendentes: number;
  opsAbertas: number;
  producaoFinalizada: number;
  custoMedioKg: number;
  ticketMedioCustoKg: number;
  folhaLeite: number;
  contasPagar: number;
  contasReceber: number;
  titulosVencidos: number;
  valorVencido: number;
  insumosAbaixoMinimo: number;
}

export interface SupplyLotInventoryItem {
  id: string;
  supplyItemId: string;
  supplierId?: string;
  supplierLotNumber?: string;
  internalLotCode: string;
  entryDate: Date;
  expirationDate?: Date;
  receivedQuantity: number;
  availableQuantity: number;
  unitCost: number;
  totalValue: number;
  status: SupplyLotStatus;
  supplyItemName?: string;
  supplierName?: string;
  purchaseNumber?: string;
  minimumStock?: number;
  unitId?: string;
}

export type InventorySessionStatus = 'em_contagem' | 'aguardando_aprovacao' | 'concluido';
export type InventoryCountItemStatus = 'nao_contado' | 'confere' | 'aguardando_aprovacao' | 'aprovado' | 'recusado';

export interface InventoryCountItem {
  id: string;
  inventory_session_id: string;
  lot_type: 'Insumo' | 'Produto Acabado';
  lot_id: string;
  product_id: string;
  product_name: string;
  product_code?: string | null;
  lot_code: string;
  unit_symbol?: string | null;
  system_quantity: number;
  counted_quantity?: number | null;
  difference_quantity?: number | null;
  notes?: string | null;
  status: InventoryCountItemStatus;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  reviewed_by_name?: string | null;
  review_note?: string | null;
}

export interface InventoryAuditLog {
  id: string;
  inventory_session_id: string;
  inventory_count_item_id?: string | null;
  action: string;
  actor_name: string;
  details: Record<string, unknown>;
  created_at: string;
}

export interface InventorySessionSummary {
  id: string;
  title: string;
  status: InventorySessionStatus;
  created_by: string;
  created_by_name: string;
  started_at: string;
  submitted_at?: string | null;
  completed_at?: string | null;
  total_items: number;
  pending_items: number;
  divergent_items: number;
}

export interface InventorySession extends Omit<InventorySessionSummary, 'total_items' | 'pending_items' | 'divergent_items'> {
  items: InventoryCountItem[];
  logs: InventoryAuditLog[];
}

export interface SaleExpeditionSummary {
  id: string;
  sales_order_id: string;
  expedition_number: string;
  status: 'em_pesagem' | 'expedida' | 'cancelada';
  created_at: string;
  dispatched_at?: string | null;
  order_number: string;
  client_name: string;
}

export interface SaleExpedition {
  id: string;
  sales_order_id: string;
  expedition_number: string;
  status: 'em_pesagem' | 'expedida' | 'cancelada';
  created_at: string;
  dispatched_at?: string | null;
  order: {
    id: string;
    number: string;
    client_name: string;
    status: string;
    items: Array<{
      id: string;
      product_id: string;
      product_name: string;
      product_code?: string | null;
      unit_id?: string | null;
      ordered_quantity: number;
      fulfilled_quantity: number;
      pending_quantity: number;
      lines: Array<{
        id: string;
        finished_product_lot_id: string;
        lot?: { id: string; lot_code: string; available_quantity: number };
        weighed_quantity: number;
        weighings: Array<{ id: string; quantity: number; weighed_at: string; notes?: string | null }>;
      }>;
    }>;
  };
  logs: Array<{ id: string; action: string; actor_name: string; created_at: string }>;
}

export interface PurchaseItemRecord {
  id: string;
  supplyItemId: string;
  supplyItemName: string;
  unitId?: string;
  orderedQuantity: number;
  receivedQuantity: number;
  pendingQuantity: number;
  unitCost: number;
  totalValue: number;
  status: string;
  tracksExpiration: boolean;
  tracksLot: boolean;
}

export interface PurchaseRecord {
  id: string;
  number: string;
  supplierId: string;
  supplierName: string;
  purchaseDate: Date;
  dueDate: Date;
  status: string;
  totalAmount: number;
  notes?: string;
  paymentMethodId?: string;
  paymentTypeId?: string;
  costCenterId?: string;
  accountingCategoryId?: string;
  accountingSubcategoryId?: string;
  bankAccountId?: string;
  items: PurchaseItemRecord[];
}

export interface PurchaseInstallment {
  dueDate: string;
  amount: number;
}

export interface CreatePurchasePayload {
  supplierId: string;
  purchaseDate: string;
  dueDate?: string;
  notes?: string;
  paymentMethodId?: string;
  paymentTypeId?: string;
  costCenterId?: string;
  accountingCategoryId?: string;
  accountingSubcategoryId?: string;
  bankAccountId?: string;
  installments?: PurchaseInstallment[];
  items: Array<{
    supplyItemId: string;
    quantity: number;
    unitCost: number;
  }>;
}

export interface PurchaseFilters {
  supplierId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}

export interface ClientRecord {
  id: string;
  code?: string;
  name: string;
  tradeName?: string;
  document: string;
  stateRegistration?: string;
  phone?: string;
  email?: string;
  address?: string;
  addressNumber?: string;
  addressComplement?: string;
  neighborhood?: string;
  cep?: string;
  city?: string;
  cityCode?: string;
  state?: string;
  countryCode?: string;
  countryName?: string;
  ieIndicator?: string;
  finalConsumer?: boolean;
  notes?: string;
  active: boolean;
  credit_balance?: number;
}

export interface SalesOrderItemFulfillmentRecord {
  id: string;
  finishedProductLotId: string;
  lotCode: string;
  quantity: number;
  returnedQuantity?: number;
  fulfilledAt: Date;
  attendanceId?: string | null;
}

export interface SalesOrderItemRecord {
  id: string;
  productId: string;
  productName: string;
  unitId?: string;
  orderedQuantity: number;
  fulfilledQuantity: number;
  pendingQuantity: number;
  unitPrice: number;
  totalValue: number;
  status: string;
  fulfillments: SalesOrderItemFulfillmentRecord[];
}

export interface AttendanceItemRecord {
  id: string;
  salesOrderItemId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalValue: number;
}

export interface AttendanceRecord {
  id: string;
  attendanceNumber: string;
  fulfilledAt: Date;
  totalValue: number;
  status: string;
  notes?: string | null;
  items: AttendanceItemRecord[];
}

export interface SalesOrderRecord {
  id: string;
  number: string;
  clientId: string;
  clientName: string;
  clientDocument?: string;
  orderDate: Date;
  dueDate: Date;
  deliveryDate?: Date;
  status: string;
  totalAmount: number;
  notes?: string;
  hasReturn?: boolean;
  items: SalesOrderItemRecord[];
  attendances: AttendanceRecord[];
  totalFulfilled: number;
  remainingAmount: number;
  fulfilledPercent: number;
}

export interface SalesOrderFilters {
  clientId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}

export interface FinancialEntryRecord extends ContaFinanceira {
  referenceTable?: string;
  referenceId?: string;
  statusCalculado?: 'Aberto' | 'Parcial' | 'Pago' | 'Vencido' | 'Cancelado';
  valorRecebido: number;
  saldoReceber: number;
  recebimentos: FinancialReceiptRecord[];
}

export interface FinancialReceiptRecord {
  id: string;
  valor: number;
  dataPagamento: Date;
  formaPagamento: string;
  contaBancariaId?: string;
  anexoUrl?: string;
  observacoes?: string;
}

export interface CreateFinancialReceiptPayload {
  valor: number;
  dataPagamento: string;
  formaPagamento: string;
  contaBancariaId?: string;
  anexoUrl?: string;
  observacoes?: string;
}

export interface FinancialEntryFilters {
  type?: 'Pagar' | 'Receber';
  status?: 'Aberto' | 'Parcial' | 'Pago' | 'Vencido' | 'Cancelado';
  category?: string;
  producerId?: string;
  startDate?: string;
  endDate?: string;
}

export interface MilkPayrollSummary {
  period: {
    startDate: string | null;
    endDate: string | null;
  };
  totals: {
    producersCount: number;
    lotsCount: number;
    totalValue: number;
    totalVolumeLiters: number;
    averagePricePerLiter: number;
  };
  producers: Array<{
    producerId: string;
    producerName: string;
    producerCode: string;
    lotsCount: number;
    totalVolumeLiters: number;
    totalValue: number;
    averagePricePerLiter: number;
  }>;
}

export interface MilkPayrollProducerDetail {
  period: {
    startDate: string | null;
    endDate: string | null;
  };
  producer: {
    id: string;
    code: string;
    name: string;
  };
  totals: {
    lotsCount: number;
    totalVolumeLiters: number;
    totalValue: number;
    averagePricePerLiter: number;
  };
  lots: Array<{
    lotId: string;
    lotCode: string;
    receivedAt: string;
    status: string;
    volumeLiters: number;
    finalPrice: number;
    totalValue: number;
  }>;
}

export interface MilkLotDetail {
  lot: LoteLeite;
  reception?: {
    carPlate?: string;
    driverName?: string;
    analystName?: string;
    observations?: string;
  };
  analysis?: AnaliseLaboral;
  pricing?: PrecificacaoLeite;
  blockEvents: Array<{
    id: string;
    reasonSnapshot?: string;
    notes?: string;
    createdAt?: Date;
  }>;
  milkConsumptions: Array<{
    id: string;
    productionOrderId: string;
    litersConsumed: number;
    createdAt?: Date;
  }>;
  productionOrders: OrdemProducao[];
  finishedProductLots: EstoqueProduto[];
}

export interface ProductionReportResponse {
  period: {
    startDate: string | null;
    endDate: string | null;
  };
  totals: {
    ordersCount: number;
    litersPlanned: number;
    expectedYield: number;
    actualQuantityProduced: number;
    totalCost: number;
    costPerKg: number;
  };
  rows: Array<{
    orderId: string;
    orderNumber: string;
    productId: string;
    productName: string;
    milkLotId: string;
    milkLotCode: string;
    litersPlanned: number;
    expectedYield: number;
    actualQuantityProduced: number;
    actualYield: number;
    yieldDelta: number;
    productLotId: string;
    productLotCode: string;
    yieldInputTotal: number;
    milkLiters: number;
    reprocessedQuantity: number;
    creamQuantity: number;
    milkCost: number;
    suppliesCost: number;
    creamCost: number;
    reprocessingCost: number;
    totalCost: number;
    costPerKg: number;
    inputs: Array<{
      name: string;
      lotCode: string;
      quantity: number;
      unitCost: number;
      totalCost: number;
      category: 'Insumo' | 'Creme' | 'Reprocessamento';
    }>;
    status: string;
    startedAt: string;
    finishedAt: string | null;
  }>;
}

export interface QualityReportResponse {
  period: {
    startDate: string | null;
    endDate: string | null;
  };
  totals: {
    analysesCount: number;
    approvedCount: number;
    blockedCount: number;
    averageFat: number;
    averageProtein: number;
  };
  rows: Array<{
    analysisId: string;
    analyzedAt: string;
    lotId: string;
    lotCode: string;
    producerId: string;
    producerName: string;
    approved: boolean;
    status: string;
    alizarol: string;
    antibioticos: string;
    gordura: number;
    proteina: number;
    acidez: number;
    cbt: number;
    ccs: number;
  }>;
}

export interface PricingReportResponse {
  period: {
    startDate: string | null;
    endDate: string | null;
  };
  totals: {
    pricingsCount: number;
    totalVolumeLiters: number;
    totalValue: number;
    averageFinalPrice: number;
  };
  rows: Array<{
    pricingId: string;
    createdAt: string;
    lotId: string;
    lotCode: string;
    producerId: string;
    producerName: string;
    lotStatus: string;
    volumeLiters: number;
    basePrice: number;
    finalPrice: number;
    totalValue: number;
    fatBonus: number;
    proteinBonus: number;
    acidityPenalty: number;
    cbtPenalty: number;
    ccsPenalty: number;
  }>;
}

export interface DreReportResponse {
  period: {
    startDate: string | null;
    endDate: string | null;
  };
  basis: 'cash' | 'accrual';
  totals: {
    totalRevenue: number;
    totalExpense: number;
    netIncome: number;
  };
  revenues: Array<{
    category: string;
    amount: number;
  }>;
  expenses: Array<{
    category: string;
    amount: number;
  }>;
}

function mapMilkLot(row: any): LoteLeite {
  return {
    id: row.id,
    codigo: row.code,
    produtorId: row.producer_id,
    rotaId: row.route_id,
    transportadorId: row.transporter_id,
    volumeLitros: Number(row.volume_liters),
    volumeDisponivel: Number(row.available_volume_liters),
    temperatura: Number(row.temperature),
    dataHoraRecebimento: new Date(row.received_at),
    status: row.status,
    motivoBloqueio: row.reason_snapshot ?? undefined,
    analiseId: row.latest_analysis_id ?? undefined,
    custoLitro: row.cost_per_liter != null ? Number(row.cost_per_liter) : undefined,
    valorTotal: row.total_value != null ? Number(row.total_value) : undefined,
  };
}

export interface SalesReportResponse {
  period: {
    startDate: string | null;
    endDate: string | null;
  };
  totals: {
    salesCount: number;
    totalQuantity: number;
    totalSaleValue: number;
    totalCost: number;
    grossMargin: number;
    invoicedValue: number;
  };
  rows: Array<{
    fulfillmentId: string;
    fulfilledAt: string;
    orderId: string;
    orderNumber: string;
    clientId: string;
    clientName: string;
    clientDocument: string;
    sellerName: string;
    invoiced: boolean;
    invoiceStatus: string;
    invoiceNumber: number | null;
    productId: string;
    productName: string;
    productLotCode: string;
    grossQuantity: number;
    returnedQuantity: number;
    quantity: number;
    unitPrice: number;
    saleValue: number;
    costValue: number;
    grossMargin: number;
  }>;
}

function mapAnalysis(row: any): AnaliseLaboral {
  return {
    id: row.id,
    loteId: row.milk_lot_id,
    dataAnalise: new Date(row.analyzed_at),
    alizarol: row.alizarol,
    acidez: Number(row.acidez),
    crioscopia: Number(row.crioscopia),
    densidade: Number(row.densidade),
    antibioticos: row.antibioticos,
    gordura: row.gordura != null ? Number(row.gordura) : undefined,
    proteina: row.proteina != null ? Number(row.proteina) : undefined,
    alcool: row.alcool ?? undefined,
    ph: row.ph != null ? Number(row.ph) : undefined,
    porcentagem_agua: row.porcentagem_agua != null ? Number(row.porcentagem_agua) : undefined,
    est: row.est != null ? Number(row.est) : undefined,
    redutase: row.redutase ?? undefined,
    aprovado: Boolean(row.approved),
    observacoes: row.observacoes ?? undefined,
    subanalyses: row.subanalyses ? row.subanalyses
      .sort((a: any, b: any) => (a.compartment_number || 0) - (b.compartment_number || 0))
      .map((sub: any) => ({
        alizarol: sub.alizarol,
        acidez: sub.acidez != null ? Number(sub.acidez) : undefined,
        crioscopia: sub.crioscopia != null ? Number(sub.crioscopia) : undefined,
        densidade: sub.densidade != null ? Number(sub.densidade) : undefined,
        antibioticos: sub.antibioticos,
        gordura: sub.gordura != null ? Number(sub.gordura) : undefined,
        proteina: sub.proteina != null ? Number(sub.proteina) : undefined,
        alcool: sub.alcool ?? undefined,
        ph: sub.ph != null ? Number(sub.ph) : undefined,
        porcentagem_agua: sub.porcentagem_agua != null ? Number(sub.porcentagem_agua) : undefined,
        est: sub.est != null ? Number(sub.est) : undefined,
        esd: sub.esd != null ? Number(sub.esd) : undefined,
        redutase: sub.redutase ?? undefined,
        aprovado: Boolean(sub.approved),
        observacoes: sub.observacoes ?? undefined,
      })) : [],
  };
}

function mapPricing(row: any): PrecificacaoLeite {
  return {
    produtorId: row.producer_id,
    loteId: row.milk_lot_id,
    precoBase: Number(row.base_price),
    bonusGordura: Number(row.fat_bonus),
    bonusProteina: Number(row.protein_bonus),
    penalizacaoAcidez: Number(row.acidity_penalty),
    penalizacaoCBT: Number(row.cbt_penalty),
    penalizacaoCCS: Number(row.ccs_penalty),
    penalizacaoTemperatura: Number(row.temperature_penalty),
    precoFinal: Number(row.final_price),
    valorTotal: Number(row.total_value),
  };
}

function mapProductionOrder(row: any): OrdemProducao {
  return {
    id: row.id,
    numero: row.order_number,
    loteLeiteId: row.milk_lot_id,
    produtoId: row.product_id,
    litrosUtilizados: Number(row.liters_planned),
    dataInicio: new Date(row.started_at),
    dataFinalizacao: row.finished_at ? new Date(row.finished_at) : undefined,
    status: row.status,
    quantidadeProduzida: row.actual_quantity_produced != null ? Number(row.actual_quantity_produced) : undefined,
    rendimentoReal: row.actual_yield != null ? Number(row.actual_yield) : undefined,
    insumos: (row.production_order_supply_consumptions ?? []).map((c: any) => ({
      insumoId: c.supply_lots?.supply_item_id ?? c.supply_lot_id,
      supplyLotId: c.supply_lot_id,
      quantidade: Number(c.quantity_consumed),
    })),
    produtosAcabadosConsumidos: (row.production_order_finished_product_consumptions ?? []).map((c: any) => {
      // Supabase returns a related row as an object, but some relation settings
      // return it as a one-item array. Supporting both preserves the product
      // when an existing OP is opened again for editing.
      const productLot = Array.isArray(c.finished_product_lots)
        ? c.finished_product_lots[0]
        : c.finished_product_lots;

      return {
        finishedProductLotId: c.finished_product_lot_id,
        produtoId: productLot?.product_id,
        quantidade: Number(c.quantity_consumed),
        origem: c.consumption_source === 'Devolucao' ? 'Devolucao' : 'Disponivel',
      };
    }),
  };
}

function mapFinishedProductLot(row: any): EstoqueProduto {
  return {
    id: row.id,
    produtoId: row.product_id,
    ordemProducaoId: row.production_order_id,
    quantidade: Number(row.quantity_produced),
    dataProducao: new Date(row.produced_at),
    dataValidade: new Date(row.expiration_date),
    lote: row.lot_code,
    disponivel: Number(row.available_quantity),
    devolvido: Number(row.returned_quantity) || 0,
  };
}

function mapSupplyLot(row: any): SupplyLotInventoryItem {
  return {
    id: row.id,
    supplyItemId: row.supply_item_id,
    supplierId: row.supplier_id ?? undefined,
    supplierLotNumber: row.supplier_lot_number ?? undefined,
    internalLotCode: row.internal_lot_code,
    entryDate: new Date(row.entry_date),
    expirationDate: row.expiration_date ? new Date(row.expiration_date) : undefined,
    receivedQuantity: Number(row.received_quantity),
    availableQuantity: Number(row.available_quantity),
    unitCost: Number(row.unit_cost),
    totalValue: Number(row.total_value),
    status: row.status,
    supplyItemName: row.supply_item_name ?? undefined,
    supplierName: row.supplier_name ?? undefined,
    purchaseNumber: row.purchase_number ?? undefined,
    minimumStock: row.minimum_stock != null ? Number(row.minimum_stock) : undefined,
    unitId: row.unit_id ?? undefined,
  };
}

function mapPurchase(row: any): PurchaseRecord {
  return {
    id: row.id,
    number: row.number,
    supplierId: row.supplierId,
    supplierName: row.supplierName,
    purchaseDate: new Date(row.purchaseDate),
    dueDate: new Date(row.dueDate),
    status: row.status,
    totalAmount: Number(row.totalAmount),
    notes: row.notes ?? undefined,
    paymentMethodId: row.paymentMethodId ?? undefined,
    paymentTypeId: row.paymentTypeId ?? undefined,
    costCenterId: row.costCenterId ?? undefined,
    accountingCategoryId: row.accountingCategoryId ?? undefined,
    accountingSubcategoryId: row.accountingSubcategoryId ?? undefined,
    bankAccountId: row.bankAccountId ?? undefined,
    items: (row.items ?? []).map((item: any) => ({
      id: item.id,
      supplyItemId: item.supplyItemId,
      supplyItemName: item.supplyItemName,
      unitId: item.unitId ?? undefined,
      orderedQuantity: Number(item.orderedQuantity),
      receivedQuantity: Number(item.receivedQuantity),
      pendingQuantity: Number(item.pendingQuantity),
      unitCost: Number(item.unitCost),
      totalValue: Number(item.totalValue),
      status: item.status,
      tracksExpiration: Boolean(item.tracksExpiration),
      tracksLot: Boolean(item.tracksLot),
    })),
  };
}

function mapClient(row: any): ClientRecord {
  return {
    id: row.id,
    code: row.code ?? undefined,
    name: row.name,
    tradeName: row.trade_name ?? row.tradeName ?? undefined,
    document: row.document,
    stateRegistration: row.state_registration ?? row.stateRegistration ?? undefined,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    address: row.address ?? undefined,
    addressNumber: row.address_number ?? undefined,
    addressComplement: row.address_complement ?? undefined,
    neighborhood: row.neighborhood ?? undefined,
    cep: row.cep ?? undefined,
    city: row.city ?? undefined,
    cityCode: row.city_code ?? undefined,
    state: row.state ?? undefined,
    countryCode: row.country_code ?? undefined,
    countryName: row.country_name ?? undefined,
    ieIndicator: row.ie_indicator ?? undefined,
    finalConsumer: row.final_consumer ?? undefined,
    notes: row.notes ?? undefined,
    active: Boolean(row.active),
    credit_balance: Number(row.credit_balance || row.creditBalance || 0),
  };
}

function mapSalesOrder(row: any): SalesOrderRecord {
  return {
    id: row.id,
    number: row.number,
    clientId: row.clientId,
    clientName: row.clientName,
    clientDocument: row.clientDocument ?? undefined,
    orderDate: new Date(row.orderDate),
    dueDate: new Date(row.dueDate),
    deliveryDate: row.deliveryDate ? new Date(row.deliveryDate) : undefined,
    status: row.status,
    totalAmount: Number(row.totalAmount),
    notes: row.notes ?? undefined,
    hasReturn: row.hasReturn,
    items: (row.items ?? []).map((item: any) => ({
      id: item.id,
      productId: item.productId,
      productName: item.productName,
      unitId: item.unitId ?? undefined,
      orderedQuantity: Number(item.orderedQuantity),
      fulfilledQuantity: Number(item.fulfilledQuantity),
      pendingQuantity: Number(item.pendingQuantity),
      unitPrice: Number(item.unitPrice),
      totalValue: Number(item.totalValue),
      status: item.status,
      fulfillments: (item.fulfillments ?? []).map((fulfillment: any) => ({
        id: fulfillment.id,
        finishedProductLotId: fulfillment.finishedProductLotId,
        lotCode: fulfillment.lotCode,
        quantity: Number(fulfillment.quantity),
        returnedQuantity: Number(fulfillment.returnedQuantity || 0),
        fulfilledAt: new Date(fulfillment.fulfilledAt),
        attendanceId: fulfillment.attendanceId ?? null,
      })),
    })),
    attendances: (row.attendances ?? []).map((a: any) => ({
      id: a.id,
      attendanceNumber: a.attendanceNumber,
      fulfilledAt: new Date(a.fulfilledAt),
      totalValue: Number(a.totalValue),
      status: a.status,
      notes: a.notes ?? null,
      items: (a.items ?? []).map((ai: any) => ({
        id: ai.id,
        salesOrderItemId: ai.salesOrderItemId,
        productName: ai.productName,
        quantity: Number(ai.quantity),
        unitPrice: Number(ai.unitPrice),
        totalValue: Number(ai.totalValue),
      })),
    })),
    totalFulfilled: Number(row.totalFulfilled ?? 0),
    remainingAmount: Number(row.remainingAmount ?? 0),
    fulfilledPercent: Number(row.fulfilledPercent ?? 0),
  };
}

function mapFinancialEntry(row: any): FinancialEntryRecord {
  const recebimentos: FinancialReceiptRecord[] = (row.financial_entry_receipts ?? []).map((receipt: any) => ({
    id: receipt.id,
    valor: Number(receipt.amount),
    dataPagamento: new Date(receipt.payment_date),
    formaPagamento: receipt.payment_method,
    contaBancariaId: receipt.bank_account_id ?? undefined,
    anexoUrl: receipt.attachment_url ?? undefined,
    observacoes: receipt.notes ?? undefined,
  }));
  const valor = Number(row.amount);
  const valorRecebido = Number(row.received_amount ?? recebimentos.reduce((sum, receipt) => sum + receipt.valor, 0));
  const saldoReceber = Number(row.outstanding_amount ?? Math.max(0, valor - valorRecebido));

  return {
    id: row.id,
    tipo: row.entry_type,
    descricao: row.description,
    valor,
    dataVencimento: new Date(row.due_date),
    dataPagamento: row.last_payment_date
      ? new Date(row.last_payment_date)
      : row.payment_date
        ? new Date(row.payment_date)
        : undefined,
    status: row.status,
    categoria: row.category,
    fornecedorId: row.supplier_id ?? undefined,
    clienteId: row.client_id ?? undefined,
    produtorId: row.producer_id ?? undefined,
    referenceTable: row.reference_table ?? undefined,
    referenceId: row.reference_id ?? undefined,
    statusCalculado: row.computed_status ?? row.status,
    centroCusto: row.cost_center ?? undefined,
    costCenterId: row.cost_center_id ?? undefined,
    subcategoriaContabil: row.accounting_subcategory ?? undefined,
    accountingCategoryId: row.accounting_category_id ?? undefined,
    accountingSubcategoryId: row.accounting_subcategory_id ?? undefined,
    formaPagamento: row.payment_method ?? undefined,
    tipoPagamento: row.payment_type ?? undefined,
    anexoUrl: row.attachment_url ?? undefined,
    anexosUrls: row.attachment_urls ?? undefined,
    installmentGroupId: row.installment_group_id ?? undefined,
    installmentNumber: row.installment_number ?? undefined,
    tipoCusto: row.cost_type ?? undefined,
    contaBancariaId: row.bank_account_id ?? undefined,
    valorRecebido,
    saldoReceber,
    recebimentos,
  };
}

export async function loadDashboardStats(): Promise<DashboardStats> {
  const numeric = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  return withFallback(async () => {
    const summary = await apiRequest<any>('/dashboard/summary');
    return {
      leiteRecebidoMes: numeric(summary.milkReceivedMonth),
      lotesAprovados: numeric(summary.approvedLots),
      lotesBloqueados: numeric(summary.blockedLots),
      opsAbertas: numeric(summary.openOrders),
      producaoFinalizada: numeric(summary.finishedOrders),
      custoMedioKg: numeric(summary.averageCostPerLiter),
      ticketMedioCustoKg: numeric(summary.averageCostPerKg),
      folhaLeite: numeric(summary.milkPayroll),
      contasPagar: numeric(summary.accountsPayable),
      contasReceber: numeric(summary.accountsReceivable),
      analisesPendentes: numeric(summary.pendingAnalysisCount),
      titulosVencidos: numeric(summary.overdueEntries),
      valorVencido: numeric(summary.overdueAmount),
      insumosAbaixoMinimo: numeric(summary.lowStockItemsCount),
    };
  }, () => {
    const fallback = calcularEstatisticas();
    return {
      ...fallback,
      ticketMedioCustoKg: numeric(fallback.ticketMedioCustoKg),
      analisesPendentes: 0,
      titulosVencidos: 0,
      valorVencido: 0,
      insumosAbaixoMinimo: 0,
    };
  });
}

export async function loadMilkLots() {
  return withFallback(async () => {
    const lots = await apiRequest<any[]>('/milk-lots');
    return lots.map(mapMilkLot);
  }, () => mockLotes);
}

export async function loadMilkAnalyses() {
  return withFallback(async () => {
    const analyses = await apiRequest<any[]>('/milk-lot-analyses');
    return analyses.map(mapAnalysis);
  }, () => mockAnalises);
}

export async function loadMilkPricings() {
  return withFallback(async () => {
    const pricings = await apiRequest<any[]>('/milk-lot-pricings');
    return pricings.map(mapPricing);
  }, () => mockPrecificacoes);
}

export async function createMilkReception(payload: {
  producerId: string;
  routeId: string;
  transporterId: string;
  volumeLiters: number;
  temperatura: number;
  pricePerLiter: number;
  receivedAt: string;
  carPlate?: string;
  driverName?: string;
  analystName?: string;
  observations?: string;
}) {
  return apiRequest<{ lot: any }>('/milk-receptions', {
    method: 'POST',
    body: JSON.stringify(payload),
  }).then((result) => mapMilkLot(result.lot));
}

export async function updateMilkReception(milkLotId: string, payload: Partial<{
  producerId: string;
  routeId: string;
  transporterId: string;
  volumeLiters: number;
  temperatura: number;
  pricePerLiter: number;
  receivedAt: string;
  carPlate: string;
  driverName: string;
  analystName: string;
  observations: string;
}>) {
  return apiRequest<{ lot: any }>(`/milk-lots/${milkLotId}/reception`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }).then((result) => mapMilkLot(result.lot));
}

export async function createMilkAnalysis(milkLotId: string, payload: Record<string, unknown>) {
  return apiRequest<{ lot: any; analysis: any; pricing: any }>(`/milk-lots/${milkLotId}/analysis`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }).then((result) => ({
    lot: mapMilkLot(result.lot),
    analysis: mapAnalysis(result.analysis),
    pricing: result.pricing ? mapPricing(result.pricing) : undefined,
  }));
}

export async function loadMilkLotDetail(milkLotId: string): Promise<MilkLotDetail> {
  const result = await apiRequest<any>(`/milk-lots/${milkLotId}`);

  return {
    lot: mapMilkLot(result.lot),
    reception: result.reception ? {
      carPlate: result.reception.car_plate ?? undefined,
      driverName: result.reception.driver_name ?? undefined,
      analystName: result.reception.analyst_name ?? undefined,
      observations: result.reception.observations ?? undefined,
    } : undefined,
    analysis: result.analysis ? mapAnalysis(result.analysis) : undefined,
    pricing: result.pricing ? mapPricing(result.pricing) : undefined,
    blockEvents: (result.blockEvents ?? []).map((event: any) => ({
      id: event.id,
      reasonSnapshot: event.reason_snapshot ?? undefined,
      notes: event.notes ?? undefined,
      createdAt: event.created_at ? new Date(event.created_at) : undefined,
    })),
    milkConsumptions: (result.milkConsumptions ?? []).map((consumption: any) => ({
      id: consumption.id,
      productionOrderId: consumption.production_order_id,
      litersConsumed: Number(consumption.liters_consumed),
      createdAt: consumption.created_at ? new Date(consumption.created_at) : undefined,
    })),
    productionOrders: (result.productionOrders ?? []).map(mapProductionOrder),
    finishedProductLots: (result.finishedProductLots ?? []).map(mapFinishedProductLot),
  };
}

export async function loadProductionOrders() {
  return withFallback(async () => {
    const orders = await apiRequest<any[]>('/production-orders');
    return orders.map(mapProductionOrder);
  }, () => mockOrdensProducao);
}

export async function createProductionOrder(payload: {
  milkLotId: string;
  productId: string;
  litersToUse: number;
  supplyConsumptions?: Array<{ supplyItemId?: string; supplyLotId?: string; quantity: number }>;
  finishedProductConsumptions?: Array<{ finishedProductId?: string; finishedProductLotId?: string; source?: 'Disponivel' | 'Devolucao'; quantity: number }>;
}) {
  return apiRequest<{ order: any }>('/production-orders', {
    method: 'POST',
    body: JSON.stringify(payload),
  }).then((result) => mapProductionOrder(result.order));
}

export async function updateProductionOrder(orderId: string, payload: {
  milkLotId?: string;
  productId?: string;
  litersToUse?: number;
  actualQuantityProduced?: number;
  supplyConsumptions?: Array<{ supplyItemId?: string; supplyLotId?: string; quantity: number }>;
  finishedProductConsumptions?: Array<{ finishedProductId?: string; finishedProductLotId?: string; source?: 'Disponivel' | 'Devolucao'; quantity: number }>;
}) {
  return apiRequest<{ order: any }>(`/production-orders/${orderId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }).then((result) => mapProductionOrder(result.order));
}

export async function completeProductionOrder(payload: {
  orderId: string;
  actualQuantityProduced: number;
  supplyConsumptions?: Array<{ supplyItemId?: string; supplyLotId?: string; quantity: number }>;
  finishedProductConsumptions?: Array<{ finishedProductId?: string; finishedProductLotId?: string; source?: 'Disponivel' | 'Devolucao'; quantity: number }>;
  generatedCoProducts?: Array<{ productId: string; quantity: number }>;
}) {
  return apiRequest<{ order: any; productLot: any }>(`/production-orders/${payload.orderId}/complete`, {
    method: 'POST',
    body: JSON.stringify({
      actualQuantityProduced: payload.actualQuantityProduced,
      supplyConsumptions: payload.supplyConsumptions,
      finishedProductConsumptions: payload.finishedProductConsumptions,
      generatedCoProducts: payload.generatedCoProducts,
    }),
  }).then((result) => ({
    order: mapProductionOrder(result.order),
    productLot: mapFinishedProductLot(result.productLot),
  }));
}

export async function loadSupplyLots() {
  const lots = await withFallback(async () => {
    const response = await apiRequest<any[]>('/inventory/supply-lots');
    return response.map(mapSupplyLot);
  }, async () => {
    const state = await loadCadastrosState();
    return state.supplyLots.map((lot) => ({
      id: lot.id,
      supplyItemId: lot.supplyItemId,
      supplierId: lot.supplierId,
      supplierLotNumber: lot.supplierLotNumber,
      internalLotCode: lot.internalLotCode,
      entryDate: new Date(lot.entryDate),
      expirationDate: lot.expirationDate ? new Date(lot.expirationDate) : undefined,
      receivedQuantity: lot.receivedQuantity,
      availableQuantity: lot.availableQuantity,
      unitCost: lot.unitCost,
      totalValue: lot.totalValue,
      status: lot.status,
      supplyItemName: state.supplyItems.find((i) => i.id === lot.supplyItemId)?.name,
      supplierName: state.suppliers.find((s) => s.id === lot.supplierId)?.name,
      unitId: state.supplyItems.find((i) => i.id === lot.supplyItemId)?.unitId,
      minimumStock: state.supplyItems.find((i) => i.id === lot.supplyItemId)?.minimumStock,
    }));
  });

  return lots;
}

export async function adjustSupplyLotStock(id: string, newAvailableQuantity: number, oldAvailableQuantity: number, oldReceivedQuantity: number) {
  const difference = newAvailableQuantity - oldAvailableQuantity;
  const newReceivedQuantity = oldReceivedQuantity + difference;
  
  let status = 'Disponivel';
  if (newAvailableQuantity === 0) {
    status = 'Totalmente Utilizado';
  } else if (newAvailableQuantity < newReceivedQuantity) {
    status = 'Parcialmente Utilizado';
  }

  return apiRequest<any>(`/cadastros/supplyLots/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      available_quantity: newAvailableQuantity,
      received_quantity: newReceivedQuantity,
      status: status,
    }),
  });
}

export async function loadFinishedProductLots(options?: { requireLive?: boolean }) {
  const loader = async () => {
    const lots = await apiRequest<any[]>('/inventory/finished-product-lots');
    return lots.map(mapFinishedProductLot);
  };
  return options?.requireLive ? loader() : withFallback(loader, () => mockEstoquesProdutos);
}

export function loadInventorySessions(): Promise<InventorySessionSummary[]> {
  return apiRequest<InventorySessionSummary[]>('/inventory/counts');
}

export function loadInventorySession(id: string): Promise<InventorySession> {
  return apiRequest<InventorySession>(`/inventory/counts/${id}`);
}

export function createInventorySession(title?: string): Promise<InventorySession> {
  return apiRequest<InventorySession>('/inventory/counts', {
    method: 'POST',
    body: JSON.stringify({ title: title?.trim() || undefined }),
  });
}

export function saveInventoryCounts(
  sessionId: string,
  items: Array<{ id: string; countedQuantity: number; notes?: string }>,
): Promise<InventorySession> {
  return apiRequest<InventorySession>(`/inventory/counts/${sessionId}/save`, {
    method: 'POST',
    body: JSON.stringify({ items }),
  });
}

export function submitInventorySession(
  sessionId: string,
  items: Array<{ id: string; countedQuantity: number; notes?: string }>,
): Promise<InventorySession> {
  return apiRequest<InventorySession>(`/inventory/counts/${sessionId}/submit`, {
    method: 'POST',
    body: JSON.stringify({ items }),
  });
}

export function approveInventoryCountItem(sessionId: string, itemId: string, note?: string) {
  return apiRequest<{ session: InventorySession }>(`/inventory/counts/${sessionId}/items/${itemId}/approve`, {
    method: 'POST',
    body: JSON.stringify({ note: note?.trim() || undefined }),
  });
}

export function rejectInventoryCountItem(sessionId: string, itemId: string, note?: string): Promise<InventorySession> {
  return apiRequest<InventorySession>(`/inventory/counts/${sessionId}/items/${itemId}/reject`, {
    method: 'POST',
    body: JSON.stringify({ note: note?.trim() || undefined }),
  });
}

export function loadSaleExpeditions(): Promise<SaleExpeditionSummary[]> {
  return apiRequest<SaleExpeditionSummary[]>('/inventory/expeditions');
}

export function loadSaleExpedition(id: string): Promise<SaleExpedition> {
  return apiRequest<SaleExpedition>(`/inventory/expeditions/${id}`);
}

export function createSaleExpedition(salesOrderId: string): Promise<SaleExpedition> {
  return apiRequest<SaleExpedition>('/inventory/expeditions', { method: 'POST', body: JSON.stringify({ salesOrderId }) });
}

export function addExpeditionWeighing(payload: { expeditionId: string; salesOrderItemId: string; finishedProductLotId: string; quantity: number; notes?: string }): Promise<SaleExpedition> {
  return apiRequest<SaleExpedition>(`/inventory/expeditions/${payload.expeditionId}/weighings`, {
    method: 'POST',
    body: JSON.stringify({ salesOrderItemId: payload.salesOrderItemId, finishedProductLotId: payload.finishedProductLotId, quantity: payload.quantity, notes: payload.notes }),
  });
}

export function deleteExpeditionWeighing(expeditionId: string, weighingId: string): Promise<SaleExpedition> {
  return apiRequest<SaleExpedition>(`/inventory/expeditions/${expeditionId}/weighings/${weighingId}`, { method: 'DELETE' });
}

export function confirmSaleExpedition(expeditionId: string): Promise<SaleExpedition> {
  return apiRequest<SaleExpedition>(`/inventory/expeditions/${expeditionId}/confirm`, { method: 'POST', body: JSON.stringify({}) });
}

export async function loadFinancialEntries(filters?: FinancialEntryFilters) {
  return withFallback(async () => {
    const params = new URLSearchParams();
    if (filters?.type) params.set('type', filters.type);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.category) params.set('category', filters.category);
    if (filters?.producerId) params.set('producerId', filters.producerId);
    if (filters?.startDate) params.set('startDate', filters.startDate);
    if (filters?.endDate) params.set('endDate', filters.endDate);
    const query = params.toString();
    const entries = await apiRequest<any[]>(`/financial-entries${query ? `?${query}` : ''}`);
    return entries.map(mapFinancialEntry);
  }, () => mockContasFinanceiras.map((entry) => {
    const isPaid = entry.status === 'Pago';
    return {
      ...entry,
      statusCalculado: entry.status,
      valorRecebido: isPaid ? entry.valor : 0,
      saldoReceber: isPaid ? 0 : entry.valor,
      recebimentos: [],
    } as FinancialEntryRecord;
  }));
}

export async function loadFinancialEntry(id: string) {
  return apiRequest<any>(`/financial-entries/${id}`).then(mapFinancialEntry);
}

export async function settleFinancialEntry(entryId: string, paymentDate?: string, attachmentUrl?: string) {
  return apiRequest<any>(`/financial-entries/${entryId}/settle`, {
    method: 'POST',
    body: JSON.stringify({ paymentDate, attachmentUrl }),
  }).then(mapFinancialEntry);
}

export async function unsettleFinancialEntry(entryId: string) {
  return apiRequest<any>(`/financial-entries/${entryId}/unsettle`, {
    method: 'POST',
  }).then(mapFinancialEntry);
}

export async function createFinancialReceipt(
  entryId: string,
  payload: CreateFinancialReceiptPayload,
) {
  return apiRequest<any>(`/financial-entries/${entryId}/receipts`, {
    method: 'POST',
    body: JSON.stringify({
      amount: payload.valor,
      paymentDate: payload.dataPagamento,
      paymentMethod: payload.formaPagamento,
      bankAccountId: payload.contaBancariaId,
      attachmentUrl: payload.anexoUrl,
      notes: payload.observacoes,
    }),
  }).then(mapFinancialEntry);
}

export async function deleteFinancialReceipt(entryId: string, receiptId: string) {
  return apiRequest<any>(`/financial-entries/${entryId}/receipts/${receiptId}`, {
    method: 'DELETE',
  }).then(mapFinancialEntry);
}

export async function createFinancialEntry(payload: Omit<ContaFinanceira, 'id' | 'statusCalculado'>) {
  return apiRequest<any>('/financial-entries', {
    method: 'POST',
    body: JSON.stringify({
      entry_type: payload.tipo,
      description: payload.descricao,
      amount: payload.valor,
      due_date: payload.dataVencimento,
      category: payload.categoria,
      supplier_id: payload.fornecedorId,
      client_id: payload.clienteId,
      producer_id: payload.produtorId,
      status: payload.status,
      cost_center: payload.centroCusto,
      cost_center_id: payload.costCenterId,
      accounting_category_id: payload.accountingCategoryId,
      accounting_subcategory: payload.subcategoriaContabil,
      accounting_subcategory_id: payload.accountingSubcategoryId,
      payment_method: payload.formaPagamento,
      payment_type: payload.tipoPagamento,
      attachment_url: payload.anexoUrl,
      attachment_urls: payload.anexosUrls,
      installment_group_id: payload.installmentGroupId,
      installment_number: payload.installmentNumber,
      cost_type: payload.tipoCusto,
      bank_account_id: payload.contaBancariaId,
    }),
  }).then(mapFinancialEntry).catch(() => {
    // Mock fallback since API might not have this endpoint yet
    return mapFinancialEntry({
      id: `cf-new-${Date.now()}`,
      entry_type: payload.tipo,
      description: payload.descricao,
      amount: payload.valor,
      due_date: payload.dataVencimento,
      category: payload.categoria,
      client_id: payload.clienteId,
      status: payload.status,
      computed_status: payload.status,
      cost_center: payload.centroCusto,
      cost_center_id: payload.costCenterId,
      accounting_category_id: payload.accountingCategoryId,
      accounting_subcategory: payload.subcategoriaContabil,
      accounting_subcategory_id: payload.accountingSubcategoryId,
      payment_method: payload.formaPagamento,
      payment_type: payload.tipoPagamento,
      attachment_url: payload.anexoUrl,
      installment_group_id: payload.installmentGroupId,
      installment_number: payload.installmentNumber,
      tipoCusto: payload.tipoCusto,
    });
  });
}

export async function createBatchFinancialEntries(payloads: Omit<ContaFinanceira, 'id' | 'statusCalculado'>[]) {
  return apiRequest<any[]>('/financial-entries/batch', {
    method: 'POST',
    body: JSON.stringify(payloads.map(payload => ({
      entry_type: payload.tipo,
      description: payload.descricao,
      amount: payload.valor,
      due_date: payload.dataVencimento,
      category: payload.categoria,
      supplier_id: payload.fornecedorId,
      client_id: payload.clienteId,
      producer_id: payload.produtorId,
      status: payload.status,
      cost_center: payload.centroCusto,
      cost_center_id: payload.costCenterId,
      accounting_category_id: payload.accountingCategoryId,
      accounting_subcategory: payload.subcategoriaContabil,
      accounting_subcategory_id: payload.accountingSubcategoryId,
      payment_method: payload.formaPagamento,
      payment_type: payload.tipoPagamento,
      attachment_url: payload.anexoUrl,
      attachment_urls: payload.anexosUrls,
      installment_group_id: payload.installmentGroupId,
      installment_number: payload.installmentNumber,
      cost_type: payload.tipoCusto,
      bank_account_id: payload.contaBancariaId,
    }))),
  }).then(entries => entries.map(mapFinancialEntry));
}

export async function uploadFinancialAttachment(file: File): Promise<string> {
  const fileExt = file.name.split('.').pop();
  const fileName = `${crypto.randomUUID()}.${fileExt}`;
  const filePath = `comprovantes/${fileName}`;

  const { error } = await supabase.storage
    .from('comprovantes')
    .upload(filePath, file);

  if (error) {
    throw error;
  }

  const { data } = supabase.storage
    .from('comprovantes')
    .getPublicUrl(filePath);

  return data.publicUrl;
}

export async function updateFinancialEntry(id: string, payload: Partial<ContaFinanceira>) {
  return apiRequest<any>(`/financial-entries/${id}`, {
    method: 'PUT',
    body: JSON.stringify({
      entry_type: payload.tipo,
      description: payload.descricao,
      amount: payload.valor,
      due_date: payload.dataVencimento,
      category: payload.categoria,
      supplier_id: payload.fornecedorId,
      client_id: payload.clienteId,
      producer_id: payload.produtorId,
      status: payload.status,
      cost_center: payload.centroCusto,
      cost_center_id: payload.costCenterId,
      accounting_category_id: payload.accountingCategoryId,
      accounting_subcategory: payload.subcategoriaContabil,
      accounting_subcategory_id: payload.accountingSubcategoryId,
      payment_method: payload.formaPagamento,
      payment_type: payload.tipoPagamento,
      attachment_url: payload.anexoUrl,
      attachment_urls: payload.anexosUrls,
      installment_group_id: payload.installmentGroupId,
      installment_number: payload.installmentNumber,
      cost_type: payload.tipoCusto,
      bank_account_id: payload.contaBancariaId,
    }),
  }).then(mapFinancialEntry);
}

export async function deleteFinancialEntry(id: string) {
  return apiRequest<void>(`/financial-entries/${id}`, {
    method: 'DELETE',
  });
}

// --- Bank Accounts API ---
export interface BankAccountRecord {
  id: string;
  name: string;
  bank_name?: string;
  agency?: string;
  agency_digit?: string;
  account_number?: string;
  account_digit?: string;
  document_type?: string;
  document_number?: string;
  pix_key?: string;
  active: boolean;
  current_balance: number;
}

export interface BankStatementMovement {
  id: string;
  financial_entry_id: string;
  receipt_id?: string | null;
  bank_account_id: string;
  entry_type: 'Pagar' | 'Receber' | 'Entrada' | 'Saída';
  description: string;
  amount: number;
  effective_date: string;
  category?: string;
  attachment_url?: string;
  notes?: string;
  source: 'direct_entry' | 'receipt';
}

export interface FinancialPositionEntry {
  financial_entry_id: string;
  description: string;
  due_date: string;
  amount: number;
  entry_type: 'Pagar' | 'Receber';
  status: string;
}

export interface FinancialPositionRecord {
  account: BankAccountRecord;
  current_balance: number;
  expected_inflows: number;
  expected_outflows: number;
  projected_balance: number;
  details: {
    current: BankStatementMovement[];
    inflows: FinancialPositionEntry[];
    outflows: FinancialPositionEntry[];
  };
}

export async function loadBankAccounts() {
  return apiRequest<BankAccountRecord[]>('/bank-accounts');
}

export async function createBankAccount(payload: Partial<BankAccountRecord> & { initial_balance?: number }) {
  return apiRequest<BankAccountRecord>('/bank-accounts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateBankAccount(id: string, payload: Partial<BankAccountRecord>) {
  return apiRequest<BankAccountRecord>(`/bank-accounts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function getBankAccountStatement(id: string, startDate?: string, endDate?: string) {
  const query = new URLSearchParams();
  if (startDate) query.append('startDate', startDate);
  if (endDate) query.append('endDate', endDate);
  const qStr = query.toString();
  return apiRequest<BankStatementMovement[]>(`/bank-accounts/${id}/statement${qStr ? `?${qStr}` : ''}`);
}

export async function loadFinancialPosition() {
  return apiRequest<FinancialPositionRecord[]>('/bank-accounts/financial-position');
}

export async function createBankAccountBalanceAdjustment(
  id: string,
  payload: { targetBalance: number; justification: string; managerApproval: string; effectiveDate?: string },
) {
  return apiRequest<{ current_balance: number }>(`/bank-accounts/${id}/balance-adjustments`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function transferFunds(payload: {
  sourceAccountId: string;
  destinationAccountId: string;
  amount: number;
  date?: string;
  description?: string;
  attachmentUrl?: string;
}) {
  return apiRequest<any>('/bank-accounts/transfer', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function loadMilkPayrollSummary(startDate?: string, endDate?: string) {
  const params = new URLSearchParams();
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  const query = params.toString();
  return apiRequest<MilkPayrollSummary>(`/milk-payroll${query ? `?${query}` : ''}`);
}

export async function loadMilkPayrollProducerDetail(
  producerId: string,
  startDate?: string,
  endDate?: string,
) {
  const params = new URLSearchParams();
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  const query = params.toString();
  return apiRequest<MilkPayrollProducerDetail>(
    `/milk-payroll/${producerId}${query ? `?${query}` : ''}`,
  );
}

export async function loadProductionReport(filters?: {
  startDate?: string;
  endDate?: string;
  productId?: string;
  status?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.startDate) params.set('startDate', filters.startDate);
  if (filters?.endDate) params.set('endDate', filters.endDate);
  if (filters?.productId) params.set('productId', filters.productId);
  if (filters?.status) params.set('status', filters.status);
  const query = params.toString();
  return apiRequest<ProductionReportResponse>(`/reports/production${query ? `?${query}` : ''}`);
}

export async function loadSalesReport(filters?: {
  startDate?: string;
  endDate?: string;
  clientId?: string;
  productId?: string;
  status?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.startDate) params.set('startDate', filters.startDate);
  if (filters?.endDate) params.set('endDate', filters.endDate);
  if (filters?.clientId) params.set('clientId', filters.clientId);
  if (filters?.productId) params.set('productId', filters.productId);
  if (filters?.status) params.set('status', filters.status);
  const query = params.toString();
  return apiRequest<SalesReportResponse>(`/reports/sales${query ? `?${query}` : ''}`);
}

export async function loadQualityReport(filters?: {
  startDate?: string;
  endDate?: string;
  producerId?: string;
  status?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.startDate) params.set('startDate', filters.startDate);
  if (filters?.endDate) params.set('endDate', filters.endDate);
  if (filters?.producerId) params.set('producerId', filters.producerId);
  if (filters?.status) params.set('status', filters.status);
  const query = params.toString();
  return apiRequest<QualityReportResponse>(`/reports/quality${query ? `?${query}` : ''}`);
}

export async function loadPricingReport(filters?: {
  startDate?: string;
  endDate?: string;
  producerId?: string;
  status?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.startDate) params.set('startDate', filters.startDate);
  if (filters?.endDate) params.set('endDate', filters.endDate);
  if (filters?.producerId) params.set('producerId', filters.producerId);
  if (filters?.status) params.set('status', filters.status);
  const query = params.toString();
  return apiRequest<PricingReportResponse>(`/reports/pricing${query ? `?${query}` : ''}`);
}

export async function loadDreReport(filters?: {
  startDate?: string;
  endDate?: string;
  basis?: 'cash' | 'accrual';
}) {
  const params = new URLSearchParams();
  if (filters?.startDate) params.set('startDate', filters.startDate);
  if (filters?.endDate) params.set('endDate', filters.endDate);
  if (filters?.basis) params.set('basis', filters.basis);
  const query = params.toString();
  return apiRequest<DreReportResponse>(`/reports/dre${query ? `?${query}` : ''}`);
}


export interface DreMatrixReportResponse {
  period: { startDate: string | null; endDate: string | null };
  months: string[];
  initialBalance: number;
  totals: {
    revenues: Record<string, { previsto: number; realizado: number }>;
    expenses: Record<string, { previsto: number; realizado: number }>;
    netIncome: Record<string, { previsto: number; realizado: number }>;
    accumulatedBalance: Record<string, { previsto: number; realizado: number }>;
  };
  revenues: DreMatrixCategoryRow[];
  expenses: DreMatrixCategoryRow[];
  costTypeBreakdown: {
    revenues: DreMatrixCostTypeRow[];
    expenses: DreMatrixCostTypeRow[];
  };
}

export interface DreMatrixCategoryRow {
  id: string;
  category: string;
  data: Record<string, { previsto: number; realizado: number }>;
  subcategories: Array<{
    id: string;
    name: string;
    data: Record<string, { previsto: number; realizado: number }>;
  }>;
}

export interface DreMatrixCostTypeRow {
  costType: 'Fixo' | 'Variável' | 'Não classificado';
  data: Record<string, { previsto: number; realizado: number }>;
}

export async function loadDreMatrixReport(filters?: { startDate?: string; endDate?: string }) {
  const params = new URLSearchParams();
  if (filters?.startDate) params.set('startDate', filters.startDate);
  if (filters?.endDate) params.set('endDate', filters.endDate);
  const query = params.toString();
  return apiRequest<DreMatrixReportResponse>(`/reports/dre-matrix${query ? `?${query}` : ''}`);
}

export async function loadPurchases(filters?: PurchaseFilters) {
  const params = new URLSearchParams();
  if (filters?.supplierId) params.set('supplierId', filters.supplierId);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.startDate) params.set('startDate', filters.startDate);
  if (filters?.endDate) params.set('endDate', filters.endDate);
  const query = params.toString();
  const purchases = await apiRequest<any[]>(`/purchases${query ? `?${query}` : ''}`);
  return purchases.map(mapPurchase);
}

export async function loadPurchaseDetail(purchaseId: string) {
  const purchase = await apiRequest<any>(`/purchases/${purchaseId}`);
  return mapPurchase(purchase);
}

export async function createPurchase(payload: CreatePurchasePayload) {
  const purchase = await apiRequest<any>('/purchases', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return mapPurchase(purchase);
}

export async function receivePurchase(payload: {
  purchaseId: string;
  receivedAt?: string;
  items: Array<{
    purchaseItemId: string;
    receivedQuantity: number;
    supplierLotNumber?: string;
    manufactureDate?: string;
    expirationDate?: string;
    locationId?: string;
    unitCost?: number;
  }>;
}) {
  const purchase = await apiRequest<any>(`/purchases/${payload.purchaseId}/receive`, {
    method: 'POST',
    body: JSON.stringify({
      receivedAt: payload.receivedAt,
      items: payload.items,
    }),
  });
  return mapPurchase(purchase);
}

export async function loadClients(filters?: { search?: string; activeOnly?: boolean }, options?: { requireLive?: boolean }) {
  const loader = async () => {
    const params = new URLSearchParams();
    if (filters?.search) params.set('search', filters.search);
    if (filters?.activeOnly) params.set('activeOnly', 'true');
    const query = params.toString();
    const clients = await apiRequest<any[]>(`/clients${query ? `?${query}` : ''}`);
    return clients.map(mapClient);
  };
  return options?.requireLive ? loader() : withFallback(loader, () => []);
}

export async function createClient(payload: {
  code?: string;
  name: string;
  tradeName?: string;
  document: string;
  stateRegistration?: string;
  phone?: string;
  email?: string;
  address?: string;
  addressNumber?: string;
  addressComplement?: string;
  neighborhood?: string;
  cep?: string;
  city?: string;
  cityCode?: string;
  state?: string;
  countryCode?: string;
  countryName?: string;
  ieIndicator?: string;
  finalConsumer?: boolean;
  notes?: string;
  active?: boolean;
}) {
  const client = await apiRequest<any>('/clients', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return mapClient(client);
}

export async function updateClient(
  clientId: string,
  payload: {
    code?: string;
    name?: string;
    tradeName?: string;
    document?: string;
    stateRegistration?: string;
    phone?: string;
    email?: string;
    address?: string;
    addressNumber?: string;
    addressComplement?: string;
    neighborhood?: string;
    cep?: string;
    city?: string;
    cityCode?: string;
    state?: string;
    countryCode?: string;
    countryName?: string;
    ieIndicator?: string;
    finalConsumer?: boolean;
    notes?: string;
    active?: boolean;
  },
) {
  const client = await apiRequest<any>(`/clients/${clientId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return mapClient(client);
}

export async function loadSalesOrders(filters?: SalesOrderFilters) {
  const params = new URLSearchParams();
  if (filters?.clientId) params.set('clientId', filters.clientId);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.startDate) params.set('startDate', filters.startDate);
  if (filters?.endDate) params.set('endDate', filters.endDate);
  const query = params.toString();
  const salesOrders = await apiRequest<any[]>(`/sales-orders${query ? `?${query}` : ''}`);
  return salesOrders.map(mapSalesOrder);
}

export async function loadSalesOrderDetail(salesOrderId: string) {
  const salesOrder = await apiRequest<any>(`/sales-orders/${salesOrderId}`);
  return mapSalesOrder(salesOrder);
}

export async function createSalesOrder(payload: {
  clientId: string;
  orderDate: string;
  dueDate?: string;
  deliveryDate?: string;
  notes?: string;
  items: Array<{
    productId: string;
    quantity: number;
    unitPrice: number;
  }>;
}) {
  const salesOrder = await apiRequest<any>('/sales-orders', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return mapSalesOrder(salesOrder);
}

export async function fulfillSalesOrder(payload: {
  salesOrderId: string;
  idempotencyKey: string;
  fulfilledAt?: string;
  paymentMethod: string;
  installments?: number;
  installmentEntries?: Array<{ amount: number; dueDate: string }>;
  bankAccountId: string;
  items: Array<{
    salesOrderItemId: string;
    finishedProductLotId: string;
    quantity: number;
  }>;
  notes?: string;
}) {
  const salesOrder = await apiRequest<any>(`/sales-orders/${payload.salesOrderId}/fulfill`, {
    method: 'POST',
    body: JSON.stringify({
      idempotencyKey: payload.idempotencyKey,
      fulfilledAt: payload.fulfilledAt,
      paymentMethod: payload.paymentMethod,
      installments: payload.installments,
      installmentEntries: payload.installmentEntries,
      bankAccountId: payload.bankAccountId,
      items: payload.items,
      notes: payload.notes,
    }),
  });
  return mapSalesOrder(salesOrder);
}

export async function cancelAttendance(salesOrderId: string, attendanceId: string) {
  const salesOrder = await apiRequest<any>(
    `/sales-orders/${salesOrderId}/attendances/${attendanceId}/cancel`,
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
  );
  return mapSalesOrder(salesOrder);
}

export async function returnSalesOrder(payload: {
  salesOrderId: string;
  returnDate: string;
  items: Array<{
    salesOrderItemId: string;
    lotId: string;
    returnedQuantity: number;
    reason?: string;
  }>;
  discountAmount: number;
}) {
  const salesOrder = await apiRequest<any>(`/sales-orders/${payload.salesOrderId}/return`, {
    method: 'POST',
    body: JSON.stringify({
      returnDate: payload.returnDate,
      items: payload.items,
      discountAmount: payload.discountAmount,
    }),
  });
  return mapSalesOrder(salesOrder);
}

export async function deleteMilkReception(id: string) {
  return apiRequest<void>(`/milk-lots/${id}`, {
    method: 'DELETE',
  });
}

export async function deleteMilkAnalysis(id: string) {
  return apiRequest<void>(`/milk-lot-analyses/${id}`, {
    method: 'DELETE',
  });
}

export async function deleteSupplyLot(id: string) {
  return apiRequest<void>(`/inventory/supply-lots/${id}`, {
    method: 'DELETE',
  });
}

export async function deleteFinishedProductLot(id: string) {
  return apiRequest<void>(`/inventory/finished-product-lots/${id}`, {
    method: 'DELETE',
  });
}

export async function deleteProductionOrder(id: string) {
  return apiRequest<void>(`/production-orders/${id}`, {
    method: 'DELETE',
  });
}

export async function deleteSalesOrder(id: string) {
  return apiRequest<void>(`/sales-orders/${id}`, {
    method: 'DELETE',
  });
}

export async function deletePurchase(id: string) {
  return apiRequest<void>(`/purchases/${id}`, {
    method: 'DELETE',
  });
}

export async function createManualProductExit(payload: {
  finishedProductLotId: string;
  quantity: number;
  reason: string;
  notes?: string;
  exitDate?: string;
}) {
  return apiRequest<{ success: boolean; exitRecord: any }>('/inventory/manual-exits', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function adjustProductionOrder(
  orderId: string,
  payload: {
    adjustments: Array<{ finishedProductLotId: string; newQuantity: number }>;
    reason: string;
    notes: string;
  },
) {
  return apiRequest<{ success: boolean }>(`/production-orders/${orderId}/adjust`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
