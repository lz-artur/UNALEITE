import type {
  BlockReasonRecord,
  CadastrosState,
  FinishedProductRecord,
  MilkPriceRuleRecord,
  MilkTypeRecord,
  ProducerRecord,
  ProductSpecItemRecord,
  ProductSpecRecord,
  QualityParameterRecord,
  RouteRecord,
  StockLocationRecord,
  SupplierRecord,
  SupplyItemRecord,
  SupplyLotRecord,
  TransporterRecord,
  UnitRecord,
  CostCenterRecord,
  BankAccountRecord,
  AccountingCategoryRecord,
  AccountingSubcategoryRecord,
  PaymentMethodRecord,
  PaymentTypeRecord,
} from '../data/cadastrosData';
import { initialCadastrosState } from '../data/cadastrosData';
import { apiRequest, withFallback } from './api';

type CadastroEntity = keyof CadastrosState;

const entityEndpointMap: Record<CadastroEntity, string> = {
  units: 'units',
  stockLocations: 'stockLocations',
  transporters: 'transporters',
  routes: 'routes',
  producers: 'producers',
  milkTypes: 'milkTypes',
  qualityParameters: 'qualityParameters',
  milkPriceRules: 'milkPriceRules',
  suppliers: 'suppliers',
  supplyItems: 'supplyItems',
  finishedProducts: 'finishedProducts',
  productSpecs: 'productSpecs',
  blockReasons: 'blockReasons',
  supplyLots: 'supplyLots',
  costCenters: 'costCenters',
  bankAccounts: 'bankAccounts',
  accountingCategories: 'accountingCategories',
  accountingSubcategories: 'accountingSubcategories',
  paymentMethods: 'paymentMethods',
  paymentTypes: 'paymentTypes',
};

function mapUnit(row: any): UnitRecord {
  return {
    id: row.id,
    name: row.name,
    symbol: row.symbol,
    unitType: row.unit_type,
    decimals: row.decimals,
    active: row.active,
  };
}

function mapStockLocation(row: any): StockLocationRecord {
  return {
    id: row.id,
    name: row.name,
    stockType: row.stock_type,
    capacity: row.capacity ?? undefined,
    capacityUnitId: row.capacity_unit_id ?? undefined,
    idealTemperature: row.ideal_temperature ?? undefined,
    active: row.active,
  };
}

function mapTransporter(row: any): TransporterRecord {
  return {
    id: row.id,
    name: row.name,
    document: row.document,
    driverName: row.driver_name,
    vehiclePlate: row.vehicle_plate,
    vehicleType: row.vehicle_type,
    capacity: row.capacity ?? undefined,
    phone: row.phone,
    active: row.active,
  };
}

function mapRoute(row: any): RouteRecord {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    region: row.region,
    defaultDriver: row.default_driver,
    defaultTransporterId: row.default_transporter_id ?? undefined,
    active: row.active,
  };
}

function mapProducer(row: any): ProducerRecord {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    document: row.document,
    farmName: row.farm_name,
    routeId: row.route_id ?? undefined,
    phone: row.phone,
    email: row.email ?? '',
    address: row.address ?? '',
    bankingData: row.banking_data ?? '',
    notes: row.notes ?? '',
    active: row.active,
  };
}

function mapMilkType(row: any): MilkTypeRecord {
  return {
    id: row.id,
    name: row.name,
    unitId: row.unit_id,
    maxUsageHours: row.max_usage_hours,
    idealReceptionTemperature: row.ideal_reception_temperature ?? undefined,
    maxReceptionTemperature: row.max_reception_temperature,
    active: row.active,
  };
}

function mapQualityParameter(row: any): QualityParameterRecord {
  return {
    id: row.id,
    name: row.name,
    dataType: row.data_type,
    unitLabel: row.unit_label ?? undefined,
    minValue: row.min_value ?? undefined,
    maxValue: row.max_value ?? undefined,
    required: row.required,
    autoBlock: row.auto_block,
    active: row.active,
  };
}

function mapMilkPriceRule(row: any): MilkPriceRuleRecord {
  return {
    id: row.id,
    name: row.name,
    startDate: row.start_date,
    endDate: row.end_date,
    basePrice: row.base_price,
    fatBonus: row.fat_bonus,
    proteinBonus: row.protein_bonus,
    acidityPenalty: row.acidity_penalty,
    cbtPenalty: row.cbt_penalty,
    ccsPenalty: row.ccs_penalty,
    temperaturePenalty: row.temperature_penalty,
    active: row.active,
  };
}

