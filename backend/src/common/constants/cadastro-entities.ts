export type CadastroEntity =
  | 'units'
  | 'stockLocations'
  | 'transporters'
  | 'routes'
  | 'producers'
  | 'milkTypes'
  | 'qualityParameters'
  | 'milkPriceRules'
  | 'suppliers'
  | 'supplyItems'
  | 'finishedProducts'
  | 'productSpecs'
  | 'blockReasons'
  | 'supplyLots'
  | 'costCenters'
  | 'bankAccounts'
  | 'accountingCategories'
  | 'accountingSubcategories'
  | 'paymentMethods'
  | 'paymentTypes';

interface CadastroEntityDefinition {
  table: string;
  searchableColumns: string[];
  orderBy: string;
  activeColumn?: string;
}

export const CADASTRO_ENTITY_DEFINITIONS: Record<CadastroEntity, CadastroEntityDefinition> = {
  units: {
    table: 'units',
    searchableColumns: ['name', 'symbol'],
    orderBy: 'name',
    activeColumn: 'active',
  },
  stockLocations: {
    table: 'stock_locations',
    searchableColumns: ['name', 'stock_type'],
    orderBy: 'name',
    activeColumn: 'active',
  },
  transporters: {
    table: 'transporters',
    searchableColumns: ['name', 'document', 'driver_name', 'vehicle_plate'],
    orderBy: 'name',
    activeColumn: 'active',
  },
  routes: {
    table: 'routes',
    searchableColumns: ['code', 'name', 'region'],
    orderBy: 'name',
    activeColumn: 'active',
  },
  producers: {
    table: 'producers',
    searchableColumns: ['code', 'name', 'document', 'farm_name'],
    orderBy: 'name',
    activeColumn: 'active',
  },
  milkTypes: {
    table: 'milk_types',
    searchableColumns: ['name'],
    orderBy: 'name',
    activeColumn: 'active',
  },
  qualityParameters: {
    table: 'quality_parameters',
    searchableColumns: ['name', 'data_type'],
    orderBy: 'name',
    activeColumn: 'active',
  },
  milkPriceRules: {
    table: 'milk_price_rules',
    searchableColumns: ['name'],
    orderBy: 'start_date',
    activeColumn: 'active',
  },
  suppliers: {
    table: 'suppliers',
    searchableColumns: ['name', 'document', 'supplier_type'],
    orderBy: 'name',
    activeColumn: 'active',
  },
  supplyItems: {
    table: 'supply_items',
    searchableColumns: ['code', 'name', 'category'],
    orderBy: 'name',
    activeColumn: 'active',
  },
  finishedProducts: {
    table: 'finished_products',
    searchableColumns: ['code', 'name', 'category', 'production_line'],
    orderBy: 'name',
    activeColumn: 'active',
  },
  productSpecs: {
    table: 'product_specs',
    searchableColumns: ['production_notes'],
    orderBy: 'created_at',
    activeColumn: 'active',
  },
  blockReasons: {
    table: 'block_reasons',
    searchableColumns: ['name', 'target_type'],
    orderBy: 'name',
    activeColumn: 'active',
  },
  supplyLots: {
    table: 'supply_lots',
    searchableColumns: ['supplier_lot_number', 'internal_lot_code', 'status'],
    orderBy: 'entry_date',
    activeColumn: 'active',
  },
  costCenters: {
    table: 'cost_centers',
    searchableColumns: ['name', 'code', 'description'],
    orderBy: 'name',
    activeColumn: 'active',
  },
  bankAccounts: {
    table: 'bank_accounts',
    searchableColumns: ['name', 'bank_name', 'account_number', 'document_number'],
    orderBy: 'name',
    activeColumn: 'active',
  },
  accountingCategories: {
    table: 'accounting_categories',
    searchableColumns: ['name', 'entry_type'],
    orderBy: 'name',
    activeColumn: 'active',
  },
  accountingSubcategories: {
    table: 'accounting_subcategories',
    searchableColumns: ['name'],
    orderBy: 'name',
    activeColumn: 'active',
  },
  paymentMethods: {
    table: 'payment_methods',
    searchableColumns: ['name'],
    orderBy: 'name',
    activeColumn: 'active',
  },
  paymentTypes: {
    table: 'payment_types',
    searchableColumns: ['name'],
    orderBy: 'name',
    activeColumn: 'active',
  },
};
