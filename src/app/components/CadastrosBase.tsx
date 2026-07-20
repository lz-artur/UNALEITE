import { useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { format } from 'date-fns';
import {
 BadgeDollarSign,
 Boxes,
 ClipboardList,
 Factory,
 FlaskConical,
 Map,
 Milk,
 Package,
 Plus,
 ShieldAlert,
 Truck,
 UserRound,
 Warehouse,
 Ruler,
 Building2,
 Pencil,
 Power,
 Briefcase,
 Landmark,
 Tags,
 Tag,
 MoreHorizontal,
 Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
 BlockReasonRecord,
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
 SupplyLotStatus,
 TransporterRecord,
 UnitRecord,
 CostCenterRecord,
 BankAccountRecord,
 AccountingCategoryRecord,
 AccountingSubcategoryRecord,
 PaymentMethodRecord,
 PaymentTypeRecord,
} from '../data/cadastrosData';
import { useCadastros } from '../context/CadastrosContext';

type SectionKey =
 | 'producers'
 | 'routes'
 | 'transporters'
 | 'milkTypes'
 | 'qualityParameters'
 | 'milkPriceRules'
 | 'supplyItems'
 | 'suppliers'
 | 'finishedProducts'
 | 'productSpecs'
 | 'supplyLots'
 | 'blockReasons'
 | 'units'
 | 'stockLocations'
 | 'costCenters'
 | 'bankAccounts'
 | 'accountingCategories'
 | 'accountingSubcategories'
 | 'paymentMethods'
 | 'paymentTypes';

type FormState = Record<string, unknown>;

interface SectionDefinition {
 key: SectionKey;
 label: string;
 description: string;
 icon: ComponentType<{ className?: string }>;
}

const sections: SectionDefinition[] = [
 { key: 'producers', label: 'Produtores', description: 'Origem do leite cru e base para folha do leite.', icon: UserRound },
 { key: 'routes', label: 'Rotas', description: 'Linhas de coleta com regiao, motorista e vinculos.', icon: Map },
 { key: 'transporters', label: 'Transportadores', description: 'Rastreabilidade do transporte de leite e expedição.', icon: Truck },
 { key: 'milkTypes', label: 'Tipos de Matéria-prima', description: 'Padroes de recepção e prazo maximo de uso.', icon: Milk },
 { key: 'qualityParameters', label: 'Parâmetros de Qualidade', description: 'Regras laboratoriais e bloqueios automaticos.', icon: FlaskConical },
 { key: 'milkPriceRules', label: 'Regras de Preço do Leite', description: 'Preco base, bonus e penalizacoes do litro.', icon: BadgeDollarSign },
 { key: 'supplyItems', label: 'Insumos', description: 'Itens usados em produção com estoque minimo e lote.', icon: Boxes },
 { key: 'suppliers', label: 'Fornecedores', description: 'Fornecedores de insumos e embalagens.', icon: Building2 },
 { key: 'finishedProducts', label: 'Produtos Acabados', description: 'Produtos fabricados e parametros de validade.', icon: Package },
 { key: 'productSpecs', label: 'Ficha Técnica', description: 'Consumo padrao, rendimento e insumos por produto.', icon: ClipboardList },
 { key: 'supplyLots', label: 'Lotes de Insumos', description: 'Entrada, validade, custo e FEFO dos insumos.', icon: Warehouse },
 { key: 'blockReasons', label: 'Motivos de Bloqueio', description: 'Padronização dos bloqueios manuais e automáticos.', icon: ShieldAlert },
 { key: 'units', label: 'Unidades de Medida', description: 'Unidades usadas em estoque, qualidade e produção.', icon: Ruler },
 { key: 'stockLocations', label: 'Locais de Estoque', description: 'Tanques, câmaras e almoxarifados da planta.', icon: Factory },
 { key: 'costCenters', label: 'Centros de Custo', description: 'Agrupamento financeiro para despesas e receitas.', icon: Briefcase },
 { key: 'bankAccounts', label: 'Contas Bancárias', description: 'Contas usadas para pagamentos e boletos.', icon: Landmark },
 { key: 'accountingCategories', label: 'Categorias Financeiras', description: 'Categorias de receitas e despesas.', icon: Tags },
 { key: 'accountingSubcategories', label: 'Subcategorias', description: 'Detalhamento das categorias financeiras.', icon: Tag },
 { key: 'paymentMethods', label: 'Formas de Pagamento', description: 'Pix, Dinheiro, Boleto, etc.', icon: ClipboardList },
 { key: 'paymentTypes', label: 'Tipos de Pagamento', description: 'À vista, A prazo/Dividido.', icon: ClipboardList },
];

function formatDate(value?: string) {
 if (!value) {
 return '-';
 }

 try {
 return format(new Date(value), 'dd/MM/yyyy');
 } catch {
 return value;
 }
}

function formatCurrency(value?: number) {
 return `R$ ${(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

function generateId(prefix: string) {
 return `${prefix}-${Date.now()}`;
}

function EmptyState({ label }: { label: string }) {
 return (
 <div className="bg-white rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
 Nenhum registro encontrado em {label.toLowerCase()}.
 </div>
 );
}

function Field({
 label,
 value,
 onChange,
 type = 'text',
 placeholder,
 step,
 required,
}: {
 label: string;
 value: string | number;
 onChange: (value: string) => void;
 type?: string;
 placeholder?: string;
 step?: string;
 required?: boolean;
}) {
 return (
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">
 {label} {required ? '*' : null}
 </label>
 <input
 type={type}
 value={value}
 onChange={(event) => onChange(event.target.value)}
 placeholder={placeholder}
 step={step}
 className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
 />
 </div>
 );
}

function TextAreaField({
 label,
 value,
 onChange,
 rows = 3,
}: {
 label: string;
 value: string;
 onChange: (value: string) => void;
 rows?: number;
}) {
 return (
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
 <textarea
 value={value}
 onChange={(event) => onChange(event.target.value)}
 rows={rows}
 className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
 />
 </div>
 );
}

function SelectField({
 label,
 value,
 onChange,
 options,
 required,
}: {
 label: string;
 value: string;
 onChange: (value: string) => void;
 options: { label: string; value: string }[];
 required?: boolean;
}) {
 return (
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">
 {label} {required ? '*' : null}
 </label>
 <select
 value={value}
 onChange={(event) => onChange(event.target.value)}
 className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
 >
 <option value="">Selecione...</option>
 {options.map((option) => (
 <option key={option.value} value={option.value}>
 {option.label}
 </option>
 ))}
 </select>
 </div>
 );
}

function ToggleSelect({
 label,
 value,
 onChange,
}: {
 label: string;
 value: boolean;
 onChange: (value: boolean) => void;
}) {
 return (
 <SelectField
 label={label}
 value={value ? 'true' : 'false'}
 onChange={(next) => onChange(next === 'true')}
 options={[
 { label: 'Sim', value: 'true' },
 { label: 'Não', value: 'false' },
 ]}
 />
 );
}

function ActiveBadge({ active }: { active: boolean }) {
 return (
 <span
 className={`px-2 py-1 text-xs font-medium rounded-full ${
 active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'
 }`}
 >
 {active ? 'Ativo' : 'Inativo'}
 </span>
 );
}

function StatusBadge({ status }: { status: SupplyLotStatus }) {
 const classes =
 status === 'Disponivel'
 ? 'bg-green-100 text-green-800'
 : status === 'Parcialmente Utilizado'
 ? 'bg-yellow-100 text-yellow-800'
 : status === 'Bloqueado' || status === 'Vencido'
 ? 'bg-red-100 text-red-800'
 : 'bg-gray-100 text-gray-700';

 return <span className={`px-2 py-1 text-xs font-medium rounded-full ${classes}`}>{status}</span>;
}

export default function CadastrosBase({ section = 'producers' }: { section?: SectionKey }) {
 const selectedSection = section;
 const {
 producers,
 routes,
 transporters,
 milkTypes,
 qualityParameters,
 milkPriceRules,
 suppliers,
 supplyItems,
 finishedProducts,
 productSpecs,
 blockReasons,
 units,
 stockLocations,
 supplyLots,
 costCenters,
 bankAccounts,
 accountingCategories,
 accountingSubcategories,
 paymentMethods,
 paymentTypes,
 saveProducer,
 saveRoute,
 saveTransporter,
 saveMilkType,
 saveQualityParameter,
 saveMilkPriceRule,
 saveSupplier,
 saveSupplyItem,
 saveFinishedProduct,
 saveProductSpec,
 saveBlockReason,
 saveUnit,
 saveStockLocation,
 saveSupplyLot,
 saveCostCenter,
 saveBankAccount,
 saveAccountingCategory,
 saveAccountingSubcategory,
 savePaymentMethod,
 savePaymentType,
 toggleActive,
 deleteRecord,
 getUnitSymbol,
 getTransporterById,
 getProducerCountByRoute,
 getSuppliedItemsBySupplier,
 getSupplierById,
 getSupplyItemById,
 getFinishedProductById,
 getStockLocationById,
 getBlockReasonById,
 getRouteById,
 } = useCadastros();

 // const [selectedSection, setSelectedSection] = useState<SectionKey>('producers');
 const [searchTerm, setSearchTerm] = useState('');
 const [isFormOpen, setIsFormOpen] = useState(false);
 const [formState, setFormState] = useState<FormState>({});
 const [validationErrors, setValidationErrors] = useState<string[]>([]);
 const [linkedIds, setLinkedIds] = useState<string[]>([]);
 const [specItems, setSpecItems] = useState<ProductSpecItemRecord[]>([]);
 const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

 const currentSection = sections.find((section) => section.key === selectedSection)!;

 const records = useMemo(() => {
 switch (selectedSection) {
 case 'producers':
 return producers;
 case 'routes':
 return routes;
 case 'transporters':
 return transporters;
 case 'milkTypes':
 return milkTypes;
 case 'qualityParameters':
 return qualityParameters;
 case 'milkPriceRules':
 return milkPriceRules;
 case 'supplyItems':
 return supplyItems;
 case 'suppliers':
 return suppliers;
 case 'finishedProducts':
 return finishedProducts;
 case 'productSpecs':
 return productSpecs;
 case 'supplyLots':
 return supplyLots;
 case 'blockReasons':
 return blockReasons;
 case 'units':
 return units;
 case 'stockLocations':
 return stockLocations;
 case 'costCenters':
 return costCenters;
 case 'bankAccounts':
 return bankAccounts;
 case 'accountingCategories':
 return accountingCategories;
 case 'accountingSubcategories':
 return accountingSubcategories;
 case 'paymentMethods':
 return paymentMethods;
 case 'paymentTypes':
 return paymentTypes;
 default:
 return [];
 }
 }, [
 blockReasons,
 finishedProducts,
 milkPriceRules,
 milkTypes,
 producers,
 productSpecs,
 qualityParameters,
 routes,
 stockLocations,
 suppliers,
 supplyItems,
 supplyLots,
 transporters,
 units,
 costCenters,
 bankAccounts,
 accountingCategories,
 accountingSubcategories,
 paymentMethods,
 paymentTypes,
 selectedSection,
 ]);

 const filteredRecords = useMemo(() => {
 const term = searchTerm.trim().toLowerCase();
 if (!term) {
 return records;
 }

 return records.filter((record) => JSON.stringify(record).toLowerCase().includes(term));
 }, [records, searchTerm]);

 const metrics = useMemo(() => {
 const total = records.length;
 const activeCount = records.filter((record) => Boolean((record as { active?: boolean }).active)).length;

 switch (selectedSection) {
 case 'routes':
 return [
 { label: 'Total', value: total },
 { label: 'Ativas', value: activeCount },
 { label: 'Produtores Vinculados', value: producers.filter((item) => item.routeId).length },
 ];
 case 'suppliers':
 return [
 { label: 'Total', value: total },
 { label: 'Ativos', value: activeCount },
 { label: 'Insumos com Fornecedor', value: supplyItems.filter((item) => item.defaultSupplierId).length },
 ];
 case 'supplyItems':
 return [
 { label: 'Total', value: total },
 { label: 'Ativos', value: activeCount },
 { label: 'Abaixo do Mínimo', value: supplyItems.filter((item) => item.currentStock < item.minimumStock).length },
 ];
 case 'supplyLots':
 return [
 { label: 'Total', value: total },
 { label: 'Disponíveis', value: supplyLots.filter((item) => item.status === 'Disponivel').length },
 { label: 'Bloqueados/Vencidos', value: supplyLots.filter((item) => item.status === 'Bloqueado' || item.status === 'Vencido').length },
 ];
 default:
 return [
 { label: 'Total', value: total },
 { label: 'Ativos', value: activeCount },
 { label: 'Inativos', value: total - activeCount },
 ];
 }
 }, [producers, records, selectedSection, suppliers, supplyItems, supplyLots]);

 function closeForm() {
 setIsFormOpen(false);
 setFormState({});
 setValidationErrors([]);
 setLinkedIds([]);
 setSpecItems([]);
 }

 function startNew() {
 setValidationErrors([]);
 setLinkedIds([]);
 setSpecItems([]);
 setFormState(getEmptyState(selectedSection));
 setIsFormOpen(true);
 }

 function startEdit(record: unknown) {
 setValidationErrors([]);
 setFormState(record as FormState);

 if (selectedSection === 'routes') {
 const route = record as RouteRecord;
 setLinkedIds(producers.filter((item) => item.routeId === route.id).map((item) => item.id));
 } else if (selectedSection === 'suppliers') {
 const supplier = record as SupplierRecord;
 setLinkedIds(getSuppliedItemsBySupplier(supplier.id).map((item) => item.id));
 } else if (selectedSection === 'productSpecs') {
 const spec = record as ProductSpecRecord;
 setSpecItems(spec.items);
 } else {
 setLinkedIds([]);
 setSpecItems([]);
 }

 setIsFormOpen(true);
 }

 function updateField(fieldName: string, value: unknown) {
 setFormState((current) => ({
 ...current,
 [fieldName]: value,
 }));
 }

 function getEmptyState(section: SectionKey): FormState {
 switch (section) {
 case 'producers':
 return {
 id: '',
 code: '',
 name: '',
 document: '',
 farmName: '',
 routeId: '',
 phone: '',
 email: '',
 address: '',
 bankingData: '',
 notes: '',
 active: true,
 };
 case 'routes':
 return { id: '', code: '', name: '', region: '', defaultDriver: '', defaultTransporterId: '', active: true };
 case 'transporters':
 return {
 id: '',
 name: '',
 document: '',
 driverName: '',
 vehiclePlate: '',
 vehicleType: '',
 capacity: 0,
 phone: '',
 active: true,
 };
 case 'milkTypes':
 return {
 id: '',
 name: '',
 unitId: 'unit-l',
 maxUsageHours: 48,
 idealReceptionTemperature: 4,
 maxReceptionTemperature: 7,
 active: true,
 };
 case 'qualityParameters':
 return {
 id: '',
 name: '',
 dataType: 'Numero',
 unitLabel: '',
 minValue: '',
 maxValue: '',
 required: true,
 autoBlock: false,
 active: true,
 };
 case 'milkPriceRules':
 return {
 id: '',
 name: '',
 startDate: '',
 endDate: '',
 basePrice: 0,
 fatBonus: 0,
 proteinBonus: 0,
 acidityPenalty: 0,
 cbtPenalty: 0,
 ccsPenalty: 0,
 temperaturePenalty: 0,
 active: true,
 };
 case 'suppliers':
 return {
 id: '',
 name: '',
 document: '',
 supplierType: '',
 phone: '',
 email: '',
 address: '',
 active: true,
 };
 case 'supplyItems':
 return {
 id: '',
 code: '',
 name: '',
 category: '',
 unitId: 'unit-kg',
 minimumStock: 0,
 defaultSupplierId: '',
 tracksExpiration: false,
 tracksLot: true,
 defaultCost: 0,
 currentStock: 0,
 active: true,
 };
 case 'finishedProducts':
 return {
 id: '',
 code: '',
 name: '',
 category: '',
 unitId: 'unit-kg',
 standardWeight: 0,
 shelfLifeDays: 0,
 storageTemperature: 4,
 theoreticalYield: 0,
 productionLine: '',
 active: true,
 };
 case 'productSpecs':
 return {
 id: '',
 productId: '',
 standardMilkAmount: 0,
 idealFat: 0,
 idealProtein: 0,
 theoreticalYield: 0,
 expectedLoss: 0,
 productionNotes: '',
 active: true,
 };
 case 'supplyLots':
 return {
 id: '',
 supplyItemId: '',
 supplierId: '',
 supplierLotNumber: '',
 internalLotCode: '',
 entryDate: '',
 manufactureDate: '',
 expirationDate: '',
 receivedQuantity: 0,
 availableQuantity: 0,
 unitCost: 0,
 totalValue: 0,
 locationId: '',
 status: 'Disponivel',
 blockReasonId: '',
 active: true,
 };
 case 'blockReasons':
 return { id: '', name: '', targetType: 'Geral', autoBlock: false, active: true };
 case 'units':
 return { id: '', name: '', symbol: '', unitType: 'Volume', decimals: 2, active: true };
 case 'stockLocations':
 return {
 id: '',
 name: '',
 stockType: 'Insumos',
 capacity: 0,
 capacityUnitId: 'unit-kg',
 idealTemperature: 0,
 active: true,
 };
 case 'costCenters':
 return { id: '', name: '', code: '', description: '', active: true };
 case 'bankAccounts':
 return {
 id: '',
 name: '',
 bankName: '',
 agency: '',
 agencyDigit: '',
 accountNumber: '',
 accountDigit: '',
 documentType: 'CNPJ',
 documentNumber: '',
 pixKey: '',
 active: true,
 };
 case 'accountingCategories':
 return { id: '', name: '', entryType: 'Pagar', showInDre: false, active: true };
 case 'accountingSubcategories':
 return { id: '', categoryId: '', name: '', active: true };
 case 'paymentMethods':
 return { id: '', name: '', active: true };
 case 'paymentTypes':
 return { id: '', name: '', active: true };
 default:
 return {};
 }
 }

 function validateForm() {
 const errors: string[] = [];

 const hasDuplicate = <T extends { id: string }>(items: T[], predicate: (item: T) => boolean) =>
 items.some((item) => predicate(item) && item.id !== String(formState.id || ''));

 switch (selectedSection) {
 case 'producers':
 if (!formState.code) errors.push('Informe o código do produtor.');
 if (!formState.name) errors.push('Informe o nome do produtor.');
 if (!formState.document) errors.push('Informe o CPF/CNPJ.');
 if (!formState.farmName) errors.push('Informe a fazenda/propriedade.');
 if (!formState.phone) errors.push('Informe o telefone.');
 if (hasDuplicate(producers, (item) => item.code === formState.code)) errors.push('Já existe produtor com este código.');
 if (hasDuplicate(producers, (item) => item.document === formState.document)) errors.push('Já existe produtor com este CPF/CNPJ.');
 break;
 case 'routes':
 if (!formState.code) errors.push('Informe o código da rota.');
 if (!formState.name) errors.push('Informe o nome da rota.');
 if (hasDuplicate(routes, (item) => item.code === formState.code)) errors.push('Já existe rota com este código.');
 break;
 case 'transporters':
 if (!formState.name) errors.push('Informe o nome do transportador.');
 if (!formState.document) errors.push('Informe o CPF/CNPJ.');
 if (hasDuplicate(transporters, (item) => item.document === formState.document)) errors.push('Já existe transportador com este CPF/CNPJ.');
 break;
 case 'milkTypes':
 if (!formState.name) errors.push('Informe o nome do tipo de matéria-prima.');
 if (!formState.unitId) errors.push('Informe a unidade padrão.');
 if (Number(formState.maxUsageHours) <= 0) errors.push('Prazo máximo de uso deve ser maior que zero.');
 if (Number(formState.maxReceptionTemperature) <= 0) errors.push('Temperatura máxima deve ser maior que zero.');
 if (Number(formState.idealReceptionTemperature) > Number(formState.maxReceptionTemperature)) {
 errors.push('Temperatura ideal não pode ser maior que a temperatura máxima.');
 }
 break;
 case 'qualityParameters':
 if (!formState.name) errors.push('Informe o nome do parâmetro.');
 if (!formState.dataType) errors.push('Informe o tipo de dado.');
 if (formState.dataType === 'Numero' && formState.minValue !== '' && formState.maxValue !== '' && Number(formState.minValue) > Number(formState.maxValue)) {
 errors.push('Valor mínimo não pode ser maior que o valor máximo.');
 }
 break;
 case 'milkPriceRules':
 if (!formState.name) errors.push('Informe o nome da regra.');
 if (!formState.startDate || !formState.endDate) errors.push('Informe o período de vigência.');
 if (Number(formState.basePrice) <= 0) errors.push('Preço base deve ser maior que zero.');
 if (String(formState.startDate) > String(formState.endDate)) errors.push('Data inicial não pode ser maior que a data final.');
 if (
 milkPriceRules.some(
 (item) =>
 item.id !== formState.id &&
 item.active &&
 Boolean(formState.active) &&
 !(String(formState.endDate) < item.startDate || String(formState.startDate) > item.endDate),
 )
 ) {
 errors.push('Já existe outra regra ativa com vigência sobreposta.');
 }
 break;
 case 'suppliers':
 if (!formState.name) errors.push('Informe o nome/razão social.');
 if (!formState.document) errors.push('Informe o CPF/CNPJ.');
 if (!formState.supplierType) errors.push('Informe o tipo do fornecedor.');
 if (hasDuplicate(suppliers, (item) => item.document === formState.document)) errors.push('Já existe fornecedor com este CPF/CNPJ.');
 break;
 case 'supplyItems':
 if (!formState.code) errors.push('Informe o código do insumo.');
 if (!formState.name) errors.push('Informe o nome do insumo.');
 if (!formState.category) errors.push('Informe a categoria.');
 if (!formState.unitId) errors.push('Informe a unidade.');
 if (Number(formState.minimumStock) < 0) errors.push('Estoque mínimo não pode ser negativo.');
 if (hasDuplicate(supplyItems, (item) => item.code === formState.code)) errors.push('Já existe insumo com este código.');
 break;
 case 'finishedProducts':
 if (!formState.code) errors.push('Informe o código do produto.');
 if (!formState.name) errors.push('Informe o nome do produto.');
 if (!formState.category) errors.push('Informe a categoria.');
 if (!formState.unitId) errors.push('Informe a unidade.');
 if (Number(formState.shelfLifeDays) <= 0) errors.push('Prazo de validade deve ser maior que zero.');
 if (Number(formState.theoreticalYield) <= 0) errors.push('Rendimento teórico deve ser maior que zero.');
 if (hasDuplicate(finishedProducts, (item) => item.code === formState.code)) errors.push('Já existe produto com este código.');
 break;
 case 'productSpecs':
 if (!formState.productId) errors.push('Selecione o produto.');
 if (Number(formState.standardMilkAmount) <= 0) errors.push('Quantidade padrão de leite deve ser maior que zero.');
 if (Number(formState.theoreticalYield) <= 0) errors.push('Rendimento teórico deve ser maior que zero.');
 if (specItems.length === 0) errors.push('Inclua ao menos um insumo na ficha técnica.');
 if (new Set(specItems.map((item) => item.supplyItemId)).size !== specItems.length) {
 errors.push('Não repita o mesmo insumo na ficha técnica.');
 }
 if (
 productSpecs.some(
 (item) => item.id !== formState.id && item.productId === formState.productId && Boolean(formState.active),
 )
 ) {
 errors.push('Já existe ficha técnica ativa para este produto.');
 }
 break;
 case 'supplyLots':
 if (!formState.supplyItemId) errors.push('Selecione o insumo.');
 if (!formState.supplierId) errors.push('Selecione o fornecedor.');
 if (!formState.internalLotCode) errors.push('Informe o lote interno.');
 if (!formState.entryDate) errors.push('Informe a data de entrada.');
 if (!formState.locationId) errors.push('Selecione o local de estoque.');
 if (Number(formState.receivedQuantity) <= 0) errors.push('Quantidade recebida deve ser maior que zero.');
 if (Number(formState.availableQuantity) < 0 || Number(formState.availableQuantity) > Number(formState.receivedQuantity)) {
 errors.push('Quantidade disponível deve estar entre zero e a quantidade recebida.');
 }
 if (Number(formState.unitCost) < 0) errors.push('Custo unitário não pode ser negativo.');
 if (formState.status === 'Bloqueado' && !formState.blockReasonId) errors.push('Informe o motivo do bloqueio.');
 if (formState.manufactureDate && formState.expirationDate && String(formState.expirationDate) < String(formState.manufactureDate)) {
 errors.push('Data de validade não pode ser anterior à fabricação.');
 }
 if (hasDuplicate(supplyLots, (item) => item.internalLotCode === formState.internalLotCode)) errors.push('Já existe lote interno com este código.');
 break;
 case 'blockReasons':
 if (!formState.name) errors.push('Informe o motivo.');
 if (!formState.targetType) errors.push('Informe o tipo de aplicação.');
 break;
 case 'units':
 if (!formState.name) errors.push('Informe o nome da unidade.');
 if (!formState.symbol) errors.push('Informe a sigla.');
 if (hasDuplicate(units, (item) => item.symbol === formState.symbol)) errors.push('Já existe unidade com esta sigla.');
 break;
 case 'stockLocations':
 if (!formState.name) errors.push('Informe o nome do local.');
 if (!formState.stockType) errors.push('Informe o tipo de estoque.');
 if (Number(formState.capacity) < 0) errors.push('Capacidade não pode ser negativa.');
 break;
 case 'costCenters':
 if (!formState.name) errors.push('Informe o nome do centro de custo.');
 if (hasDuplicate(costCenters, (item) => item.code === formState.code && Boolean(item.code))) errors.push('Já existe centro de custo com este código.');
 break;
 case 'bankAccounts':
 if (!formState.name) errors.push('Informe o nome de identificação da conta.');
 if (hasDuplicate(bankAccounts, (item) => item.name === formState.name)) errors.push('Já existe conta com este nome.');
 break;
 case 'accountingCategories':
 if (!formState.name) errors.push('Informe o nome da categoria.');
 if (!formState.entryType) errors.push('Informe o tipo de categoria.');
 break;
 case 'accountingSubcategories':
 if (!formState.name) errors.push('Informe o nome da subcategoria.');
 if (!formState.categoryId) errors.push('Selecione uma categoria pai.');
 break;
 case 'paymentMethods':
 if (!formState.name) errors.push('Informe o nome da forma de pagamento.');
 break;
 case 'paymentTypes':
 if (!formState.name) errors.push('Informe o nome do tipo de pagamento.');
 break;
 default:
 break;
 }

 setValidationErrors(errors);
 return errors.length === 0;
 }

 function handleSave() {
 if (!validateForm()) {
 return;
 }

 switch (selectedSection) {
 case 'producers':
 saveProducer({
 ...(formState as unknown as ProducerRecord),
 id: String(formState.id || generateId('prod')),
 routeId: String(formState.routeId || '') || undefined,
 });
 break;
 case 'routes':
 saveRoute({
 route: {
 ...(formState as unknown as RouteRecord),
 id: String(formState.id || generateId('route')),
 defaultTransporterId: String(formState.defaultTransporterId || '') || undefined,
 },
 producerIds: linkedIds,
 });
 break;
 case 'transporters':
 saveTransporter({
 ...(formState as unknown as TransporterRecord),
 id: String(formState.id || generateId('transporter')),
 capacity: Number(formState.capacity) || 0,
 });
 break;
 case 'milkTypes':
 saveMilkType({
 ...(formState as unknown as MilkTypeRecord),
 id: String(formState.id || generateId('milk-type')),
 maxUsageHours: Number(formState.maxUsageHours),
 idealReceptionTemperature: Number(formState.idealReceptionTemperature) || undefined,
 maxReceptionTemperature: Number(formState.maxReceptionTemperature),
 });
 break;
 case 'qualityParameters':
 saveQualityParameter({
 ...(formState as unknown as QualityParameterRecord),
 id: String(formState.id || generateId('quality')),
 minValue: formState.minValue === '' ? undefined : Number(formState.minValue),
 maxValue: formState.maxValue === '' ? undefined : Number(formState.maxValue),
 });
 break;
 case 'milkPriceRules':
 saveMilkPriceRule({
 ...(formState as unknown as MilkPriceRuleRecord),
 id: String(formState.id || generateId('price-rule')),
 basePrice: Number(formState.basePrice),
 fatBonus: Number(formState.fatBonus),
 proteinBonus: Number(formState.proteinBonus),
 acidityPenalty: Number(formState.acidityPenalty),
 cbtPenalty: Number(formState.cbtPenalty),
 ccsPenalty: Number(formState.ccsPenalty),
 temperaturePenalty: Number(formState.temperaturePenalty),
 });
 break;
 case 'suppliers':
 saveSupplier({
 supplier: {
 ...(formState as unknown as SupplierRecord),
 id: String(formState.id || generateId('supplier')),
 },
 suppliedItemIds: linkedIds,
 });
 break;
 case 'supplyItems':
 saveSupplyItem({
 ...(formState as unknown as SupplyItemRecord),
 id: String(formState.id || generateId('item')),
 minimumStock: Number(formState.minimumStock),
 defaultCost: Number(formState.defaultCost),
 currentStock: Number(formState.currentStock),
 defaultSupplierId: String(formState.defaultSupplierId || '') || undefined,
 });
 break;
 case 'finishedProducts':
 saveFinishedProduct({
 ...(formState as unknown as FinishedProductRecord),
 id: String(formState.id || generateId('product')),
 standardWeight: Number(formState.standardWeight) || undefined,
 shelfLifeDays: Number(formState.shelfLifeDays),
 storageTemperature: Number(formState.storageTemperature) || undefined,
 theoreticalYield: Number(formState.theoreticalYield),
 });
 break;
 case 'productSpecs':
 saveProductSpec({
 ...(formState as unknown as ProductSpecRecord),
 id: String(formState.id || generateId('spec')),
 standardMilkAmount: Number(formState.standardMilkAmount),
 idealFat: Number(formState.idealFat) || undefined,
 idealProtein: Number(formState.idealProtein) || undefined,
 theoreticalYield: Number(formState.theoreticalYield),
 expectedLoss: Number(formState.expectedLoss) || undefined,
 items: specItems.map((item) => ({
 ...item,
 quantity: Number(item.quantity),
 })),
 });
 break;
 case 'supplyLots':
 saveSupplyLot({
 ...(formState as unknown as SupplyLotRecord),
 id: String(formState.id || generateId('supply-lot')),
 receivedQuantity: Number(formState.receivedQuantity),
 availableQuantity: Number(formState.availableQuantity),
 unitCost: Number(formState.unitCost),
 totalValue: Number(formState.receivedQuantity) * Number(formState.unitCost),
 blockReasonId: String(formState.blockReasonId || '') || undefined,
 });
 break;
 case 'blockReasons':
 saveBlockReason({
 ...(formState as unknown as BlockReasonRecord),
 id: String(formState.id || generateId('reason')),
 });
 break;
 case 'units':
 saveUnit({
 ...(formState as unknown as UnitRecord),
 id: String(formState.id || generateId('unit')),
 decimals: Number(formState.decimals),
 });
 break;
 case 'stockLocations':
 saveStockLocation({
 ...(formState as unknown as StockLocationRecord),
 id: String(formState.id || generateId('location')),
 capacity: Number(formState.capacity) || undefined,
 idealTemperature: Number(formState.idealTemperature) || undefined,
 capacityUnitId: String(formState.capacityUnitId || '') || undefined,
 });
 break;
 case 'costCenters':
 saveCostCenter({
 ...(formState as unknown as CostCenterRecord),
 id: String(formState.id || generateId('cost')),
 });
 break;
 case 'bankAccounts':
 saveBankAccount({
 ...(formState as unknown as BankAccountRecord),
 id: String(formState.id || generateId('bank')),
 });
 break;
 case 'accountingCategories':
 saveAccountingCategory({
 ...(formState as unknown as AccountingCategoryRecord),
 id: String(formState.id || generateId('cat')),
 });
 break;
 case 'accountingSubcategories':
 saveAccountingSubcategory({
 ...(formState as unknown as AccountingSubcategoryRecord),
 id: String(formState.id || generateId('subcat')),
 });
 break;
 case 'paymentMethods':
 savePaymentMethod({
 ...(formState as unknown as PaymentMethodRecord),
 id: String(formState.id || generateId('pm')),
 });
 break;
 case 'paymentTypes':
 savePaymentType({
 ...(formState as unknown as PaymentTypeRecord),
 id: String(formState.id || generateId('pt')),
 });
 break;
 default:
 break;
 }

 closeForm();
 }

 function renderTable() {
 if (!filteredRecords.length) {
 return <EmptyState label={currentSection.label} />;
 }

 switch (selectedSection) {
 case 'producers':
 return (
 <TableShell headers={['Código', 'Produtor', 'Documento', 'Fazenda', 'Rota', 'Status', 'Ações']}>
 {filteredRecords.map((record) => {
 const item = record as ProducerRecord;
 return (
 <tr key={item.id} className="hover:bg-gray-50">
 <Td strong>{item.code}</Td>
 <Td>{item.name}</Td>
 <Td>{item.document}</Td>
 <Td>{item.farmName}</Td>
 <Td>{getRouteById(item.routeId)?.name || '-'}</Td>
 <Td><ActiveBadge active={item.active} /></Td>
 <Td>{renderActions(item)}</Td>
 </tr>
 );
 })}
 </TableShell>
 );
 case 'routes':
 return (
 <TableShell headers={['Código', 'Rota', 'Região', 'Motorista', 'Produtores', 'Status', 'Ações']}>
 {filteredRecords.map((record) => {
 const item = record as RouteRecord;
 return (
 <tr key={item.id} className="hover:bg-gray-50">
 <Td strong>{item.code}</Td>
 <Td>{item.name}</Td>
 <Td>{item.region || '-'}</Td>
 <Td>{item.defaultDriver || '-'}</Td>
 <Td>{getProducerCountByRoute(item.id)}</Td>
 <Td><ActiveBadge active={item.active} /></Td>
 <Td>{renderActions(item)}</Td>
 </tr>
 );
 })}
 </TableShell>
 );
 case 'transporters':
 return (
 <TableShell headers={['Transportador', 'Documento', 'Motorista', 'Veículo', 'Telefone', 'Status', 'Ações']}>
 {filteredRecords.map((record) => {
 const item = record as TransporterRecord;
 return (
 <tr key={item.id} className="hover:bg-gray-50">
 <Td strong>{item.name}</Td>
 <Td>{item.document}</Td>
 <Td>{item.driverName || '-'}</Td>
 <Td>{item.vehicleType || '-'}</Td>
 <Td>{item.phone || '-'}</Td>
 <Td><ActiveBadge active={item.active} /></Td>
 <Td>{renderActions(item)}</Td>
 </tr>
 );
 })}
 </TableShell>
 );
 case 'milkTypes':
 return (
 <TableShell headers={['Tipo', 'Unidade', 'Prazo Máx.', 'Temp. Ideal', 'Temp. Máx.', 'Status', 'Ações']}>
 {filteredRecords.map((record) => {
 const item = record as MilkTypeRecord;
 return (
 <tr key={item.id} className="hover:bg-gray-50">
 <Td strong>{item.name}</Td>
 <Td>{getUnitSymbol(item.unitId)}</Td>
 <Td>{item.maxUsageHours} h</Td>
 <Td>{item.idealReceptionTemperature ?? '-'}°C</Td>
 <Td>{item.maxReceptionTemperature}°C</Td>
 <Td><ActiveBadge active={item.active} /></Td>
 <Td>{renderActions(item)}</Td>
 </tr>
 );
 })}
 </TableShell>
 );
 case 'qualityParameters':
 return (
 <TableShell headers={['Parâmetro', 'Tipo', 'Faixa', 'Obrigatório', 'Bloqueia', 'Status', 'Ações']}>
 {filteredRecords.map((record) => {
 const item = record as QualityParameterRecord;
 const range =
 item.dataType === 'Numero'
 ? `${item.minValue ?? '-'} até ${item.maxValue ?? '-'} ${item.unitLabel || ''}`.trim()
 : item.dataType;

 return (
 <tr key={item.id} className="hover:bg-gray-50">
 <Td strong>{item.name}</Td>
 <Td>{item.dataType}</Td>
 <Td>{range}</Td>
 <Td>{item.required ? 'Sim' : 'Não'}</Td>
 <Td>{item.autoBlock ? 'Sim' : 'Não'}</Td>
 <Td><ActiveBadge active={item.active} /></Td>
 <Td>{renderActions(item)}</Td>
 </tr>
 );
 })}
 </TableShell>
 );
 case 'milkPriceRules':
 return (
 <TableShell headers={['Regra', 'Vigência', 'Base/L', 'Bônus G/P', 'Penalizações', 'Status', 'Ações']}>
 {filteredRecords.map((record) => {
 const item = record as MilkPriceRuleRecord;
 return (
 <tr key={item.id} className="hover:bg-gray-50">
 <Td strong>{item.name}</Td>
 <Td>{formatDate(item.startDate)} a {formatDate(item.endDate)}</Td>
 <Td>{formatCurrency(item.basePrice)}</Td>
 <Td>{`+${item.fatBonus.toFixed(2)} / +${item.proteinBonus.toFixed(2)}`}</Td>
 <Td>{`${item.acidityPenalty.toFixed(2)} / ${item.cbtPenalty.toFixed(2)} / ${item.ccsPenalty.toFixed(2)}`}</Td>
 <Td><ActiveBadge active={item.active} /></Td>
 <Td>{renderActions(item)}</Td>
 </tr>
 );
 })}
 </TableShell>
 );
 case 'supplyItems':
 return (
 <TableShell headers={['Código', 'Insumo', 'Categoria', 'Estoque', 'Fornecedor', 'Status', 'Ações']}>
 {filteredRecords.map((record) => {
 const item = record as SupplyItemRecord;
 const symbol = getUnitSymbol(item.unitId);
 return (
 <tr key={item.id} className="hover:bg-gray-50">
 <Td strong>{item.code}</Td>
 <Td>{item.name}</Td>
 <Td>{item.category}</Td>
 <Td>{`${item.currentStock} ${symbol} / mín ${item.minimumStock} ${symbol}`}</Td>
 <Td>{getSupplierById(item.defaultSupplierId)?.name || '-'}</Td>
 <Td><ActiveBadge active={item.active} /></Td>
 <Td>{renderActions(item)}</Td>
 </tr>
 );
 })}
 </TableShell>
 );
 case 'suppliers':
 return (
 <TableShell headers={['Fornecedor', 'Documento', 'Tipo', 'Itens', 'Telefone', 'Status', 'Ações']}>
 {filteredRecords.map((record) => {
 const item = record as SupplierRecord;
 return (
 <tr key={item.id} className="hover:bg-gray-50">
 <Td strong>{item.name}</Td>
 <Td>{item.document}</Td>
 <Td>{item.supplierType}</Td>
 <Td>{getSuppliedItemsBySupplier(item.id).length}</Td>
 <Td>{item.phone || '-'}</Td>
 <Td><ActiveBadge active={item.active} /></Td>
 <Td>{renderActions(item)}</Td>
 </tr>
 );
 })}
 </TableShell>
 );
 case 'finishedProducts':
 return (
 <TableShell headers={['Código', 'Produto', 'Categoria', 'Unidade', 'Validade', 'Rendimento', 'Ações']}>
 {filteredRecords.map((record) => {
 const item = record as FinishedProductRecord;
 return (
 <tr key={item.id} className="hover:bg-gray-50">
 <Td strong>{item.code}</Td>
 <Td>{item.name}</Td>
 <Td>{item.category}</Td>
 <Td>{getUnitSymbol(item.unitId)}</Td>
 <Td>{item.shelfLifeDays} dias</Td>
 <Td>{item.theoreticalYield}</Td>
 <Td>{renderActions(item)}</Td>
 </tr>
 );
 })}
 </TableShell>
 );
 case 'productSpecs':
 return (
 <TableShell headers={['Produto', 'Leite Padrão', 'Gordura Ideal', 'Insumos', 'Rendimento', 'Status', 'Ações']}>
 {filteredRecords.map((record) => {
 const item = record as ProductSpecRecord;
 return (
 <tr key={item.id} className="hover:bg-gray-50">
 <Td strong>{getFinishedProductById(item.productId)?.name || '-'}</Td>
 <Td>{item.standardMilkAmount}</Td>
 <Td>{item.idealFat ? `${item.idealFat}%` : '-'}</Td>
 <Td>{item.items.length}</Td>
 <Td>{item.theoreticalYield}</Td>
 <Td><ActiveBadge active={item.active} /></Td>
 <Td>{renderActions(item)}</Td>
 </tr>
 );
 })}
 </TableShell>
 );
 case 'supplyLots':
 return (
 <TableShell headers={['Lote', 'Insumo', 'Fornecedor', 'Entrada', 'Saldo', 'Validade', 'Status', 'Ações']}>
 {filteredRecords.map((record) => {
 const item = record as SupplyLotRecord;
 const supplyItem = getSupplyItemById(item.supplyItemId);
 const symbol = getUnitSymbol(supplyItem?.unitId);
 return (
 <tr key={item.id} className="hover:bg-gray-50">
 <Td strong>{item.internalLotCode}</Td>
 <Td>{supplyItem?.name || '-'}</Td>
 <Td>{getSupplierById(item.supplierId)?.name || '-'}</Td>
 <Td>{formatDate(item.entryDate)}</Td>
 <Td>{`${item.availableQuantity}/${item.receivedQuantity} ${symbol}`}</Td>
 <Td>{formatDate(item.expirationDate)}</Td>
 <Td><StatusBadge status={item.status} /></Td>
 <Td>{renderActions(item, false)}</Td>
 </tr>
 );
 })}
 </TableShell>
 );
 case 'blockReasons':
 return (
 <TableShell headers={['Motivo', 'Tipo', 'Automático', 'Status', 'Ações']}>
 {filteredRecords.map((record) => {
 const item = record as BlockReasonRecord;
 return (
 <tr key={item.id} className="hover:bg-gray-50">
 <Td strong>{item.name}</Td>
 <Td>{item.targetType}</Td>
 <Td>{item.autoBlock ? 'Sim' : 'Não'}</Td>
 <Td><ActiveBadge active={item.active} /></Td>
 <Td>{renderActions(item)}</Td>
 </tr>
 );
 })}
 </TableShell>
 );
 case 'units':
 return (
 <TableShell headers={['Unidade', 'Sigla', 'Tipo', 'Decimais', 'Status', 'Ações']}>
 {filteredRecords.map((record) => {
 const item = record as UnitRecord;
 return (
 <tr key={item.id} className="hover:bg-gray-50">
 <Td strong>{item.name}</Td>
 <Td>{item.symbol}</Td>
 <Td>{item.unitType}</Td>
 <Td>{item.decimals}</Td>
 <Td><ActiveBadge active={item.active} /></Td>
 <Td>{renderActions(item)}</Td>
 </tr>
 );
 })}
 </TableShell>
 );
 case 'stockLocations':
 return (
 <TableShell headers={['Local', 'Tipo', 'Capacidade', 'Temp. Ideal', 'Status', 'Ações']}>
 {filteredRecords.map((record) => {
 const item = record as StockLocationRecord;
 return (
 <tr key={item.id} className="hover:bg-gray-50">
 <Td strong>{item.name}</Td>
 <Td>{item.stockType}</Td>
 <Td>{item.capacity ? `${item.capacity} ${getUnitSymbol(item.capacityUnitId)}` : '-'}</Td>
 <Td>{item.idealTemperature ? `${item.idealTemperature}°C` : '-'}</Td>
 <Td><ActiveBadge active={item.active} /></Td>
 <Td>{renderActions(item)}</Td>
 </tr>
 );
 })}
 </TableShell>
 );
 case 'costCenters':
 return (
 <TableShell headers={['Código', 'Centro de Custo', 'Descrição', 'Status', 'Ações']}>
 {filteredRecords.map((record) => {
 const item = record as CostCenterRecord;
 return (
 <tr key={item.id} className="hover:bg-gray-50">
 <Td strong>{item.code || '-'}</Td>
 <Td>{item.name}</Td>
 <Td>{item.description || '-'}</Td>
 <Td><ActiveBadge active={item.active} /></Td>
 <Td>{renderActions(item)}</Td>
 </tr>
 );
 })}
 </TableShell>
 );
 case 'bankAccounts':
 return (
 <TableShell headers={['Identificação', 'Banco', 'Agência', 'Conta', 'Status', 'Ações']}>
 {filteredRecords.map((record) => {
 const item = record as BankAccountRecord;
 return (
 <tr key={item.id} className="hover:bg-gray-50">
 <Td strong>{item.name}</Td>
 <Td>{item.bankName || '-'}</Td>
 <Td>{item.agency ? `${item.agency}-${item.agencyDigit || ''}` : '-'}</Td>
 <Td>{item.accountNumber ? `${item.accountNumber}-${item.accountDigit || ''}` : '-'}</Td>
 <Td><ActiveBadge active={item.active} /></Td>
 <Td>{renderActions(item)}</Td>
 </tr>
 );
 })}
 </TableShell>
 );
 case 'accountingCategories':
 return (
 <TableShell headers={['Categoria', 'Tipo', 'Exibir no DRE', 'Status', 'Ações']}>
 {filteredRecords.map((record) => {
 const item = record as AccountingCategoryRecord;
 return (
 <tr key={item.id} className="hover:bg-gray-50">
 <Td strong>{item.name}</Td>
 <Td>
 <span className={`px-2 py-1 text-xs font-medium rounded-full ${item.entryType === 'Receber' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
 {item.entryType}
 </span>
 </Td>
 <Td>{item.showInDre ? 'Sim' : 'Não'}</Td>
 <Td><ActiveBadge active={item.active} /></Td>
 <Td>{renderActions(item)}</Td>
 </tr>
 );
 })}
 </TableShell>
 );
 case 'accountingSubcategories':
 return (
 <TableShell headers={['Subcategoria', 'Categoria', 'Status', 'Ações']}>
 {filteredRecords.map((record) => {
 const item = record as AccountingSubcategoryRecord;
 const cat = accountingCategories.find(c => c.id === item.categoryId);
 return (
 <tr key={item.id} className="hover:bg-gray-50">
 <Td strong>{item.name}</Td>
 <Td>{cat?.name || '-'}</Td>
 <Td><ActiveBadge active={item.active} /></Td>
 <Td>{renderActions(item)}</Td>
 </tr>
 );
 })}
 </TableShell>
 );
 case 'paymentMethods':
 return (
 <TableShell headers={['Forma de Pagamento', 'Status', 'Ações']}>
 {filteredRecords.map((record) => {
 const item = record as PaymentMethodRecord;
 return (
 <tr key={item.id} className="hover:bg-gray-50">
 <Td strong>{item.name}</Td>
 <Td><ActiveBadge active={item.active} /></Td>
 <Td>{renderActions(item)}</Td>
 </tr>
 );
 })}
 </TableShell>
 );
 case 'paymentTypes':
 return (
 <TableShell headers={['Tipo de Pagamento', 'Status', 'Ações']}>
 {filteredRecords.map((record) => {
 const item = record as PaymentTypeRecord;
 return (
 <tr key={item.id} className="hover:bg-gray-50">
 <Td strong>{item.name}</Td>
 <Td><ActiveBadge active={item.active} /></Td>
 <Td>{renderActions(item)}</Td>
 </tr>
 );
 })}
 </TableShell>
 );
 default:
 return null;
 }
 }

 function renderActions(record: { id: string; active?: boolean }, allowToggle = true) {
 return (
 <div className="relative flex items-center gap-2">
 <button
 onClick={() => setOpenDropdownId(openDropdownId === record.id ? null : record.id)}
 className="p-1 rounded-full hover:bg-gray-100 transition-colors"
 >
 <MoreHorizontal className="w-5 h-5 text-gray-500" />
 </button>

 {openDropdownId === record.id && (
 <div className="absolute right-0 top-8 w-36 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
 <button
 onClick={() => {
 startEdit(record);
 setOpenDropdownId(null);
 }}
 className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
 >
 <Pencil className="w-4 h-4 text-blue-600" />
 Editar
 </button>
 {allowToggle && typeof record.active === 'boolean' ? (
 <button
 onClick={() => {
 toggleActive(selectedSection, record.id);
 setOpenDropdownId(null);
 }}
 className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
 >
 <Power className="w-4 h-4 text-gray-600" />
 {record.active ? 'Inativar' : 'Ativar'}
 </button>
 ) : null}
 <button
 onClick={async () => {
 if (confirm('Tem certeza que deseja excluir este registro?')) {
 try {
 await deleteRecord(selectedSection, record.id);
 toast.success('Registro excluído com sucesso!');
 } catch (e) {
 // Error is already toasted by api.ts
 }
 }
 setOpenDropdownId(null);
 }}
 className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-50 flex items-center gap-2"
 >
 <Trash2 className="w-4 h-4 text-red-600" />
 Excluir
 </button>
 </div>
 )}
 </div>
 );
 }

 function renderCommonHeader() {
 const Icon = currentSection.icon;

 return (
 <div className="flex items-start justify-between gap-6">
 <div className="flex items-start gap-4">
 <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center shadow-sm">
 <Icon className="w-7 h-7 text-white" />
 </div>
 <div>
 <h2 className="text-2xl font-bold text-gray-900">{currentSection.label}</h2>
 <p className="text-gray-600 max-w-2xl">{currentSection.description}</p>
 </div>
 </div>
 <button
 onClick={startNew}
 className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
 >
 <Plus className="w-5 h-5" />
 Novo cadastro
 </button>
 </div>
 );
 }

 function renderSectionForm() {
 switch (selectedSection) {
 case 'producers':
 return (
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <Field label="Código" required value={String(formState.code || '')} onChange={(value) => updateField('code', value)} />
 <Field label="Nome do produtor" required value={String(formState.name || '')} onChange={(value) => updateField('name', value)} />
 <Field label="CPF/CNPJ" required value={String(formState.document || '')} onChange={(value) => updateField('document', value)} />
 <Field label="Fazenda/propriedade" required value={String(formState.farmName || '')} onChange={(value) => updateField('farmName', value)} />
 <SelectField
 label="Rota de coleta"
 value={String(formState.routeId || '')}
 onChange={(value) => updateField('routeId', value)}
 options={routes.filter((item) => item.active).map((item) => ({ label: item.name, value: item.id }))}
 />
 <Field label="Telefone" required value={String(formState.phone || '')} onChange={(value) => updateField('phone', value)} />
 <Field label="E-mail" type="email" value={String(formState.email || '')} onChange={(value) => updateField('email', value)} />
 <ToggleSelect label="Ativo" value={Boolean(formState.active)} onChange={(value) => updateField('active', value)} />
 <div className="md:col-span-2">
 <TextAreaField label="Endereço" value={String(formState.address || '')} onChange={(value) => updateField('address', value)} />
 </div>
 <div className="md:col-span-2">
 <TextAreaField label="Dados bancários" value={String(formState.bankingData || '')} onChange={(value) => updateField('bankingData', value)} />
 </div>
 <div className="md:col-span-2">
 <TextAreaField label="Observações" value={String(formState.notes || '')} onChange={(value) => updateField('notes', value)} />
 </div>
 </div>
 );
 case 'routes':
 return (
 <div className="space-y-5">
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <Field label="Código" required value={String(formState.code || '')} onChange={(value) => updateField('code', value)} />
 <Field label="Nome da rota" required value={String(formState.name || '')} onChange={(value) => updateField('name', value)} />
 <Field label="Região" value={String(formState.region || '')} onChange={(value) => updateField('region', value)} />
 <Field label="Motorista padrão" value={String(formState.defaultDriver || '')} onChange={(value) => updateField('defaultDriver', value)} />
 <SelectField
 label="Transportador"
 value={String(formState.defaultTransporterId || '')}
 onChange={(value) => updateField('defaultTransporterId', value)}
 options={transporters.filter((item) => item.active).map((item) => ({ label: item.name, value: item.id }))}
 />
 <ToggleSelect label="Ativa" value={Boolean(formState.active)} onChange={(value) => updateField('active', value)} />
 </div>
 <div>
 <p className="text-sm font-medium text-gray-700 mb-2">Produtores vinculados</p>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
 {producers.map((producer) => (
 <label key={producer.id} className="flex items-center gap-3 border border-gray-200 rounded-lg px-3 py-2">
 <input
 type="checkbox"
 checked={linkedIds.includes(producer.id)}
 onChange={() =>
 setLinkedIds((current) =>
 current.includes(producer.id)
 ? current.filter((id) => id !== producer.id)
 : [...current, producer.id],
 )
 }
 />
 <span className="text-sm text-gray-700">{producer.name}</span>
 </label>
 ))}
 </div>
 </div>
 </div>
 );
 case 'transporters':
 return (
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <Field label="Nome/Razão social" required value={String(formState.name || '')} onChange={(value) => updateField('name', value)} />
 <Field label="CPF/CNPJ" required value={String(formState.document || '')} onChange={(value) => updateField('document', value)} />
 <Field label="Motorista responsável" value={String(formState.driverName || '')} onChange={(value) => updateField('driverName', value)} />
 <Field label="Placa" value={String(formState.vehiclePlate || '')} onChange={(value) => updateField('vehiclePlate', value)} />
 <Field label="Tipo de veículo" value={String(formState.vehicleType || '')} onChange={(value) => updateField('vehicleType', value)} />
 <Field label="Capacidade" type="number" value={String(formState.capacity || 0)} onChange={(value) => updateField('capacity', value)} />
 <Field label="Telefone" value={String(formState.phone || '')} onChange={(value) => updateField('phone', value)} />
 <ToggleSelect label="Ativo" value={Boolean(formState.active)} onChange={(value) => updateField('active', value)} />
 </div>
 );
 case 'milkTypes':
 return (
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <Field label="Nome" required value={String(formState.name || '')} onChange={(value) => updateField('name', value)} />
 <SelectField
 label="Unidade padrão"
 required
 value={String(formState.unitId || '')}
 onChange={(value) => updateField('unitId', value)}
 options={units.filter((item) => item.active).map((item) => ({ label: `${item.name} (${item.symbol})`, value: item.id }))}
 />
 <Field label="Prazo máximo de uso (horas)" type="number" required value={String(formState.maxUsageHours || 0)} onChange={(value) => updateField('maxUsageHours', value)} />
 <Field label="Temperatura ideal" type="number" step="0.1" value={String(formState.idealReceptionTemperature || '')} onChange={(value) => updateField('idealReceptionTemperature', value)} />
 <Field label="Temperatura máxima" type="number" step="0.1" required value={String(formState.maxReceptionTemperature || 0)} onChange={(value) => updateField('maxReceptionTemperature', value)} />
 <ToggleSelect label="Ativo" value={Boolean(formState.active)} onChange={(value) => updateField('active', value)} />
 </div>
 );
 case 'qualityParameters':
 return (
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <Field label="Nome do parâmetro" required value={String(formState.name || '')} onChange={(value) => updateField('name', value)} />
 <SelectField
 label="Tipo de dado"
 required
 value={String(formState.dataType || '')}
 onChange={(value) => updateField('dataType', value)}
 options={[
 { label: 'Número', value: 'Numero' },
 { label: 'Texto', value: 'Texto' },
 { label: 'Aprovado/Reprovado', value: 'Aprovado/Reprovado' },
 ]}
 />
 <Field label="Unidade" value={String(formState.unitLabel || '')} onChange={(value) => updateField('unitLabel', value)} />
 <Field label="Valor mínimo" type="number" step="0.001" value={String(formState.minValue || '')} onChange={(value) => updateField('minValue', value)} />
 <Field label="Valor máximo" type="number" step="0.001" value={String(formState.maxValue || '')} onChange={(value) => updateField('maxValue', value)} />
 <ToggleSelect label="Obrigatório" value={Boolean(formState.required)} onChange={(value) => updateField('required', value)} />
 <ToggleSelect label="Bloqueia automaticamente" value={Boolean(formState.autoBlock)} onChange={(value) => updateField('autoBlock', value)} />
 <ToggleSelect label="Ativo" value={Boolean(formState.active)} onChange={(value) => updateField('active', value)} />
 </div>
 );
 case 'milkPriceRules':
 return (
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <Field label="Nome da regra" required value={String(formState.name || '')} onChange={(value) => updateField('name', value)} />
 <ToggleSelect label="Ativa" value={Boolean(formState.active)} onChange={(value) => updateField('active', value)} />
 <Field label="Início da vigência" required type="date" value={String(formState.startDate || '')} onChange={(value) => updateField('startDate', value)} />
 <Field label="Fim da vigência" required type="date" value={String(formState.endDate || '')} onChange={(value) => updateField('endDate', value)} />
 <Field label="Preço base por litro" required type="number" step="0.01" value={String(formState.basePrice || 0)} onChange={(value) => updateField('basePrice', value)} />
 <Field label="Bônus por gordura" type="number" step="0.01" value={String(formState.fatBonus || 0)} onChange={(value) => updateField('fatBonus', value)} />
 <Field label="Bônus por proteína" type="number" step="0.01" value={String(formState.proteinBonus || 0)} onChange={(value) => updateField('proteinBonus', value)} />
 <Field label="Penalização por acidez" type="number" step="0.01" value={String(formState.acidityPenalty || 0)} onChange={(value) => updateField('acidityPenalty', value)} />
 <Field label="Penalização por CBT" type="number" step="0.01" value={String(formState.cbtPenalty || 0)} onChange={(value) => updateField('cbtPenalty', value)} />
 <Field label="Penalização por CCS" type="number" step="0.01" value={String(formState.ccsPenalty || 0)} onChange={(value) => updateField('ccsPenalty', value)} />
 <Field label="Penalização por temperatura" type="number" step="0.01" value={String(formState.temperaturePenalty || 0)} onChange={(value) => updateField('temperaturePenalty', value)} />
 </div>
 );
 case 'supplyItems':
 return (
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <Field label="Código" required value={String(formState.code || '')} onChange={(value) => updateField('code', value)} />
 <Field label="Nome do insumo" required value={String(formState.name || '')} onChange={(value) => updateField('name', value)} />
 <Field label="Categoria" required value={String(formState.category || '')} onChange={(value) => updateField('category', value)} />
 <SelectField
 label="Unidade"
 required
 value={String(formState.unitId || '')}
 onChange={(value) => updateField('unitId', value)}
 options={units.filter((item) => item.active).map((item) => ({ label: `${item.name} (${item.symbol})`, value: item.id }))}
 />
 <Field label="Estoque mínimo" type="number" step="0.001" value={String(formState.minimumStock || 0)} onChange={(value) => updateField('minimumStock', value)} />
 <Field label="Estoque atual" type="number" step="0.001" value={String(formState.currentStock || 0)} onChange={(value) => updateField('currentStock', value)} />
 <Field label="Custo padrão" type="number" step="0.01" value={String(formState.defaultCost || 0)} onChange={(value) => updateField('defaultCost', value)} />
 <SelectField
 label="Fornecedor padrão"
 value={String(formState.defaultSupplierId || '')}
 onChange={(value) => updateField('defaultSupplierId', value)}
 options={suppliers.filter((item) => item.active).map((item) => ({ label: item.name, value: item.id }))}
 />
 <ToggleSelect label="Controla validade" value={Boolean(formState.tracksExpiration)} onChange={(value) => updateField('tracksExpiration', value)} />
 <ToggleSelect label="Controla lote" value={Boolean(formState.tracksLot)} onChange={(value) => updateField('tracksLot', value)} />
 <ToggleSelect label="Ativo" value={Boolean(formState.active)} onChange={(value) => updateField('active', value)} />
 </div>
 );
 case 'suppliers':
 return (
 <div className="space-y-5">
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <Field label="Nome/Razão social" required value={String(formState.name || '')} onChange={(value) => updateField('name', value)} />
 <Field label="CNPJ/CPF" required value={String(formState.document || '')} onChange={(value) => updateField('document', value)} />
 <Field label="Tipo do fornecedor" required value={String(formState.supplierType || '')} onChange={(value) => updateField('supplierType', value)} />
 <Field label="Telefone" value={String(formState.phone || '')} onChange={(value) => updateField('phone', value)} />
 <Field label="E-mail" type="email" value={String(formState.email || '')} onChange={(value) => updateField('email', value)} />
 <ToggleSelect label="Ativo" value={Boolean(formState.active)} onChange={(value) => updateField('active', value)} />
 <div className="md:col-span-2">
 <TextAreaField label="Endereço" value={String(formState.address || '')} onChange={(value) => updateField('address', value)} />
 </div>
 </div>
 <div>
 <p className="text-sm font-medium text-gray-700 mb-2">Insumos fornecidos</p>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
 {supplyItems.map((item) => (
 <label key={item.id} className="flex items-center gap-3 border border-gray-200 rounded-lg px-3 py-2">
 <input
 type="checkbox"
 checked={linkedIds.includes(item.id)}
 onChange={() =>
 setLinkedIds((current) =>
 current.includes(item.id)
 ? current.filter((id) => id !== item.id)
 : [...current, item.id],
 )
 }
 />
 <span className="text-sm text-gray-700">{item.name}</span>
 </label>
 ))}
 </div>
 </div>
 </div>
 );
 case 'finishedProducts':
 return (
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <Field label="Código" required value={String(formState.code || '')} onChange={(value) => updateField('code', value)} />
 <Field label="Nome do produto" required value={String(formState.name || '')} onChange={(value) => updateField('name', value)} />
 <Field label="Categoria" required value={String(formState.category || '')} onChange={(value) => updateField('category', value)} />
 <SelectField
 label="Unidade"
 required
 value={String(formState.unitId || '')}
 onChange={(value) => updateField('unitId', value)}
 options={units.filter((item) => item.active).map((item) => ({ label: `${item.name} (${item.symbol})`, value: item.id }))}
 />
 <Field label="Peso padrão" type="number" step="0.001" value={String(formState.standardWeight || 0)} onChange={(value) => updateField('standardWeight', value)} />
 <Field label="Prazo de validade (dias)" type="number" required value={String(formState.shelfLifeDays || 0)} onChange={(value) => updateField('shelfLifeDays', value)} />
 <Field label="Temperatura de armazenamento" type="number" step="0.1" value={String(formState.storageTemperature || 0)} onChange={(value) => updateField('storageTemperature', value)} />
 <Field label="Rendimento teórico" type="number" step="0.01" required value={String(formState.theoreticalYield || 0)} onChange={(value) => updateField('theoreticalYield', value)} />
 <Field label="Linha de produção" value={String(formState.productionLine || '')} onChange={(value) => updateField('productionLine', value)} />
 <ToggleSelect label="Ativo" value={Boolean(formState.active)} onChange={(value) => updateField('active', value)} />
 </div>
 );
 case 'productSpecs':
 return (
 <div className="space-y-5">
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <SelectField
 label="Produto"
 required
 value={String(formState.productId || '')}
 onChange={(value) => updateField('productId', value)}
 options={finishedProducts.filter((item) => item.active).map((item) => ({ label: item.name, value: item.id }))}
 />
 <ToggleSelect label="Ativa" value={Boolean(formState.active)} onChange={(value) => updateField('active', value)} />
 <Field label="Litros de leite por kg/unidade" type="number" step="0.01" required value={String(formState.standardMilkAmount || 0)} onChange={(value) => updateField('standardMilkAmount', value)} />
 <Field label="Rendimento teórico" type="number" step="0.01" required value={String(formState.theoreticalYield || 0)} onChange={(value) => updateField('theoreticalYield', value)} />
 <Field label="Gordura mínima ideal" type="number" step="0.01" value={String(formState.idealFat || 0)} onChange={(value) => updateField('idealFat', value)} />
 <Field label="Proteína mínima ideal" type="number" step="0.01" value={String(formState.idealProtein || 0)} onChange={(value) => updateField('idealProtein', value)} />
 <Field label="Perda padrão esperada (%)" type="number" step="0.01" value={String(formState.expectedLoss || 0)} onChange={(value) => updateField('expectedLoss', value)} />
 </div>
 <TextAreaField label="Observações de produção" value={String(formState.productionNotes || '')} onChange={(value) => updateField('productionNotes', value)} />
 <div>
 <div className="flex items-center justify-between mb-2">
 <p className="text-sm font-medium text-gray-700">Insumos da ficha técnica</p>
 <button
 type="button"
 onClick={() =>
 setSpecItems((current) => [
 ...current,
 {
 id: generateId('spec-item'),
 supplyItemId: '',
 quantity: 0,
 unitId: 'unit-un',
 },
 ])
 }
 className="text-sm text-blue-600 hover:text-blue-800"
 >
 + Adicionar item
 </button>
 </div>
 <div className="space-y-3">
 {specItems.map((item, index) => (
 <div key={item.id} className="grid grid-cols-1 md:grid-cols-4 gap-3 border border-gray-200 rounded-lg p-3">
 <SelectField
 label={`Insumo ${index + 1}`}
 value={item.supplyItemId}
 onChange={(value) => {
 const selected = supplyItems.find((entry) => entry.id === value);
 setSpecItems((current) =>
 current.map((entry) =>
 entry.id === item.id
 ? { ...entry, supplyItemId: value, unitId: selected?.unitId || entry.unitId }
 : entry,
 ),
 );
 }}
 options={supplyItems.filter((entry) => entry.active).map((entry) => ({ label: entry.name, value: entry.id }))}
 />
 <Field
 label="Quantidade"
 type="number"
 step="0.001"
 value={String(item.quantity)}
 onChange={(value) =>
 setSpecItems((current) =>
 current.map((entry) => (entry.id === item.id ? { ...entry, quantity: Number(value) } : entry)),
 )
 }
 />
 <SelectField
 label="Unidade"
 value={item.unitId}
 onChange={(value) =>
 setSpecItems((current) =>
 current.map((entry) => (entry.id === item.id ? { ...entry, unitId: value } : entry)),
 )
 }
 options={units.filter((entry) => entry.active).map((entry) => ({ label: `${entry.name} (${entry.symbol})`, value: entry.id }))}
 />
 <div className="flex items-end">
 <button
 type="button"
 onClick={() => setSpecItems((current) => current.filter((entry) => entry.id !== item.id))}
 className="w-full px-3 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
 >
 Remover
 </button>
 </div>
 </div>
 ))}
 </div>
 </div>
 </div>
 );
 case 'supplyLots':
 return (
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <SelectField
 label="Insumo"
 required
 value={String(formState.supplyItemId || '')}
 onChange={(value) => updateField('supplyItemId', value)}
 options={supplyItems.filter((item) => item.active).map((item) => ({ label: item.name, value: item.id }))}
 />
 <SelectField
 label="Fornecedor"
 required
 value={String(formState.supplierId || '')}
 onChange={(value) => updateField('supplierId', value)}
 options={suppliers.filter((item) => item.active).map((item) => ({ label: item.name, value: item.id }))}
 />
 <Field label="Lote do fornecedor" value={String(formState.supplierLotNumber || '')} onChange={(value) => updateField('supplierLotNumber', value)} />
 <Field label="Lote interno" required value={String(formState.internalLotCode || '')} onChange={(value) => updateField('internalLotCode', value)} />
 <Field label="Data de entrada" type="date" required value={String(formState.entryDate || '')} onChange={(value) => updateField('entryDate', value)} />
 <Field label="Data de fabricação" type="date" value={String(formState.manufactureDate || '')} onChange={(value) => updateField('manufactureDate', value)} />
 <Field label="Data de validade" type="date" value={String(formState.expirationDate || '')} onChange={(value) => updateField('expirationDate', value)} />
 <Field label="Quantidade recebida" type="number" step="0.001" required value={String(formState.receivedQuantity || 0)} onChange={(value) => updateField('receivedQuantity', value)} />
 <Field label="Quantidade disponível" type="number" step="0.001" required value={String(formState.availableQuantity || 0)} onChange={(value) => updateField('availableQuantity', value)} />
 <Field label="Custo unitário" type="number" step="0.01" required value={String(formState.unitCost || 0)} onChange={(value) => updateField('unitCost', value)} />
 <SelectField
 label="Local de estoque"
 required
 value={String(formState.locationId || '')}
 onChange={(value) => updateField('locationId', value)}
 options={stockLocations.filter((item) => item.active && item.stockType === 'Insumos').map((item) => ({ label: item.name, value: item.id }))}
 />
 <SelectField
 label="Status"
 value={String(formState.status || 'Disponivel')}
 onChange={(value) => updateField('status', value)}
 options={[
 { label: 'Disponível', value: 'Disponivel' },
 { label: 'Bloqueado', value: 'Bloqueado' },
 { label: 'Vencido', value: 'Vencido' },
 { label: 'Parcialmente Utilizado', value: 'Parcialmente Utilizado' },
 { label: 'Utilizado', value: 'Utilizado' },
 ]}
 />
 <SelectField
 label="Motivo do bloqueio"
 value={String(formState.blockReasonId || '')}
 onChange={(value) => updateField('blockReasonId', value)}
 options={blockReasons.filter((item) => item.active).map((item) => ({ label: item.name, value: item.id }))}
 />
 <ToggleSelect label="Ativo" value={Boolean(formState.active)} onChange={(value) => updateField('active', value)} />
 </div>
 );
 case 'blockReasons':
 return (
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <Field label="Nome do motivo" required value={String(formState.name || '')} onChange={(value) => updateField('name', value)} />
 <SelectField
 label="Tipo"
 required
 value={String(formState.targetType || '')}
 onChange={(value) => updateField('targetType', value)}
 options={[
 { label: 'Leite', value: 'Leite' },
 { label: 'Insumo', value: 'Insumo' },
 { label: 'Produto Acabado', value: 'Produto Acabado' },
 { label: 'Geral', value: 'Geral' },
 ]}
 />
 <ToggleSelect label="Bloqueio automático" value={Boolean(formState.autoBlock)} onChange={(value) => updateField('autoBlock', value)} />
 <ToggleSelect label="Ativo" value={Boolean(formState.active)} onChange={(value) => updateField('active', value)} />
 </div>
 );
 case 'units':
 return (
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <Field label="Nome da unidade" required value={String(formState.name || '')} onChange={(value) => updateField('name', value)} />
 <Field label="Sigla" required value={String(formState.symbol || '')} onChange={(value) => updateField('symbol', value)} />
 <SelectField
 label="Tipo"
 required
 value={String(formState.unitType || '')}
 onChange={(value) => updateField('unitType', value)}
 options={[
 { label: 'Volume', value: 'Volume' },
 { label: 'Peso', value: 'Peso' },
 { label: 'Unidade', value: 'Unidade' },
 ]}
 />
 <Field label="Casas decimais" type="number" value={String(formState.decimals || 0)} onChange={(value) => updateField('decimals', value)} />
 <ToggleSelect label="Ativa" value={Boolean(formState.active)} onChange={(value) => updateField('active', value)} />
 </div>
 );
 case 'stockLocations':
 return (
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <Field label="Nome do local" required value={String(formState.name || '')} onChange={(value) => updateField('name', value)} />
 <SelectField
 label="Tipo de estoque"
 required
 value={String(formState.stockType || '')}
 onChange={(value) => updateField('stockType', value)}
 options={[
 { label: 'Leite Cru', value: 'Leite Cru' },
 { label: 'Insumos', value: 'Insumos' },
 { label: 'Produto Acabado', value: 'Produto Acabado' },
 ]}
 />
 <Field label="Capacidade máxima" type="number" step="0.001" value={String(formState.capacity || 0)} onChange={(value) => updateField('capacity', value)} />
 <SelectField
 label="Unidade da capacidade"
 value={String(formState.capacityUnitId || '')}
 onChange={(value) => updateField('capacityUnitId', value)}
 options={units.filter((item) => item.active).map((item) => ({ label: `${item.name} (${item.symbol})`, value: item.id }))}
 />
 <Field label="Temperatura ideal" type="number" step="0.1" value={String(formState.idealTemperature || 0)} onChange={(value) => updateField('idealTemperature', value)} />
 <ToggleSelect label="Ativo" value={Boolean(formState.active)} onChange={(value) => updateField('active', value)} />
 </div>
 );
 case 'costCenters':
 return (
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <Field label="Nome" required value={String(formState.name || '')} onChange={(value) => updateField('name', value)} />
 <Field label="Código" value={String(formState.code || '')} onChange={(value) => updateField('code', value)} />
 <div className="md:col-span-2">
 <TextAreaField label="Descrição" value={String(formState.description || '')} onChange={(value) => updateField('description', value)} />
 </div>
 <ToggleSelect label="Ativo" value={Boolean(formState.active)} onChange={(value) => updateField('active', value)} />
 </div>
 );
 case 'bankAccounts':
 return (
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <Field label="Nome da conta (Identificação)" required value={String(formState.name || '')} onChange={(value) => updateField('name', value)} />
 <Field label="Banco" value={String(formState.bankName || '')} onChange={(value) => updateField('bankName', value)} />
 <Field label="Agência" value={String(formState.agency || '')} onChange={(value) => updateField('agency', value)} />
 <Field label="Dígito da Agência" value={String(formState.agencyDigit || '')} onChange={(value) => updateField('agencyDigit', value)} />
 <Field label="Número da Conta" value={String(formState.accountNumber || '')} onChange={(value) => updateField('accountNumber', value)} />
 <Field label="Dígito da Conta" value={String(formState.accountDigit || '')} onChange={(value) => updateField('accountDigit', value)} />
 <SelectField label="Tipo do Documento" value={String(formState.documentType || 'CNPJ')} onChange={(value) => updateField('documentType', value)} options={[{ label: 'CNPJ', value: 'CNPJ' }, { label: 'CPF', value: 'CPF' }]} />
 <Field label="Número do Documento (CPF/CNPJ)" value={String(formState.documentNumber || '')} onChange={(value) => updateField('documentNumber', value)} />
 <Field label="Chave PIX" value={String(formState.pixKey || '')} onChange={(value) => updateField('pixKey', value)} />
 <ToggleSelect label="Ativo" value={Boolean(formState.active)} onChange={(value) => updateField('active', value)} />
 </div>
 );
 case 'accountingCategories':
 return (
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <Field label="Nome da Categoria" required value={String(formState.name || '')} onChange={(value) => updateField('name', value)} />
 <SelectField
 label="Tipo de Lançamento"
 required
 value={String(formState.entryType || 'Pagar')}
 onChange={(value) => updateField('entryType', value)}
 options={[
 { label: 'Despesa (Pagar)', value: 'Pagar' },
 { label: 'Receita (Receber)', value: 'Receber' },
 ]}
 />
 <ToggleSelect label="Exibir no DRE?" value={Boolean(formState.showInDre)} onChange={(value) => updateField('showInDre', value)} />
 <ToggleSelect label="Ativo" value={Boolean(formState.active)} onChange={(value) => updateField('active', value)} />
 </div>
 );
 case 'accountingSubcategories':
 return (
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <SelectField
 label="Categoria Vinculada"
 required
 value={String(formState.categoryId || '')}
 onChange={(value) => updateField('categoryId', value)}
 options={accountingCategories.filter(item => item.active).map(item => ({ label: `${item.name} (${item.entryType})`, value: item.id }))}
 />
 <Field label="Nome da Subcategoria" required value={String(formState.name || '')} onChange={(value) => updateField('name', value)} />
 <ToggleSelect label="Ativo" value={Boolean(formState.active)} onChange={(value) => updateField('active', value)} />
 </div>
 );
 case 'paymentMethods':
 return (
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <Field label="Nome da Forma de Pagamento" required value={String(formState.name || '')} onChange={(value) => updateField('name', value)} />
 <ToggleSelect label="Ativo" value={Boolean(formState.active)} onChange={(value) => updateField('active', value)} />
 </div>
 );
 case 'paymentTypes':
 return (
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <Field label="Nome do Tipo de Pagamento" required value={String(formState.name || '')} onChange={(value) => updateField('name', value)} />
 <ToggleSelect label="Ativo" value={Boolean(formState.active)} onChange={(value) => updateField('active', value)} />
 </div>
 );
 default:
 return null;
 }
 }

 return (
 <div className="space-y-6">
 {renderCommonHeader()}

 <div className="w-full">
 <div className="space-y-6">
 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
 {metrics.map((metric) => (
 <div key={metric.label} className="bg-white rounded-xl border border-gray-200 p-5">
 <p className="text-sm text-gray-600">{metric.label}</p>
 <p className="text-2xl font-bold text-gray-900 mt-1">{metric.value}</p>
 </div>
 ))}
 </div>

 <div className="bg-white rounded-xl border border-gray-200 p-4">
 <input
 type="text"
 value={searchTerm}
 onChange={(event) => setSearchTerm(event.target.value)}
 placeholder={`Buscar em ${currentSection.label.toLowerCase()}...`}
 className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
 />
 </div>

 <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
 <div className="p-4 border-b border-gray-200">
 <h3 className="font-bold text-gray-900">{currentSection.label}</h3>
 <p className="text-sm text-gray-600 mt-1">{filteredRecords.length} registro(s) exibido(s)</p>
 </div>
 <div className="overflow-x-auto">{renderTable()}</div>
 </div>
 </div>
 </div>

 {isFormOpen ? (
 <div className="fixed inset-0 z-50 bg-black/50 p-4 flex items-center justify-center">
 <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[90vh] overflow-y-auto">
 <div className="p-6 border-b border-gray-200">
 <h3 className="text-xl font-bold text-gray-900">
 {formState.id ? 'Editar' : 'Novo'} {currentSection.label}
 </h3>
 <p className="text-sm text-gray-600 mt-1">{currentSection.description}</p>
 </div>

 <div className="p-6 space-y-5">
 {validationErrors.length ? (
 <div className="bg-red-50 border border-red-200 rounded-xl p-4">
 <p className="font-medium text-red-800 mb-2">Corrija os pontos abaixo:</p>
 <ul className="list-disc pl-5 text-sm text-red-700 space-y-1">
 {validationErrors.map((error) => (
 <li key={error}>{error}</li>
 ))}
 </ul>
 </div>
 ) : null}
 {renderSectionForm()}
 </div>

 <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
 <button
 onClick={closeForm}
 className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
 >
 Cancelar
 </button>
 <button
 onClick={handleSave}
 className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
 >
 Salvar cadastro
 </button>
 </div>
 </div>
 </div>
 ) : null}
 </div>
 );
}

function TableShell({
 headers,
 children,
}: {
 headers: string[];
 children: ReactNode;
}) {
 return (
 <table className="w-full">
 <thead className="bg-gray-50">
 <tr>
 {headers.map((header) => (
 <th key={header} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
 {header}
 </th>
 ))}
 </tr>
 </thead>
 <tbody className="divide-y divide-gray-200">{children}</tbody>
 </table>
 );
}

function Td({
 children,
 strong = false,
}: {
 children: ReactNode;
 strong?: boolean;
}) {
 return (
 <td className={`px-6 py-4 text-sm ${strong ? 'font-medium text-gray-900' : 'text-gray-700'}`}>
 {children}
 </td>
 );
}