function mapSupplier(row: any): SupplierRecord {
  return {
    id: row.id,
    name: row.name,
    document: row.document,
    supplierType: row.supplier_type,
    phone: row.phone ?? '',
    email: row.email ?? '',
    address: row.address ?? '',
    active: row.active,
  };
}

function mapSupplyItem(row: any): SupplyItemRecord {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    category: row.category,
    unitId: row.unit_id,
    minimumStock: row.minimum_stock,
    defaultSupplierId: row.default_supplier_id ?? undefined,
    tracksExpiration: row.tracks_expiration,
    tracksLot: row.tracks_lot,
    defaultCost: row.default_cost,
    currentStock: row.current_stock,
    active: row.active,
  };
}

function mapFinishedProduct(row: any): FinishedProductRecord {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    category: row.category,
    unitId: row.unit_id,
    standardWeight: row.standard_weight ?? undefined,
    shelfLifeDays: row.shelf_life_days,
    storageTemperature: row.storage_temperature ?? undefined,
    theoreticalYield: row.theoretical_yield,
    productionLine: row.production_line ?? '',
    active: row.active,
  };
}

function mapProductSpecItem(row: any): ProductSpecItemRecord {
  return {
    id: row.id,
    supplyItemId: row.supply_item_id,
    quantity: row.quantity,
    unitId: row.unit_id,
  };
}

function mapProductSpec(row: any): ProductSpecRecord {
  return {
    id: row.id,
    productId: row.product_id,
    standardMilkAmount: row.standard_milk_amount,
    idealFat: row.ideal_fat ?? undefined,
    idealProtein: row.ideal_protein ?? undefined,
    theoreticalYield: row.theoretical_yield,
    expectedLoss: row.expected_loss ?? undefined,
    productionNotes: row.production_notes ?? '',
    items: Array.isArray(row.product_spec_items) ? row.product_spec_items.map(mapProductSpecItem) : [],
    active: row.active,
  };
}

function mapBlockReason(row: any): BlockReasonRecord {
  return {
    id: row.id,
    name: row.name,
    targetType: row.target_type,
    autoBlock: row.auto_block,
    active: row.active,
  };
}

function mapSupplyLot(row: any): SupplyLotRecord {
  return {
    id: row.id,
    supplyItemId: row.supply_item_id,
    supplierId: row.supplier_id,
    supplierLotNumber: row.supplier_lot_number ?? '',
    internalLotCode: row.internal_lot_code,
    entryDate: row.entry_date,
    manufactureDate: row.manufacture_date ?? undefined,
    expirationDate: row.expiration_date ?? undefined,
    receivedQuantity: row.received_quantity,
    availableQuantity: row.available_quantity,
    unitCost: row.unit_cost,
    totalValue: row.total_value,
    locationId: row.location_id,
    status: row.status,
    blockReasonId: row.block_reason_id ?? undefined,
    active: row.active,
  };
}

function mapCostCenter(row: any): CostCenterRecord {
  return {
    id: row.id,
    name: row.name,
    code: row.code ?? undefined,
    description: row.description ?? undefined,
    active: row.active,
  };
}

function mapBankAccount(row: any): BankAccountRecord {
  return {
    id: row.id,
    name: row.name,
    bankName: row.bank_name ?? undefined,
    agency: row.agency ?? undefined,
    agencyDigit: row.agency_digit ?? undefined,
    accountNumber: row.account_number ?? undefined,
    accountDigit: row.account_digit ?? undefined,
    documentType: row.document_type ?? undefined,
    documentNumber: row.document_number ?? undefined,
    pixKey: row.pix_key ?? undefined,
    active: row.active,
  };
}

function mapAccountingCategory(row: any): AccountingCategoryRecord {
  return {
    id: row.id,
    name: row.name,
    entryType: row.entry_type,
    showInDre: row.show_in_dre,
    active: row.active,
  };
}

function mapAccountingSubcategory(row: any): AccountingSubcategoryRecord {
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    active: row.active,
  };
}

function mapPaymentMethod(row: any): PaymentMethodRecord {
  return {
    id: row.id,
    name: row.name,
    active: row.active,
  };
}

