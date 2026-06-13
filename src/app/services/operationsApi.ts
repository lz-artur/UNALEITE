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

export interface DashboardStats {
  leiteRecebidoMes: number;
  lotesAprovados: number;
  lotesBloqueados: number;
  analisesPendentes: number;
  opsAbertas: number;
  producaoFinalizada: number;
  custoMedioKg: number;
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
  items: PurchaseItemRecord[];
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
  city?: string;
  state?: string;
  notes?: string;
  active: boolean;
}

export interface SalesOrderItemFulfillmentRecord {
  id: string;
  finishedProductLotId: string;
  lotCode: string;
  quantity: number;
  fulfilledAt: Date;
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

export interface SalesOrderRecord {
  id: string;
  number: string;
  clientId: string;
  clientName: string;
  clientDocument?: string;
  orderDate: Date;
  dueDate: Date;
  status: string;
  totalAmount: number;
  notes?: string;
  items: SalesOrderItemRecord[];
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
  statusCalculado?: 'Aberto' | 'Pago' | 'Vencido' | 'Cancelado';
}

export interface FinancialEntryFilters {
  type?: 'Pagar' | 'Receber';
  status?: 'Aberto' | 'Pago' | 'Vencido' | 'Cancelado';
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
    cbt: row.cbt != null ? Number(row.cbt) : undefined,
    ccs: row.ccs != null ? Number(row.ccs) : undefined,
    aprovado: Boolean(row.approved),
    observacoes: row.observacoes ?? undefined,
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
    insumos: [],
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
    city: row.city ?? undefined,
    state: row.state ?? undefined,
    notes: row.notes ?? undefined,
    active: Boolean(row.active),
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
    status: row.status,
    totalAmount: Number(row.totalAmount),
    notes: row.notes ?? undefined,
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
        fulfilledAt: new Date(fulfillment.fulfilledAt),
      })),
    })),
  };
}

function mapFinancialEntry(row: any): ContaFinanceira {
  return {
    id: row.id,
    tipo: row.entry_type,
    descricao: row.description,
    valor: Number(row.amount),
    dataVencimento: new Date(row.due_date),
    dataPagamento: row.payment_date ? new Date(row.payment_date) : undefined,
    status: row.status,
    categoria: row.category,
    fornecedorId: row.supplier_id ?? undefined,
    clienteId: row.client_id ?? undefined,
    produtorId: row.producer_id ?? undefined,
    referenceTable: row.reference_table ?? undefined,
    referenceId: row.reference_id ?? undefined,
    statusCalculado: row.computed_status ?? row.status,
  };
}

export async function loadDashboardStats(): Promise<DashboardStats> {
  return withFallback(async () => {
    const summary = await apiRequest<any>('/dashboard/summary');
    return {
      leiteRecebidoMes: summary.milkReceivedMonth,
      lotesAprovados: summary.approvedLots,
      lotesBloqueados: summary.blockedLots,
      opsAbertas: summary.openOrders,
      producaoFinalizada: summary.finishedOrders,
      custoMedioKg: summary.averageCostPerLiter,
      folhaLeite: summary.milkPayroll,
      contasPagar: summary.accountsPayable,
      contasReceber: summary.accountsReceivable,
      analisesPendentes: summary.pendingAnalysisCount ?? 0,
      titulosVencidos: summary.overdueEntries ?? 0,
      valorVencido: summary.overdueAmount ?? 0,
      insumosAbaixoMinimo: summary.lowStockItemsCount ?? 0,
    };
  }, () => {
    const fallback = calcularEstatisticas();
    return {
      ...fallback,
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
  receivedAt: string;
}) {
  return apiRequest<{ lot: any }>('/milk-receptions', {
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
}) {
  return apiRequest<{ order: any }>('/production-orders', {
    method: 'POST',
    body: JSON.stringify(payload),
  }).then((result) => mapProductionOrder(result.order));
}

export async function completeProductionOrder(payload: {
  orderId: string;
  actualQuantityProduced: number;
  supplyConsumptions?: Array<{ supplyLotId: string; quantity: number }>;
}) {
  return apiRequest<{ order: any; productLot: any }>(`/production-orders/${payload.orderId}/complete`, {
    method: 'POST',
    body: JSON.stringify({
      actualQuantityProduced: payload.actualQuantityProduced,
      supplyConsumptions: payload.supplyConsumptions,
    }),
  }).then((result) => ({
    order: mapProductionOrder(result.order),
    productLot: mapFinishedProductLot(result.productLot),
  }));
}

export async function loadSupplyLots() {
  return withFallback(async () => {
    const lots = await apiRequest<any[]>('/inventory/supply-lots');
    return lots.map(mapSupplyLot);
  }, () => []);
}

export async function loadFinishedProductLots() {
  return withFallback(async () => {
    const lots = await apiRequest<any[]>('/inventory/finished-product-lots');
    return lots.map(mapFinishedProductLot);
  }, () => mockEstoquesProdutos);
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
  }, () => mockContasFinanceiras);
}

export async function settleFinancialEntry(entryId: string, paymentDate?: string) {
  return apiRequest<any>(`/financial-entries/${entryId}/settle`, {
    method: 'POST',
    body: JSON.stringify({
      paymentDate,
    }),
  }).then(mapFinancialEntry);
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

export async function createPurchase(payload: {
  supplierId: string;
  purchaseDate: string;
  dueDate?: string;
  notes?: string;
  items: Array<{
    supplyItemId: string;
    quantity: number;
    unitCost: number;
  }>;
}) {
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

export async function loadClients(filters?: { search?: string; activeOnly?: boolean }) {
  return withFallback(async () => {
    const params = new URLSearchParams();
    if (filters?.search) params.set('search', filters.search);
    if (filters?.activeOnly) params.set('activeOnly', 'true');
    const query = params.toString();
    const clients = await apiRequest<any[]>(`/clients${query ? `?${query}` : ''}`);
    return clients.map(mapClient);
  }, () => []);
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
  city?: string;
  state?: string;
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
    city?: string;
    state?: string;
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
  fulfilledAt?: string;
  items: Array<{
    salesOrderItemId: string;
    finishedProductLotId: string;
    quantity: number;
  }>;
}) {
  const salesOrder = await apiRequest<any>(`/sales-orders/${payload.salesOrderId}/fulfill`, {
    method: 'POST',
    body: JSON.stringify({
      fulfilledAt: payload.fulfilledAt,
      items: payload.items,
    }),
  });
  return mapSalesOrder(salesOrder);
}
