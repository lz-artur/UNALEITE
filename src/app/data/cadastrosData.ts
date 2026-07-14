export type UnitType = 'Volume' | 'Peso' | 'Unidade';
export type StockType = 'Leite Cru' | 'Insumos' | 'Produto Acabado';
export type QualityDataType = 'Numero' | 'Texto' | 'Aprovado/Reprovado';
export type BlockTargetType = 'Leite' | 'Insumo' | 'Produto Acabado' | 'Geral';
export type SupplyLotStatus =
  | 'Disponivel'
  | 'Bloqueado'
  | 'Vencido'
  | 'Utilizado'
  | 'Parcialmente Utilizado';

export interface UnitRecord {
  id: string;
  name: string;
  symbol: string;
  unitType: UnitType;
  decimals: number;
  active: boolean;
}

export interface StockLocationRecord {
  id: string;
  name: string;
  stockType: StockType;
  capacity?: number;
  capacityUnitId?: string;
  idealTemperature?: number;
  active: boolean;
}

export interface TransporterRecord {
  id: string;
  name: string;
  document: string;
  driverName: string;
  vehiclePlate: string;
  vehicleType: string;
  capacity?: number;
  phone: string;
  active: boolean;
}

export interface RouteRecord {
  id: string;
  code: string;
  name: string;
  region: string;
  defaultDriver: string;
  defaultTransporterId?: string;
  active: boolean;
}

export interface ProducerRecord {
  id: string;
  code: string;
  name: string;
  document: string;
  farmName: string;
  routeId?: string;
  phone: string;
  email: string;
  address: string;
  bankingData: string;
  notes: string;
  active: boolean;
}

export interface MilkTypeRecord {
  id: string;
  name: string;
  unitId: string;
  maxUsageHours: number;
  idealReceptionTemperature?: number;
  maxReceptionTemperature: number;
  active: boolean;
}

export interface QualityParameterRecord {
  id: string;
  name: string;
  dataType: QualityDataType;
  unitLabel?: string;
  minValue?: number;
  maxValue?: number;
  required: boolean;
  autoBlock: boolean;
  active: boolean;
}

export interface MilkPriceRuleRecord {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  basePrice: number;
  fatBonus: number;
  proteinBonus: number;
  acidityPenalty: number;
  cbtPenalty: number;
  ccsPenalty: number;
  temperaturePenalty: number;
  active: boolean;
}

export interface SupplierRecord {
  id: string;
  name: string;
  document: string;
  supplierType: string;
  phone: string;
  email: string;
  address: string;
  active: boolean;
}

export interface SupplyItemRecord {
  id: string;
  code: string;
  name: string;
  category: string;
  unitId: string;
  minimumStock: number;
  defaultSupplierId?: string;
  tracksExpiration: boolean;
  tracksLot: boolean;
  defaultCost: number;
  currentStock: number;
  active: boolean;
}

export interface FinishedProductRecord {
  id: string;
  code: string;
  name: string;
  category: string;
  unitId: string;
  standardWeight?: number;
  shelfLifeDays: number;
  storageTemperature?: number;
  theoreticalYield: number;
  productionLine: string;
  active: boolean;
}

export interface ProductSpecItemRecord {
  id: string;
  supplyItemId: string;
  quantity: number;
  unitId: string;
}

export interface ProductSpecRecord {
  id: string;
  productId: string;
  standardMilkAmount: number;
  idealFat?: number;
  idealProtein?: number;
  theoreticalYield: number;
  expectedLoss?: number;
  productionNotes: string;
  items: ProductSpecItemRecord[];
  active: boolean;
}

export interface BlockReasonRecord {
  id: string;
  name: string;
  targetType: BlockTargetType;
  autoBlock: boolean;
  active: boolean;
}

export interface SupplyLotRecord {
  id: string;
  supplyItemId: string;
  supplierId: string;
  supplierLotNumber: string;
  internalLotCode: string;
  entryDate: string;
  manufactureDate?: string;
  expirationDate?: string;
  receivedQuantity: number;
  availableQuantity: number;
  unitCost: number;
  totalValue: number;
  locationId: string;
  status: SupplyLotStatus;
  blockReasonId?: string;
  active: boolean;
}