function mapPaymentType(row: any): PaymentTypeRecord {
  return {
    id: row.id,
    name: row.name,
    active: row.active,
  };
}

const entityMappers: Record<CadastroEntity, (rows: any[]) => CadastrosState[CadastroEntity]> = {
  units: (rows) => rows.map(mapUnit),
  stockLocations: (rows) => rows.map(mapStockLocation),
  transporters: (rows) => rows.map(mapTransporter),
  routes: (rows) => rows.map(mapRoute),
  producers: (rows) => rows.map(mapProducer),
  milkTypes: (rows) => rows.map(mapMilkType),
  qualityParameters: (rows) => rows.map(mapQualityParameter),
  milkPriceRules: (rows) => rows.map(mapMilkPriceRule),
  suppliers: (rows) => rows.map(mapSupplier),
  supplyItems: (rows) => rows.map(mapSupplyItem),
  finishedProducts: (rows) => rows.map(mapFinishedProduct),
  productSpecs: (rows) => rows.map(mapProductSpec),
  blockReasons: (rows) => rows.map(mapBlockReason),
  supplyLots: (rows) => rows.map(mapSupplyLot),
  costCenters: (rows) => rows.map(mapCostCenter),
  bankAccounts: (rows) => rows.map(mapBankAccount),
  accountingCategories: (rows) => rows.map(mapAccountingCategory),
  accountingSubcategories: (rows) => rows.map(mapAccountingSubcategory),
  paymentMethods: (rows) => rows.map(mapPaymentMethod),
  paymentTypes: (rows) => rows.map(mapPaymentType),
};

function serializeUnit(record: UnitRecord) {
  return {
    id: record.id,
    name: record.name,
    symbol: record.symbol,
    unit_type: record.unitType,
    decimals: record.decimals,
    active: record.active,
  };
}

function serializeStockLocation(record: StockLocationRecord) {
  return {
    id: record.id,
    name: record.name,
    stock_type: record.stockType,
    capacity: record.capacity ?? null,
    capacity_unit_id: record.capacityUnitId ?? null,
    ideal_temperature: record.idealTemperature ?? null,
    active: record.active,
  };
}

function serializeTransporter(record: TransporterRecord) {
  return {
    id: record.id,
    name: record.name,
    document: record.document,
    driver_name: record.driverName,
    vehicle_plate: record.vehiclePlate,
    vehicle_type: record.vehicleType,
    capacity: record.capacity ?? null,
    phone: record.phone,
    active: record.active,
  };
}

function serializeRoute(record: RouteRecord) {
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    region: record.region,
    default_driver: record.defaultDriver,
    default_transporter_id: record.defaultTransporterId ?? null,
    active: record.active,
  };
}

function serializeProducer(record: ProducerRecord) {
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    document: record.document,
    farm_name: record.farmName,
    route_id: record.routeId ?? null,
    phone: record.phone,
    email: record.email || null,
    address: record.address || null,
    banking_data: record.bankingData || null,
    notes: record.notes || null,
    active: record.active,
  };
}

function serializeMilkType(record: MilkTypeRecord) {
  return {
    id: record.id,
    name: record.name,
    unit_id: record.unitId,
    max_usage_hours: record.maxUsageHours,
    ideal_reception_temperature: record.idealReceptionTemperature ?? null,
    max_reception_temperature: record.maxReceptionTemperature,
    active: record.active,
  };
}

function serializeQualityParameter(record: QualityParameterRecord) {
  return {
    id: record.id,
    name: record.name,
    data_type: record.dataType,
    unit_label: record.unitLabel ?? null,
    min_value: record.minValue ?? null,
    max_value: record.maxValue ?? null,
    required: record.required,
    auto_block: record.autoBlock,
    active: record.active,
  };
}

function serializeMilkPriceRule(record: MilkPriceRuleRecord) {
  return {
    id: record.id,
    name: record.name,
    start_date: record.startDate,
    end_date: record.endDate,
    base_price: record.basePrice,
    fat_bonus: record.fatBonus,
    protein_bonus: record.proteinBonus,
    acidity_penalty: record.acidityPenalty,
    cbt_penalty: record.cbtPenalty,
    ccs_penalty: record.ccsPenalty,
    temperature_penalty: record.temperaturePenalty,
    active: record.active,
  };
}

function serializeSupplier(record: SupplierRecord) {
  return {
    id: record.id,
    name: record.name,
    document: record.document,
    supplier_type: record.supplierType,
    phone: record.phone || null,
    email: record.email || null,
    address: record.address || null,
    active: record.active,
  };
}

function serializeSupplyItem(record: SupplyItemRecord) {
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    category: record.category,
    unit_id: record.unitId,
    minimum_stock: record.minimumStock,
    default_supplier_id: record.defaultSupplierId ?? null,
    tracks_expiration: record.tracksExpiration,
    tracks_lot: record.tracksLot,
    default_cost: record.defaultCost,
    current_stock: record.currentStock,
    active: record.active,
  };
}

function serializeFinishedProduct(record: FinishedProductRecord) {
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    category: record.category,
    unit_id: record.unitId,
    standard_weight: record.standardWeight ?? null,
    shelf_life_days: record.shelfLifeDays,
    storage_temperature: record.storageTemperature ?? null,
    theoretical_yield: record.theoreticalYield,
    production_line: record.productionLine,
    active: record.active,
  };
}

function serializeProductSpec(record: ProductSpecRecord) {
  return {
    id: record.id,
    product_id: record.productId,
    standard_milk_amount: record.standardMilkAmount,
    ideal_fat: record.idealFat ?? null,
    ideal_protein: record.idealProtein ?? null,
    theoretical_yield: record.theoreticalYield,
    expected_loss: record.expectedLoss ?? null,
    production_notes: record.productionNotes,
    active: record.active,
    product_spec_items: record.items.map((item) => ({
      id: item.id,
      supply_item_id: item.supplyItemId,
      quantity: item.quantity,
      unit_id: item.unitId,
    })),
  };
}

function serializeBlockReason(record: BlockReasonRecord) {
  return {
    id: record.id,
    name: record.name,
    target_type: record.targetType,
    auto_block: record.autoBlock,
    active: record.active,
  };
}

function serializeSupplyLot(record: SupplyLotRecord) {
  return {
    id: record.id,
    supply_item_id: record.supplyItemId,
    supplier_id: record.supplierId,
    supplier_lot_number: record.supplierLotNumber || null,
    internal_lot_code: record.internalLotCode,
    entry_date: record.entryDate,
    manufacture_date: record.manufactureDate ?? null,
    expiration_date: record.expirationDate ?? null,
    received_quantity: record.receivedQuantity,
    available_quantity: record.availableQuantity,
    unit_cost: record.unitCost,
    total_value: record.totalValue,
    location_id: record.locationId,
    status: record.status,
    block_reason_id: record.blockReasonId ?? null,
    active: record.active,
  };
}

function serializeCostCenter(record: CostCenterRecord) {
  return {
    id: record.id,
    name: record.name,
    code: record.code ?? null,
    description: record.description ?? null,
    active: record.active,
  };
}

function serializeBankAccount(record: BankAccountRecord) {
  return {
    id: record.id,
    name: record.name,
    bank_name: record.bankName ?? null,
    agency: record.agency ?? null,
    agency_digit: record.agencyDigit ?? null,
    account_number: record.accountNumber ?? null,
    account_digit: record.accountDigit ?? null,
    document_type: record.documentType ?? null,
    document_number: record.documentNumber ?? null,
    pix_key: record.pixKey ?? null,
    active: record.active,
  };
}

function serializeAccountingCategory(record: AccountingCategoryRecord) {
  return {
    id: record.id,
    name: record.name,
    entry_type: record.entryType,
    show_in_dre: record.showInDre,
    active: record.active,
  };
}

function serializeAccountingSubcategory(record: AccountingSubcategoryRecord) {
  return {
    id: record.id,
    category_id: record.categoryId,
    name: record.name,
    active: record.active,
  };
}

function serializePaymentMethod(record: PaymentMethodRecord) {
  return {
    id: record.id,
    name: record.name,
    active: record.active,
  };
}

function serializePaymentType(record: PaymentTypeRecord) {
  return {
    id: record.id,
    name: record.name,
    active: record.active,
  };
}