export interface CadastrosState {
  units: UnitRecord[];
  stockLocations: StockLocationRecord[];
  transporters: TransporterRecord[];
  routes: RouteRecord[];
  producers: ProducerRecord[];
  milkTypes: MilkTypeRecord[];
  qualityParameters: QualityParameterRecord[];
  milkPriceRules: MilkPriceRuleRecord[];
  suppliers: SupplierRecord[];
  supplyItems: SupplyItemRecord[];
  finishedProducts: FinishedProductRecord[];
  productSpecs: ProductSpecRecord[];
  blockReasons: BlockReasonRecord[];
  supplyLots: SupplyLotRecord[];
}

export const initialCadastrosState: CadastrosState = {
  units: [
    { id: 'unit-l', name: 'Litro', symbol: 'L', unitType: 'Volume', decimals: 2, active: true },
    { id: 'unit-ml', name: 'Mililitro', symbol: 'mL', unitType: 'Volume', decimals: 0, active: true },
    { id: 'unit-kg', name: 'Quilograma', symbol: 'kg', unitType: 'Peso', decimals: 3, active: true },
    { id: 'unit-g', name: 'Grama', symbol: 'g', unitType: 'Peso', decimals: 0, active: true },
    { id: 'unit-un', name: 'Unidade', symbol: 'un', unitType: 'Unidade', decimals: 0, active: true },
    { id: 'unit-cx', name: 'Caixa', symbol: 'cx', unitType: 'Unidade', decimals: 0, active: true },
  ],
  stockLocations: [
    {
      id: 'loc-tanque-01',
      name: 'Tanque 01',
      stockType: 'Leite Cru',
      capacity: 5000,
      capacityUnitId: 'unit-l',
      idealTemperature: 4,
      active: true,
    },
    {
      id: 'loc-almox',
      name: 'Almoxarifado Seco',
      stockType: 'Insumos',
      capacity: 2000,
      capacityUnitId: 'unit-kg',
      active: true,
    },
    {
      id: 'loc-camara',
      name: 'Camara Fria',
      stockType: 'Produto Acabado',
      capacity: 1000,
      capacityUnitId: 'unit-kg',
      idealTemperature: 4,
      active: true,
    },
  ],
  transporters: [
    {
      id: 'transp-001',
      name: 'Transportadora Rapida Ltda',
      document: '12.345.678/0001-90',
      driverName: 'Carlos Motorista',
      vehiclePlate: 'ABC1D23',
      vehicleType: 'Caminhao tanque',
      capacity: 12000,
      phone: '(34) 3333-1111',
      active: true,
    },
    {
      id: 'transp-002',
      name: 'Logistica do Campo',
      document: '23.456.789/0001-01',
      driverName: 'Paulo Vieira',
      vehiclePlate: 'DEF4G56',
      vehicleType: 'Bau refrigerado',
      capacity: 8500,
      phone: '(34) 3333-2222',
      active: true,
    },
  ],
  routes: [
    {
      id: 'rota-001',
      code: 'R001',
      name: 'Rota 1 - Centro',
      region: 'Unai Centro',
      defaultDriver: 'Carlos Motorista',
      defaultTransporterId: 'transp-001',
      active: true,
    },
    {
      id: 'rota-002',
      code: 'R002',
      name: 'Rota 2 - Rural Norte',
      region: 'Rural Norte',
      defaultDriver: 'Jose Motorista',
      defaultTransporterId: 'transp-001',
      active: true,
    },
    {
      id: 'rota-003',
      code: 'R003',
      name: 'Rota 3 - Rural Sul',
      region: 'Rural Sul',
      defaultDriver: 'Paulo Vieira',
      defaultTransporterId: 'transp-002',
      active: true,
    },
  ],
  producers: [
    {
      id: 'prod-001',
      code: 'P001',
      name: 'Joao da Silva',
      document: '123.456.789-00',
      farmName: 'Fazenda Boa Esperanca',
      routeId: 'rota-001',
      phone: '(34) 99999-0001',
      email: 'joao@email.com',
      address: 'Zona Rural - Unai/MG',
      bankingData: 'Banco Cooperativo / Ag 0001 / CC 12345-6 / PIX CPF',
      notes: 'Produtor com historico estavel de qualidade.',
      active: true,
    },
    {
      id: 'prod-002',
      code: 'P002',
      name: 'Maria Santos',
      document: '234.567.890-11',
      farmName: 'Sitio Santa Luzia',
      routeId: 'rota-001',
      phone: '(34) 99999-0002',
      email: 'maria@email.com',
      address: 'Zona Rural - Unai/MG',
      bankingData: 'Banco do Brasil / Ag 0450 / CC 99881-0 / PIX celular',
      notes: 'Maior volume medio por coleta.',
      active: true,
    },
    {
      id: 'prod-003',
      code: 'P003',
      name: 'Pedro Oliveira',
      document: '345.678.901-22',
      farmName: 'Fazenda Serra Azul',
      routeId: 'rota-002',
      phone: '(34) 99999-0003',
      email: 'pedro@email.com',
      address: 'Paracatu/MG',
      bankingData: 'Sicoob / Ag 1102 / CC 7777-0 / PIX CNPJ',
      notes: 'Acompanhamento recorrente de qualidade.',
      active: true,
    },
    {
      id: 'prod-004',
      code: 'P004',
      name: 'Ana Costa',
      document: '456.789.012-33',
      farmName: 'Fazenda Horizonte',
      routeId: 'rota-002',
      phone: '(34) 99999-0004',
      email: 'ana@email.com',
      address: 'Unai/MG',
      bankingData: 'Caixa / Ag 2222 / CC 10020-1 / PIX email',
      notes: 'Produtora com alta gordura e proteina.',
      active: true,
    },
  ],
  milkTypes: [
    {
      id: 'milk-001',
      name: 'Leite Cru Refrigerado',
      unitId: 'unit-l',
      maxUsageHours: 48,
      idealReceptionTemperature: 4,
      maxReceptionTemperature: 7,
      active: true,
    },
    {
      id: 'milk-002',
      name: 'Creme de Leite',
      unitId: 'unit-l',
      maxUsageHours: 72,
      idealReceptionTemperature: 5,
      maxReceptionTemperature: 8,
      active: true,
    },
  ],
  qualityParameters: [
    { id: 'qp-001', name: 'Gordura %', dataType: 'Numero', unitLabel: '%', minValue: 3, maxValue: 4.5, required: true, autoBlock: false, active: true },
    { id: 'qp-002', name: 'Proteina %', dataType: 'Numero', unitLabel: '%', minValue: 2.9, maxValue: 3.8, required: true, autoBlock: false, active: true },
    { id: 'qp-003', name: 'Acidez', dataType: 'Numero', unitLabel: 'D', minValue: 14, maxValue: 18, required: true, autoBlock: true, active: true },
    { id: 'qp-006', name: 'Crioscopia', dataType: 'Numero', unitLabel: 'H', minValue: -0.545, maxValue: -0.520, required: true, autoBlock: true, active: true },
    { id: 'qp-007', name: 'Densidade', dataType: 'Numero', unitLabel: 'g/mL', minValue: 1.028, maxValue: 1.034, required: true, autoBlock: false, active: true },
    { id: 'qp-008', name: 'Alizarol', dataType: 'Aprovado/Reprovado', required: true, autoBlock: true, active: true },
    { id: 'qp-009', name: 'Antibiotico', dataType: 'Aprovado/Reprovado', required: true, autoBlock: true, active: true },
    { id: 'qp-010', name: 'Temperatura', dataType: 'Numero', unitLabel: 'C', maxValue: 7, required: true, autoBlock: false, active: true },
  ],
  milkPriceRules: [
    {
      id: 'mpr-001',
      name: 'Tabela Maio/2026',
      startDate: '2026-05-01',
      endDate: '2026-05-31',
      basePrice: 2.3,
      fatBonus: 0.05,
      proteinBonus: 0.03,
      acidityPenalty: -0.04,
      cbtPenalty: -0.05,
      ccsPenalty: -0.05,
      temperaturePenalty: -0.03,
      active: true,
    },
  ],
  suppliers: [
    {
      id: 'sup-001',
      name: 'Quimica Lactea Brasil',
      document: '55.111.222/0001-10',
      supplierType: 'Insumos',
      phone: '(31) 3333-1000',
      email: 'vendas@quimicalactea.com.br',
      address: 'Belo Horizonte/MG',
      active: true,
    },
    {
      id: 'sup-002',
      name: 'Pack Minas Embalagens',
      document: '66.222.333/0001-20',
      supplierType: 'Embalagens',
      phone: '(34) 3222-8899',
      email: 'contato@packminas.com.br',
      address: 'Uberlandia/MG',
      active: true,
    },
  ],
  supplyItems: [
    {
      id: 'ins-001',
      code: 'I001',
      name: 'Coalho Liquido',
      category: 'Ingrediente',
      unitId: 'unit-l',
      minimumStock: 5,
      defaultSupplierId: 'sup-001',
      tracksExpiration: true,
      tracksLot: true,
      defaultCost: 45,
      currentStock: 15,
      active: true,
    },
    {
      id: 'ins-002',
      code: 'I002',
      name: 'Fermento Lactico',
      category: 'Ingrediente',
      unitId: 'unit-kg',
      minimumStock: 3,
      defaultSupplierId: 'sup-001',
      tracksExpiration: true,
      tracksLot: true,
      defaultCost: 65,
      currentStock: 8,
      active: true,
    },
    {
      id: 'ins-003',
      code: 'I003',
      name: 'Sal Refinado',
      category: 'Ingrediente',
      unitId: 'unit-kg',
      minimumStock: 50,
      defaultSupplierId: 'sup-001',
      tracksExpiration: false,
      tracksLot: true,
      defaultCost: 2.5,
      currentStock: 150,
      active: true,
    },
    {
      id: 'ins-004',
      code: 'I004',
      name: 'Embalagem 500g',
      category: 'Embalagem',
      unitId: 'unit-un',
      minimumStock: 200,
      defaultSupplierId: 'sup-002',
      tracksExpiration: false,
      tracksLot: false,
      defaultCost: 0.8,
      currentStock: 500,
      active: true,
    },
    {
      id: 'ins-005',
      code: 'I005',
      name: 'Fermento Iogurte',
      category: 'Ingrediente',
      unitId: 'unit-kg',
      minimumStock: 5,
      defaultSupplierId: 'sup-001',
      tracksExpiration: true,
      tracksLot: true,
      defaultCost: 120,
      currentStock: 2,
      active: true,
    },
  ],
  finishedProducts: [
    {
      id: 'prod-q001',
      code: 'PA001',
      name: 'Queijo Minas Frescal',
      category: 'Queijo',
      unitId: 'unit-kg',
      standardWeight: 1,
      shelfLifeDays: 10,
      storageTemperature: 4,
      theoreticalYield: 10,
      productionLine: 'Queijos Frescos',
      active: true,
    },
    {
      id: 'prod-q002',
      code: 'PA002',
      name: 'Queijo Mussarela',
      category: 'Queijo',
      unitId: 'unit-kg',
      standardWeight: 1,
      shelfLifeDays: 30,
      storageTemperature: 4,
      theoreticalYield: 10,
      productionLine: 'Queijos',
      active: true,
    },
    {
      id: 'prod-i001',
      code: 'PA003',
      name: 'Iogurte Natural',
      category: 'Iogurte',
      unitId: 'unit-l',
      standardWeight: 1,
      shelfLifeDays: 20,
      storageTemperature: 4,
      theoreticalYield: 1.1,
      productionLine: 'Fermentados',
      active: true,
    },
    {
      id: 'prod-m001',
      code: 'PA004',
      name: 'Manteiga com Sal',
      category: 'Manteiga',
      unitId: 'unit-kg',
      standardWeight: 0.5,
      shelfLifeDays: 90,
      storageTemperature: 6,
      theoreticalYield: 25,
      productionLine: 'Manteigaria',
      active: true,
    },
    {
      id: 'prod-r001',
      code: 'PA005',
      name: 'Requeijao Cremoso',
      category: 'Requeijao',
      unitId: 'unit-kg',
      standardWeight: 0.5,
      shelfLifeDays: 45,
      storageTemperature: 4,
      theoreticalYield: 8,
      productionLine: 'Requeijao',
      active: true,
    },
  ],
  productSpecs: [
    {
      id: 'spec-001',
      productId: 'prod-q001',
      standardMilkAmount: 10,
      idealFat: 3.2,
      idealProtein: 3.0,
      theoreticalYield: 10,
      expectedLoss: 2,
      productionNotes: 'Cortar a massa apos coagulo firme e manter resfriamento rapido.',
      active: true,
      items: [
        { id: 'spec-item-001', supplyItemId: 'ins-001', quantity: 0.05, unitId: 'unit-l' },
        { id: 'spec-item-002', supplyItemId: 'ins-002', quantity: 0.03, unitId: 'unit-kg' },
        { id: 'spec-item-003', supplyItemId: 'ins-003', quantity: 2, unitId: 'unit-kg' },
        { id: 'spec-item-004', supplyItemId: 'ins-004', quantity: 2, unitId: 'unit-un' },
      ],
    },
    {
      id: 'spec-002',
      productId: 'prod-i001',
      standardMilkAmount: 1.1,
      idealFat: 3,
      idealProtein: 2.9,
      theoreticalYield: 1.1,
      expectedLoss: 1,
      productionNotes: 'Adicionar fermento com leite estabilizado e respeitar curva de fermentacao.',
      active: true,
      items: [
        { id: 'spec-item-005', supplyItemId: 'ins-005', quantity: 0.02, unitId: 'unit-kg' },
      ],
    },
  ],
  blockReasons: [
    { id: 'br-001', name: 'Alizarol reprovado', targetType: 'Leite', autoBlock: true, active: true },
    { id: 'br-002', name: 'Antibiotico detectado', targetType: 'Leite', autoBlock: true, active: true },
    { id: 'br-003', name: 'Acidez fora do padrao', targetType: 'Leite', autoBlock: true, active: true },
    { id: 'br-004', name: 'Lote vencido', targetType: 'Insumo', autoBlock: true, active: true },
    { id: 'br-005', name: 'Bloqueio manual pela qualidade', targetType: 'Geral', autoBlock: false, active: true },
  ],
  supplyLots: [
    {
      id: 'supply-lot-001',
      supplyItemId: 'ins-001',
      supplierId: 'sup-001',
      supplierLotNumber: 'COAL-2026-01',
      internalLotCode: 'LINS-001',
      entryDate: '2026-05-02',
      manufactureDate: '2026-04-20',
      expirationDate: '2026-12-31',
      receivedQuantity: 20,
      availableQuantity: 15,
      unitCost: 45,
      totalValue: 900,
      locationId: 'loc-almox',
      status: 'Parcialmente Utilizado',
      active: true,
    },
    {
      id: 'supply-lot-002',
      supplyItemId: 'ins-002',
      supplierId: 'sup-001',
      supplierLotNumber: 'FERM-2026-02',
      internalLotCode: 'LINS-002',
      entryDate: '2026-05-04',
      manufactureDate: '2026-04-30',
      expirationDate: '2026-08-15',
      receivedQuantity: 10,
      availableQuantity: 8,
      unitCost: 65,
      totalValue: 650,
      locationId: 'loc-almox',
      status: 'Disponivel',
      active: true,
    },
    {
      id: 'supply-lot-003',
      supplyItemId: 'ins-005',
      supplierId: 'sup-001',
      supplierLotNumber: 'FERM-IOG-01',
      internalLotCode: 'LINS-003',
      entryDate: '2026-05-10',
      manufactureDate: '2026-05-01',
      expirationDate: '2026-06-30',
      receivedQuantity: 5,
      availableQuantity: 2,
      unitCost: 120,
      totalValue: 600,
      locationId: 'loc-almox',
      status: 'Disponivel',
      active: true,
    },
  ],
};