const entitySerializers: Record<CadastroEntity, (record: any) => Record<string, unknown>> = {
  units: serializeUnit,
  stockLocations: serializeStockLocation,
  transporters: serializeTransporter,
  routes: serializeRoute,
  producers: serializeProducer,
  milkTypes: serializeMilkType,
  qualityParameters: serializeQualityParameter,
  milkPriceRules: serializeMilkPriceRule,
  suppliers: serializeSupplier,
  supplyItems: serializeSupplyItem,
  finishedProducts: serializeFinishedProduct,
  productSpecs: serializeProductSpec,
  blockReasons: serializeBlockReason,
  supplyLots: serializeSupplyLot,
  costCenters: serializeCostCenter,
  bankAccounts: serializeBankAccount,
  accountingCategories: serializeAccountingCategory,
  accountingSubcategories: serializeAccountingSubcategory,
  paymentMethods: serializePaymentMethod,
  paymentTypes: serializePaymentType,
};

export async function loadCadastrosState() {
  return withFallback(async () => {
    const entries = await Promise.all(
      (Object.keys(entityEndpointMap) as CadastroEntity[]).map(async (entity) => {
        const data = await apiRequest<any[]>(`/cadastros/${entityEndpointMap[entity]}`);
        return [entity, entityMappers[entity](data)] as const;
      }),
    );

    return entries.reduce((acc, [entity, data]) => {
      acc[entity] = data;
      return acc;
    }, {} as CadastrosState);
  }, () => initialCadastrosState);
}

const isFakeId = (id: string) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export async function saveCadastroRecord<TEntity extends CadastroEntity>(
  entity: TEntity,
  record: CadastrosState[TEntity][number],
) {
  const endpoint = entityEndpointMap[entity];
  const payload = entitySerializers[entity](record);
  const isNew = !payload.id || isFakeId(String(payload.id));
  
  if (isNew) {
    delete payload.id;
  }
  
  const method = isNew ? 'POST' : 'PATCH';
  const path = isNew ? `/cadastros/${endpoint}` : `/cadastros/${endpoint}/${String(payload.id)}`;
  
  const response = await apiRequest<any>(path, {
    method,
    body: JSON.stringify(payload),
  });
  
  return entityMappers[entity]([response])[0] as CadastrosState[TEntity][number];
}

export async function toggleCadastroRecord(entity: CadastroEntity, id: string) {
  const endpoint = entityEndpointMap[entity];
  return apiRequest(`/cadastros/${endpoint}/${id}/toggle-active`, {
    method: 'POST',
  });
}

export async function deleteCadastroRecord(entity: CadastroEntity, id: string) {
  const endpoint = entityEndpointMap[entity];
  return apiRequest(`/cadastros/${endpoint}/${id}`, {
    method: 'DELETE',
  });
}

export async function saveRouteRecord(record: RouteRecord, producerIds: string[]) {
  const isNew = !record.id || isFakeId(String(record.id));
  const payload = serializeRoute(record);
  
  if (isNew) {
    delete payload.id;
  }
  
  const response = await apiRequest<any>(`/cadastros/${entityEndpointMap.routes}${isNew ? '' : `/${record.id}`}`, {
    method: isNew ? 'POST' : 'PATCH',
    body: JSON.stringify({
      ...payload,
      producer_ids: producerIds,
    }),
  });
  
  return entityMappers.routes([response])[0];
}

export async function saveSupplierRecord(record: SupplierRecord, suppliedItemIds: string[]) {
  const isNew = !record.id || isFakeId(String(record.id));
  const payload = serializeSupplier(record);
  
  if (isNew) {
    delete payload.id;
  }
  
  const response = await apiRequest<any>(`/cadastros/${entityEndpointMap.suppliers}${isNew ? '' : `/${record.id}`}`, {
    method: isNew ? 'POST' : 'PATCH',
    body: JSON.stringify({
      ...payload,
      supplied_item_ids: suppliedItemIds,
    }),
  });
  
  return entityMappers.suppliers([response])[0];
}

export async function saveProductSpecRecord(record: ProductSpecRecord) {
  const isNew = !record.id || isFakeId(String(record.id));
  const payload = serializeProductSpec(record);
  
  if (isNew) {
    delete payload.id;
  }
  
  const response = await apiRequest<any>(`/cadastros/${entityEndpointMap.productSpecs}${isNew ? '' : `/${record.id}`}`, {
    method: isNew ? 'POST' : 'PATCH',
    body: JSON.stringify(payload),
  });
  
  return entityMappers.productSpecs([response])[0];
}
