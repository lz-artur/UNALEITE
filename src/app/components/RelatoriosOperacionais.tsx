import { useEffect, useState, useMemo, type ReactNode } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Boxes,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  FileSpreadsheet,
  FileText,
  Loader2,
  Minus,
  PackageCheck,
  RefreshCw,
  Search,
  ShoppingBag,
  TrendingUp,
  X,
} from 'lucide-react';
import { format } from 'date-fns';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend as RechartsLegend,
} from 'recharts';
import { useCadastros } from '../context/CadastrosContext';
import {
  loadPricingReport,
  loadProductionReport,
  loadQualityReport,
  loadSalesReport,
  loadStockMovementsReport,
  loadStockVsSalesReport,
  type PricingReportResponse,
  type ProductionReportResponse,
  type QualityReportResponse,
  type SalesReportResponse,
  type StockMovementsReportResponse,
  type StockVsSalesReportResponse,
} from '../services/operationsApi';

type ReportTab = 'sales' | 'stockVsSales' | 'production' | 'quality' | 'pricing' | 'stockMovements';
type ExportCell = string | number | boolean | null;

type ExportData = {
  fileName: string;
  sheetName: string;
  headers: string[];
  rows: ExportCell[][];
};

function getDefaultPeriod() {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    startDate: firstDay.toISOString().slice(0, 10),
    endDate: now.toISOString().slice(0, 10),
  };
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Nao foi possivel carregar o relatorio.';
}

export default function RelatoriosOperacionais() {
  const [activeTab, setActiveTab] = useState<ReportTab>('stockVsSales');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    ...getDefaultPeriod(),
    productId: '',
    producerId: '',
    status: '',
    movementType: '',
    lotType: '',
  });
  const [productionReport, setProductionReport] = useState<ProductionReportResponse | null>(null);
  const [qualityReport, setQualityReport] = useState<QualityReportResponse | null>(null);
  const [pricingReport, setPricingReport] = useState<PricingReportResponse | null>(null);
  const [salesReport, setSalesReport] = useState<SalesReportResponse | null>(null);
  const [stockMovementsReport, setStockMovementsReport] = useState<StockMovementsReportResponse | null>(null);
  const [stockVsSalesReport, setStockVsSalesReport] = useState<StockVsSalesReportResponse | null>(null);
  const { finishedProducts, producers } = useCadastros();
  const exportData = getExportData(activeTab, salesReport, productionReport, qualityReport, pricingReport, stockMovementsReport, stockVsSalesReport);

  const loadCurrentReport = async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      if (activeTab === 'sales') {
        const report = await loadSalesReport({
          startDate: filters.startDate,
          endDate: filters.endDate,
          productId: filters.productId || undefined,
          status: filters.status || undefined,
        });
        setSalesReport(report);
      } else if (activeTab === 'stockVsSales') {
        const report = await loadStockVsSalesReport({
          startDate: filters.startDate,
          endDate: filters.endDate,
          productId: filters.productId || undefined,
        });
        setStockVsSalesReport(report);
      } else if (activeTab === 'production') {
        const report = await loadProductionReport({
          startDate: filters.startDate,
          endDate: filters.endDate,
          productId: filters.productId || undefined,
          status: filters.status || undefined,
        });
        setProductionReport(report);
      } else if (activeTab === 'quality') {
        const report = await loadQualityReport({
          startDate: filters.startDate,
          endDate: filters.endDate,
          producerId: filters.producerId || undefined,
          status: filters.status || undefined,
        });
        setQualityReport(report);
      } else if (activeTab === 'pricing') {
        const report = await loadPricingReport({
          startDate: filters.startDate,
          endDate: filters.endDate,
          producerId: filters.producerId || undefined,
          status: filters.status || undefined,
        });
        setPricingReport(report);
      } else {
        const report = await loadStockMovementsReport({
          startDate: filters.startDate,
          endDate: filters.endDate,
          movementType: filters.movementType || undefined,
          lotType: filters.lotType || undefined,
        });
        setStockMovementsReport(report);
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCurrentReport();
  }, [activeTab]);

  const applyFilters = () => {
    void loadCurrentReport();
  };

  const exportCurrentReport = async (fileType: 'csv' | 'xlsx') => {
    if (!exportData) return;

    const XLSX = await import('xlsx');
    const worksheet = XLSX.utils.aoa_to_sheet([exportData.headers, ...exportData.rows]);
    if (fileType === 'xlsx') {
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, exportData.sheetName);
      XLSX.writeFile(workbook, `${exportData.fileName}.xlsx`, { compression: true });
      return;
    }

    const csv = XLSX.utils.sheet_to_csv(worksheet, { FS: ';' });
    const file = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(file);
    link.download = `${exportData.fileName}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Relatorios operacionais</h2>
          <p className="text-gray-600">Acompanhe vendas, produção, qualidade, precificação e movimentações de estoque por período</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            onClick={() => exportCurrentReport('csv')}
            disabled={!exportData || loading}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FileText className="h-4 w-4" />
            CSV
          </button>
          <button
            onClick={() => exportCurrentReport('xlsx')}
            disabled={!exportData || loading}
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Excel
          </button>
          <button
            onClick={applyFilters}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex border-b border-gray-200">
          {[
            { key: 'stockVsSales', label: 'Série Histórica: Estoque vs Vendas' },
            { key: 'sales', label: 'Vendas realizadas' },
            { key: 'production', label: 'Produção e custos' },
            { key: 'quality', label: 'Qualidade' },
            { key: 'pricing', label: 'Precificacao' },
            { key: 'stockMovements', label: 'Movimentações de estoque' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as ReportTab)}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'border-b-2 border-blue-600 bg-blue-50 text-blue-700 font-semibold'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="p-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <FilterField
              label="Data inicial"
              type="date"
              value={filters.startDate}
              onChange={(value) => setFilters((current) => ({ ...current, startDate: value }))}
            />
            <FilterField
              label="Data final"
              type="date"
              value={filters.endDate}
              onChange={(value) => setFilters((current) => ({ ...current, endDate: value }))}
            />
            {activeTab === 'stockMovements' ? (
              <FilterSelect
                label="Movimentação"
                value={filters.movementType}
                onChange={(value) => setFilters((current) => ({ ...current, movementType: value }))}
                options={[
                  { label: 'Todas', value: '' },
                  { label: 'Entradas', value: 'entrada' },
                  { label: 'Saídas', value: 'saida' },
                ]}
              />
            ) : activeTab === 'production' || activeTab === 'sales' || activeTab === 'stockVsSales' ? (
              <FilterSelect
                label="Produto"
                value={filters.productId}
                onChange={(value) => setFilters((current) => ({ ...current, productId: value }))}
                options={[
                  { label: 'Todos os produtos', value: '' },
                  ...finishedProducts
                    .filter((product) => product.active)
                    .map((product) => ({ label: product.name, value: product.id })),
                ]}
              />
            ) : (
              <FilterSelect
                label="Produtor"
                value={filters.producerId}
                onChange={(value) => setFilters((current) => ({ ...current, producerId: value }))}
                options={[
                  { label: 'Todos', value: '' },
                  ...producers
                    .filter((producer) => producer.active)
                    .map((producer) => ({ label: producer.name, value: producer.id })),
                ]}
              />
            )}
            {activeTab === 'stockMovements' ? (
              <FilterSelect
                label="Tipo de estoque"
                value={filters.lotType}
                onChange={(value) => setFilters((current) => ({ ...current, lotType: value }))}
                options={[
                  { label: 'Todos', value: '' },
                  { label: 'Insumo', value: 'Insumo' },
                  { label: 'Produto acabado', value: 'Produto Acabado' },
                  { label: 'Leite', value: 'Leite' },
                ]}
              />
            ) : activeTab === 'stockVsSales' ? (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Atalhos de período</label>
                <div className="flex gap-1.5 pt-0.5">
                  {[
                    { label: '30d', days: 30 },
                    { label: '60d', days: 60 },
                    { label: '90d', days: 90 },
                    { label: 'Mês', isCurrentMonth: true },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        const now = new Date();
                        const end = now.toISOString().slice(0, 10);
                        let start = '';
                        if (preset.isCurrentMonth) {
                          start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
                        } else {
                          const past = new Date(now);
                          past.setDate(past.getDate() - (preset.days ?? 30));
                          start = past.toISOString().slice(0, 10);
                        }
                        setFilters((current) => ({ ...current, startDate: start, endDate: end }));
                      }}
                      className="flex-1 rounded-lg border border-gray-200 bg-gray-50 py-2 text-xs font-semibold text-gray-700 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition-colors"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <FilterSelect
                label="Status"
                value={filters.status}
                onChange={(value) => setFilters((current) => ({ ...current, status: value }))}
                options={statusOptionsByTab[activeTab]}
              />
            )}
          </div>
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {errorMessage}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white p-10 text-sm text-gray-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          Carregando relatorio...
        </div>
      ) : activeTab === 'stockVsSales' ? (
        <StockVsSalesReportView report={stockVsSalesReport} />
      ) : activeTab === 'sales' ? (
        <SalesReportView report={salesReport} />
      ) : activeTab === 'production' ? (
        <ProductionReportView report={productionReport} />
      ) : activeTab === 'quality' ? (
        <QualityReportView report={qualityReport} />
      ) : activeTab === 'pricing' ? (
        <PricingReportView report={pricingReport} />
      ) : (
        <StockMovementsReportView report={stockMovementsReport} />
      )}
    </div>
  );
}

const statusOptionsByTab: Record<ReportTab, Array<{ label: string; value: string }>> = {
  stockVsSales: [],
  sales: [
    { label: 'Todos', value: '' },
    { label: 'Faturado', value: 'Faturado' },
    { label: 'Não faturado', value: 'Não faturado' },
  ],
  production: [
    { label: 'Todos', value: '' },
    { label: 'Em Andamento', value: 'Em Andamento' },
    { label: 'Finalizada', value: 'Finalizada' },
    { label: 'Cancelada', value: 'Cancelada' },
  ],
  quality: [
    { label: 'Todos', value: '' },
    { label: 'Aprovado', value: 'Aprovado' },
    { label: 'Reprovado', value: 'Reprovado' },
  ],
  pricing: [
    { label: 'Todos', value: '' },
    { label: 'Aprovado', value: 'Aprovado' },
    { label: 'Bloqueado', value: 'Bloqueado' },
    { label: 'Parcialmente Utilizado', value: 'Parcialmente Utilizado' },
    { label: 'Utilizado', value: 'Utilizado' },
  ],
  stockMovements: [],
};

function getExportData(
  activeTab: ReportTab,
  salesReport: SalesReportResponse | null,
  productionReport: ProductionReportResponse | null,
  qualityReport: QualityReportResponse | null,
  pricingReport: PricingReportResponse | null,
  stockMovementsReport: StockMovementsReportResponse | null,
  stockVsSalesReport: StockVsSalesReportResponse | null,
): ExportData | null {
  if (activeTab === 'stockVsSales' && stockVsSalesReport) {
    return {
      fileName: 'relatorio-serie-historica-estoque-vendas',
      sheetName: 'Estoque vs Vendas',
      headers: ['Data', 'Estoque Disponível (kg)', 'Vendas Realizadas (kg)', 'Faturamento (R$)', 'Produção/Entradas (kg)', 'Balanço Líquido (kg)'],
      rows: stockVsSalesReport.timeline.map((row) => [
        format(new Date(row.date + 'T12:00:00'), 'dd/MM/yyyy'),
        row.availableStock,
        row.salesQuantity,
        row.salesValue,
        row.productionQuantity,
        Math.round((row.productionQuantity - row.salesQuantity) * 100) / 100,
      ]),
    };
  }

  if (activeTab === 'sales' && salesReport) {
    return {
      fileName: 'relatorio-vendas-realizadas',
      sheetName: 'Vendas realizadas',
      headers: ['Data', 'Pedido', 'Comprador', 'Documento', 'Faturado', 'NF-e', 'Vendedor', 'Produto', 'Lote', 'Quantidade', 'Devolvido', 'Preço unitário', 'Custo do lote', 'Valor da venda', 'Margem bruta'],
      rows: salesReport.rows.map((row) => [
        format(new Date(row.fulfilledAt), 'dd/MM/yyyy'), row.orderNumber, row.clientName, row.clientDocument,
        row.invoiced ? 'Sim' : 'Não', row.invoiceNumber, row.sellerName, row.productName, row.productLotCode,
        row.quantity, row.returnedQuantity, row.unitPrice, row.costValue, row.saleValue, row.grossMargin,
      ]),
    };
  }

  if (activeTab === 'production' && productionReport) {
    return {
      fileName: 'relatorio-producao-custos',
      sheetName: 'Produção e custos',
      headers: ['OP', 'Produto', 'Lote produzido', 'Lote de leite', 'Status', 'Litros de leite', 'Reprocessamento', 'Creme', 'Kg gerados', 'Entrada por kg', 'Custo leite', 'Custo insumos', 'Custo reprocessamento', 'Custo creme', 'Custo total', 'Custo por kg', 'Insumos utilizados'],
      rows: productionReport.rows.map((row) => [
        row.orderNumber, row.productName, row.productLotCode, row.milkLotCode, row.status, row.milkLiters,
        row.reprocessedQuantity, row.creamQuantity, row.actualQuantityProduced, row.actualYield,
        row.milkCost, row.suppliesCost, row.reprocessingCost, row.creamCost, row.totalCost, row.costPerKg,
        row.inputs.map((input) => `${input.category}: ${input.name} (${input.quantity})`).join(' | '),
      ]),
    };
  }

  if (activeTab === 'quality' && qualityReport) {
    return {
      fileName: 'relatorio-qualidade',
      sheetName: 'Qualidade',
      headers: ['Data', 'Lote', 'Produtor', 'Status', 'Alizarol', 'Antibiótico', 'Gordura', 'Proteína', 'Acidez', 'CBT', 'CCS'],
      rows: qualityReport.rows.map((row) => [
        format(new Date(row.analyzedAt), 'dd/MM/yyyy HH:mm'), row.lotCode, row.producerName, row.status,
        row.alizarol, row.antibioticos, row.gordura, row.proteina, row.acidez, row.cbt, row.ccs,
      ]),
    };
  }

  if (activeTab === 'pricing' && pricingReport) {
    return {
      fileName: 'relatorio-precificacao-leite',
      sheetName: 'Precificação',
      headers: ['Data', 'Lote', 'Produtor', 'Status', 'Volume (L)', 'Preço base', 'Preço final', 'Bônus gordura', 'Bônus proteína', 'Penalidade acidez', 'Penalidade CBT', 'Penalidade CCS', 'Valor total'],
      rows: pricingReport.rows.map((row) => [
        format(new Date(row.createdAt), 'dd/MM/yyyy HH:mm'), row.lotCode, row.producerName, row.lotStatus,
        row.volumeLiters, row.basePrice, row.finalPrice, row.fatBonus, row.proteinBonus, row.acidityPenalty,
        row.cbtPenalty, row.ccsPenalty, row.totalValue,
      ]),
    };
  }

  if (activeTab === 'stockMovements' && stockMovementsReport) {
    return {
      fileName: 'relatorio-movimentacoes-estoque',
      sheetName: 'Movimentações de estoque',
      headers: ['Data', 'Movimentação', 'Tipo de estoque', 'Item', 'Código', 'Lote', 'Quantidade', 'Peças', 'Origem'],
      rows: stockMovementsReport.rows.map((row) => [
        format(new Date(row.occurredAt), 'dd/MM/yyyy HH:mm'),
        row.movementType === 'entrada' ? 'Entrada' : 'Saída', row.lotType, row.itemName,
        row.itemCode, row.lotCode, row.quantity, row.piecesQuantity, row.reference,
      ]),
    };
  }

  return null;
}

function ProductionReportView({ report }: { report: ProductionReportResponse | null }) {
  const [selectedRow, setSelectedRow] = useState<ProductionReportResponse['rows'][number] | null>(null);

  if (!report || report.rows.length === 0) {
    return <EmptyReport message="Nenhuma ordem encontrada para os filtros selecionados." />;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3 xl:grid-cols-6">
        <SummaryCard title="Ordens" value={report.totals.ordersCount} />
        <SummaryCard title="Litros planejados" value={`${report.totals.litersPlanned.toLocaleString('pt-BR')} L`} />
        <SummaryCard title="Kg produzidos" value={report.totals.actualQuantityProduced.toFixed(2)} />
        <SummaryCard title="Custo total" value={formatCurrency(report.totals.totalCost)} />
        <SummaryCard title="Custo médio/kg" value={formatCurrency(report.totals.costPerKg)} />
        <SummaryCard title="Rendimento esperado" value={report.totals.expectedYield.toFixed(2)} />
      </div>
      <DataTable
        headers={[
          'OP', 'Produto', 'Lote produzido', 'Insumos utilizados', 'Leite', 'Insumos', 'Reprocessamento',
          'Creme', 'Custo total', 'Custo/kg', 'Base do rendimento', 'Entrada/kg', 'Kg gerados', 'Status',
        ]}
        rows={report.rows.map((row) => [
          row.orderNumber,
          row.productName,
          row.productLotCode,
          row.inputs.length
            ? row.inputs.map((input) => `${input.name} (${input.quantity.toLocaleString('pt-BR', { maximumFractionDigits: 2 })})`).join(', ')
            : 'Sem insumos registrados',
          formatCurrency(row.milkCost),
          formatCurrency(row.suppliesCost),
          formatCurrency(row.reprocessingCost),
          formatCurrency(row.creamCost),
          formatCurrency(row.totalCost),
          formatCurrency(row.costPerKg),
          `${row.milkLiters.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} L + ${row.reprocessedQuantity.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} reproc. + ${row.creamQuantity.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} creme`,
          row.actualYield.toFixed(3),
          row.actualQuantityProduced.toFixed(2),
          row.status,
        ])}
        onRowClick={(index) => setSelectedRow(report.rows[index])}
      />
      {selectedRow ? (
        <ReportDetailModal
          title={`Produção ${selectedRow.orderNumber}`}
          subtitle={`${selectedRow.productName} · Lote ${selectedRow.productLotCode}`}
          onClose={() => setSelectedRow(null)}
          fields={[
            { label: 'Status', value: selectedRow.status },
            { label: 'Lote de leite', value: selectedRow.milkLotCode },
            { label: 'Litros de leite', value: `${selectedRow.milkLiters.toLocaleString('pt-BR')} L` },
            { label: 'Reprocessamento', value: selectedRow.reprocessedQuantity.toLocaleString('pt-BR') },
            { label: 'Creme', value: selectedRow.creamQuantity.toLocaleString('pt-BR') },
            { label: 'Kg gerados', value: selectedRow.actualQuantityProduced.toLocaleString('pt-BR') },
            { label: 'Entrada por kg', value: selectedRow.actualYield.toFixed(3) },
            { label: 'Custo de leite', value: formatCurrency(selectedRow.milkCost) },
            { label: 'Custo de insumos', value: formatCurrency(selectedRow.suppliesCost) },
            { label: 'Custo de reprocessamento', value: formatCurrency(selectedRow.reprocessingCost) },
            { label: 'Custo de creme', value: formatCurrency(selectedRow.creamCost) },
            { label: 'Custo total', value: formatCurrency(selectedRow.totalCost) },
            { label: 'Custo por kg', value: formatCurrency(selectedRow.costPerKg) },
          ]}
        >
          <InputCostList inputs={selectedRow.inputs} />
        </ReportDetailModal>
      ) : null}
    </div>
  );
}

function SalesReportView({ report }: { report: SalesReportResponse | null }) {
  const [selectedRow, setSelectedRow] = useState<SalesReportResponse['rows'][number] | null>(null);

  if (!report || report.rows.length === 0) {
    return <EmptyReport message="Nenhuma venda realizada para os filtros selecionados." />;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3 xl:grid-cols-6">
        <SummaryCard title="Atendimentos" value={report.totals.salesCount} />
        <SummaryCard title="Quantidade vendida" value={report.totals.totalQuantity.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} />
        <SummaryCard title="Valor vendido" value={formatCurrency(report.totals.totalSaleValue)} />
        <SummaryCard title="Custo dos lotes" value={formatCurrency(report.totals.totalCost)} />
        <SummaryCard title="Margem bruta" value={formatCurrency(report.totals.grossMargin)} />
        <SummaryCard title="Já faturado" value={formatCurrency(report.totals.invoicedValue)} />
      </div>
      <DataTable
        headers={['Data', 'Pedido', 'Comprador', 'Faturado?', 'Vendedor', 'Produto', 'Lote', 'Qtde.', 'Custo do lote', 'Venda', 'Margem']}
        rows={report.rows.map((row) => [
          format(new Date(row.fulfilledAt), 'dd/MM/yyyy'),
          row.orderNumber,
          row.clientDocument ? `${row.clientName} • ${row.clientDocument}` : row.clientName,
          row.invoiced ? `Sim${row.invoiceNumber ? ` (NF-e ${row.invoiceNumber})` : ''}` : `Não${row.invoiceStatus !== 'Não faturado' ? ` (${row.invoiceStatus})` : ''}`,
          row.sellerName,
          row.productName,
          row.productLotCode,
          `${row.quantity.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}${row.returnedQuantity > 0 ? ` (${row.returnedQuantity.toLocaleString('pt-BR')} devolvido)` : ''}`,
          formatCurrency(row.costValue),
          formatCurrency(row.saleValue),
          formatCurrency(row.grossMargin),
        ])}
        onRowClick={(index) => setSelectedRow(report.rows[index])}
      />
      {selectedRow ? (
        <ReportDetailModal
          title={`Venda ${selectedRow.orderNumber}`}
          subtitle={`${selectedRow.productName} · Lote ${selectedRow.productLotCode}`}
          onClose={() => setSelectedRow(null)}
          fields={[
            { label: 'Data da venda', value: format(new Date(selectedRow.fulfilledAt), 'dd/MM/yyyy HH:mm') },
            { label: 'Comprador', value: selectedRow.clientName },
            { label: 'Documento', value: selectedRow.clientDocument || '-' },
            { label: 'Faturamento', value: selectedRow.invoiced ? `Faturado${selectedRow.invoiceNumber ? ` · NF-e ${selectedRow.invoiceNumber}` : ''}` : selectedRow.invoiceStatus },
            { label: 'Vendedor', value: selectedRow.sellerName },
            { label: 'Quantidade atendida', value: selectedRow.grossQuantity.toLocaleString('pt-BR') },
            { label: 'Quantidade devolvida', value: selectedRow.returnedQuantity.toLocaleString('pt-BR') },
            { label: 'Quantidade líquida', value: selectedRow.quantity.toLocaleString('pt-BR') },
            { label: 'Preço unitário', value: formatCurrency(selectedRow.unitPrice) },
            { label: 'Custo do lote', value: formatCurrency(selectedRow.costValue) },
            { label: 'Valor da venda', value: formatCurrency(selectedRow.saleValue) },
            { label: 'Margem bruta', value: formatCurrency(selectedRow.grossMargin) },
          ]}
        />
      ) : null}
    </div>
  );
}

function QualityReportView({ report }: { report: QualityReportResponse | null }) {
  const [selectedRow, setSelectedRow] = useState<QualityReportResponse['rows'][number] | null>(null);

  if (!report || report.rows.length === 0) {
    return <EmptyReport message="Nenhuma analise encontrada para os filtros selecionados." />;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-5">
        <SummaryCard title="Analises" value={report.totals.analysesCount} />
        <SummaryCard title="Aprovadas" value={report.totals.approvedCount} />
        <SummaryCard title="Reprovadas" value={report.totals.blockedCount} />
        <SummaryCard title="Gordura media" value={`${report.totals.averageFat.toFixed(2)}%`} />
        <SummaryCard title="Proteina media" value={`${report.totals.averageProtein.toFixed(2)}%`} />
      </div>
      <DataTable
        headers={['Data', 'Lote', 'Produtor', 'Status', 'Alizarol', 'Antibiotico', 'Gordura', 'Proteina']}
        rows={report.rows.map((row) => [
          format(new Date(row.analyzedAt), 'dd/MM/yyyy HH:mm'),
          row.lotCode,
          row.producerName,
          row.status,
          row.alizarol,
          row.antibioticos,
          row.gordura.toFixed(2),
          row.proteina.toFixed(2),
        ])}
        onRowClick={(index) => setSelectedRow(report.rows[index])}
      />
      {selectedRow ? (
        <ReportDetailModal
          title={`Análise do lote ${selectedRow.lotCode}`}
          subtitle={selectedRow.producerName}
          onClose={() => setSelectedRow(null)}
          fields={[
            { label: 'Data', value: format(new Date(selectedRow.analyzedAt), 'dd/MM/yyyy HH:mm') },
            { label: 'Status', value: selectedRow.status },
            { label: 'Alizarol', value: selectedRow.alizarol },
            { label: 'Antibiótico', value: selectedRow.antibioticos },
            { label: 'Gordura', value: `${selectedRow.gordura.toFixed(2)}%` },
            { label: 'Proteína', value: `${selectedRow.proteina.toFixed(2)}%` },
            { label: 'Acidez', value: selectedRow.acidez.toFixed(2) },
            { label: 'CBT', value: selectedRow.cbt.toLocaleString('pt-BR') },
            { label: 'CCS', value: selectedRow.ccs.toLocaleString('pt-BR') },
          ]}
        />
      ) : null}
    </div>
  );
}

function PricingReportView({ report }: { report: PricingReportResponse | null }) {
  const [selectedRow, setSelectedRow] = useState<PricingReportResponse['rows'][number] | null>(null);

  if (!report || report.rows.length === 0) {
    return <EmptyReport message="Nenhuma precificacao encontrada para os filtros selecionados." />;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
        <SummaryCard title="Precificacoes" value={report.totals.pricingsCount} />
        <SummaryCard title="Volume total" value={`${report.totals.totalVolumeLiters.toLocaleString('pt-BR')} L`} />
        <SummaryCard title="Preco medio" value={`R$ ${report.totals.averageFinalPrice.toFixed(2)}`} />
        <SummaryCard title="Valor total" value={`R$ ${report.totals.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} />
      </div>
      <DataTable
        headers={['Lote', 'Produtor', 'Status', 'Volume', 'Base', 'Final', 'Bonus gordura', 'Total']}
        rows={report.rows.map((row) => [
          row.lotCode,
          row.producerName,
          row.lotStatus,
          `${row.volumeLiters.toLocaleString('pt-BR')} L`,
          `R$ ${row.basePrice.toFixed(2)}`,
          `R$ ${row.finalPrice.toFixed(2)}`,
          `R$ ${row.fatBonus.toFixed(2)}`,
          `R$ ${row.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
        ])}
        onRowClick={(index) => setSelectedRow(report.rows[index])}
      />
      {selectedRow ? (
        <ReportDetailModal
          title={`Precificação do lote ${selectedRow.lotCode}`}
          subtitle={selectedRow.producerName}
          onClose={() => setSelectedRow(null)}
          fields={[
            { label: 'Data', value: format(new Date(selectedRow.createdAt), 'dd/MM/yyyy HH:mm') },
            { label: 'Status do lote', value: selectedRow.lotStatus },
            { label: 'Volume', value: `${selectedRow.volumeLiters.toLocaleString('pt-BR')} L` },
            { label: 'Preço base', value: formatCurrency(selectedRow.basePrice) },
            { label: 'Preço final', value: formatCurrency(selectedRow.finalPrice) },
            { label: 'Bônus de gordura', value: formatCurrency(selectedRow.fatBonus) },
            { label: 'Bônus de proteína', value: formatCurrency(selectedRow.proteinBonus) },
            { label: 'Penalidade de acidez', value: formatCurrency(selectedRow.acidityPenalty) },
            { label: 'Penalidade de CBT', value: formatCurrency(selectedRow.cbtPenalty) },
            { label: 'Penalidade de CCS', value: formatCurrency(selectedRow.ccsPenalty) },
            { label: 'Valor total', value: formatCurrency(selectedRow.totalValue) },
          ]}
        />
      ) : null}
    </div>
  );
}

function StockMovementsReportView({ report }: { report: StockMovementsReportResponse | null }) {
  const [selectedRow, setSelectedRow] = useState<StockMovementsReportResponse['rows'][number] | null>(null);

  if (!report || report.rows.length === 0) {
    return <EmptyReport message="Nenhuma movimentação de estoque encontrada para os filtros selecionados." />;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3 xl:grid-cols-5">
        <SummaryCard title="Movimentações" value={report.totals.movementsCount} />
        <SummaryCard title="Entradas" value={`${report.totals.entriesCount} movs`} />
        <SummaryCard title="Saídas" value={`${report.totals.exitsCount} movs`} />
        <SummaryCard
          title="Qtd. total entrada"
          value={`${report.totals.entriesQuantity.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}${report.totals.entriesPieces ? ` (${report.totals.entriesPieces.toLocaleString('pt-BR')} peças)` : ''}`}
        />
        <SummaryCard
          title="Qtd. total saída"
          value={`${report.totals.exitsQuantity.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}${report.totals.exitsPieces ? ` (${report.totals.exitsPieces.toLocaleString('pt-BR')} peças)` : ''}`}
        />
      </div>
      <p className="text-sm text-gray-600">As quantidades e peças são discriminadas individualmente. Consulte a unidade de medida em cada movimentação.</p>
      <DataTable
        headers={['Data', 'Movimentação', 'Tipo', 'Item', 'Lote', 'Peso / Qtd', 'Peças', 'Origem']}
        rows={report.rows.map((row) => [
          format(new Date(row.occurredAt), 'dd/MM/yyyy HH:mm'),
          row.movementType === 'entrada' ? 'Entrada' : 'Saída',
          row.lotType,
          row.itemCode ? `${row.itemName} · ${row.itemCode}` : row.itemName,
          row.lotCode,
          `${row.quantity.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}${row.unitSymbol ? ` ${row.unitSymbol}` : ''}`,
          row.piecesQuantity != null ? `${row.piecesQuantity.toLocaleString('pt-BR')} peças` : '—',
          row.reference,
        ])}
        onRowClick={(index) => setSelectedRow(report.rows[index])}
      />
      {selectedRow ? (
        <ReportDetailModal
          title={`${selectedRow.movementType === 'entrada' ? 'Entrada' : 'Saída'} de estoque`}
          subtitle={`${selectedRow.itemName} · Lote ${selectedRow.lotCode}`}
          onClose={() => setSelectedRow(null)}
          fields={[
            { label: 'Data', value: format(new Date(selectedRow.occurredAt), 'dd/MM/yyyy HH:mm') },
            { label: 'Movimentação', value: selectedRow.movementType === 'entrada' ? 'Entrada' : 'Saída' },
            { label: 'Tipo de estoque', value: selectedRow.lotType },
            { label: 'Item', value: selectedRow.itemName },
            { label: 'Código', value: selectedRow.itemCode || '-' },
            { label: 'Lote', value: selectedRow.lotCode },
            { label: 'Peso / Quantidade', value: `${selectedRow.quantity.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} ${selectedRow.unitSymbol || ''}`.trim() },
            { label: 'Quantidade de peças', value: selectedRow.piecesQuantity != null ? `${selectedRow.piecesQuantity.toLocaleString('pt-BR')} peças` : 'Não se aplica / sem registro' },
            { label: 'Origem / Operação', value: selectedRow.reference },
          ]}
        />
      ) : null}
    </div>
  );
}

function StockVsSalesReportView({ report }: { report: StockVsSalesReportResponse | null }) {
  const [selectedProduct, setSelectedProduct] = useState<StockVsSalesReportResponse['products'][number] | null>(null);
  const [chartMode, setChartMode] = useState<'volume' | 'value' | 'both'>('volume');
  const [productSearch, setProductSearch] = useState('');
  const [showTimelineTable, setShowTimelineTable] = useState(false);

  if (!report || report.timeline.length === 0) {
    return <EmptyReport message="Nenhum dado encontrado para o período e filtros selecionados." />;
  }

  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return report.products;
    const term = productSearch.toLowerCase();
    return report.products.filter(
      (p) =>
        p.productName.toLowerCase().includes(term) ||
        (p.productCode && p.productCode.toLowerCase().includes(term)),
    );
  }, [report.products, productSearch]);

  const statusConfig: Record<
    StockVsSalesReportResponse['products'][number]['status'],
    { label: string; badgeClass: string; icon: any }
  > = {
    crítico: {
      label: 'Crítico (< 7d)',
      badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
      icon: AlertTriangle,
    },
    baixo: {
      label: 'Atenção (7-14d)',
      badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
      icon: Clock,
    },
    adequado: {
      label: 'Equilibrado (15-45d)',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      icon: CheckCircle2,
    },
    alto: {
      label: 'Excesso (> 45d)',
      badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
      icon: ArrowUpRight,
    },
    sem_saida: {
      label: 'Sem saída',
      badgeClass: 'bg-slate-50 text-slate-600 border-slate-200',
      icon: Minus,
    },
    esgotado: {
      label: 'Esgotado',
      badgeClass: 'bg-red-50 text-red-700 border-red-200',
      icon: AlertCircle,
    },
  };

  return (
    <div className="space-y-6">
      {/* 1. Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-white to-blue-50/40 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">Estoque Disponível</span>
            <div className="rounded-lg bg-blue-100/60 p-2 text-blue-700">
              <Boxes className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-gray-900">
            {report.totals.currentAvailableStock.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}{' '}
            <span className="text-sm font-medium text-gray-500">kg</span>
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {report.totals.currentAvailablePieces
              ? `${report.totals.currentAvailablePieces.toLocaleString('pt-BR')} peças prontas`
              : 'Saldo atual pronto p/ venda'}
          </p>
        </div>

        <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-white to-emerald-50/40 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Vendas no Período</span>
            <div className="rounded-lg bg-emerald-100/60 p-2 text-emerald-700">
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-gray-900">
            {report.totals.totalSoldQuantity.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}{' '}
            <span className="text-sm font-medium text-gray-500">kg</span>
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {report.totals.totalSoldPieces
              ? `${report.totals.totalSoldPieces.toLocaleString('pt-BR')} peças vendidas`
              : 'Volume líquido faturado'}
          </p>
        </div>

        <div className="rounded-xl border border-amber-100 bg-gradient-to-br from-white to-amber-50/40 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-700">Faturamento Vendas</span>
            <div className="rounded-lg bg-amber-100/60 p-2 text-amber-700">
              <DollarSign className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-gray-900">
            {formatCurrency(report.totals.totalSalesValue)}
          </p>
          <p className="mt-1 text-xs text-gray-500">Receita total no período</p>
        </div>

        <div className="rounded-xl border border-sky-100 bg-gradient-to-br from-white to-sky-50/40 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-sky-700">Média Diária</span>
            <div className="rounded-lg bg-sky-100/60 p-2 text-sky-700">
              <Activity className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-gray-900">
            {report.totals.avgDailySales.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}{' '}
            <span className="text-sm font-medium text-gray-500">kg/dia</span>
          </p>
          <p className="mt-1 text-xs text-gray-500">Velocidade média de saída</p>
        </div>

        <div className="rounded-xl border border-violet-100 bg-gradient-to-br from-white to-violet-50/40 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-violet-700">Cobertura Estimada</span>
            <div className="rounded-lg bg-violet-100/60 p-2 text-violet-700">
              <Clock className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-gray-900">
            {report.totals.estimatedCoverageDays >= 999 ? 'Sem saídas' : `${report.totals.estimatedCoverageDays} dias`}
          </p>
          <p className="mt-1 text-xs text-gray-500">Autonomia do estoque atual</p>
        </div>

        <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-white to-indigo-50/40 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-700">Giro de Estoque</span>
            <div className="rounded-lg bg-indigo-100/60 p-2 text-indigo-700">
              <RefreshCw className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-gray-900">
            {report.totals.turnoverRate.toFixed(2)}x
          </p>
          <p className="mt-1 text-xs text-gray-500">Vendas ÷ Estoque atual</p>
        </div>
      </div>

      {/* 2. Interactive Chart */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xs">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Série Histórica: Estoque Disponível versus Vendas</h3>
            <p className="text-sm text-gray-500">
              Evolução diária do saldo de estoque em comparação com as vendas realizadas e entradas da produção
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1 text-xs">
            <button
              type="button"
              onClick={() => setChartMode('volume')}
              className={`rounded-lg px-3 py-1.5 font-medium transition-all ${
                chartMode === 'volume'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Volume (kg)
            </button>
            <button
              type="button"
              onClick={() => setChartMode('value')}
              className={`rounded-lg px-3 py-1.5 font-medium transition-all ${
                chartMode === 'value'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Faturamento (R$)
            </button>
            <button
              type="button"
              onClick={() => setChartMode('both')}
              className={`rounded-lg px-3 py-1.5 font-medium transition-all ${
                chartMode === 'both'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Visão Combinada
            </button>
          </div>
        </div>

        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={report.timeline} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="stockAreaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="label" stroke="#64748b" fontSize={12} tickLine={false} />
              <YAxis
                yAxisId="left"
                stroke="#64748b"
                fontSize={12}
                tickLine={false}
                tickFormatter={(val) =>
                  chartMode === 'value'
                    ? `R$ ${(val / 1000).toFixed(0)}k`
                    : `${val.toLocaleString('pt-BR')} kg`
                }
              />
              {chartMode === 'both' && (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="#8b5cf6"
                  fontSize={12}
                  tickLine={false}
                  tickFormatter={(val) => `R$ ${(val / 1000).toFixed(0)}k`}
                />
              )}
              <RechartsTooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const item = payload[0].payload as StockVsSalesReportResponse['timeline'][number];
                  return (
                    <div className="rounded-xl border border-gray-100 bg-white p-3.5 shadow-xl">
                      <p className="border-b border-gray-100 pb-1.5 text-xs font-bold text-gray-800">
                        {format(new Date(item.date + 'T12:00:00'), 'dd/MM/yyyy')} ({item.label})
                      </p>
                      <div className="mt-2 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between gap-4">
                          <span className="flex items-center gap-1.5 text-blue-700">
                            <span className="h-2 w-2 rounded-full bg-blue-600" />
                            Estoque disponível:
                          </span>
                          <span className="font-semibold text-gray-900">
                            {item.availableStock.toLocaleString('pt-BR')} kg
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="flex items-center gap-1.5 text-emerald-700">
                            <span className="h-2 w-2 rounded-full bg-emerald-500" />
                            Vendas do dia:
                          </span>
                          <span className="font-semibold text-gray-900">
                            {item.salesQuantity.toLocaleString('pt-BR')} kg ({formatCurrency(item.salesValue)})
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="flex items-center gap-1.5 text-amber-600">
                            <span className="h-2 w-2 rounded-full bg-amber-400" />
                            Produção / Entradas:
                          </span>
                          <span className="font-semibold text-gray-900">
                            {item.productionQuantity.toLocaleString('pt-BR')} kg
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }}
              />
              <RechartsLegend verticalAlign="top" height={36} iconType="circle" />

              {chartMode !== 'value' && (
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="availableStock"
                  name="Estoque Disponível (kg)"
                  stroke="#2563eb"
                  strokeWidth={2.5}
                  fill="url(#stockAreaGradient)"
                />
              )}

              {chartMode === 'value' ? (
                <Bar
                  yAxisId="left"
                  dataKey="salesValue"
                  name="Faturamento (R$)"
                  fill="#10b981"
                  radius={[4, 4, 0, 0]}
                />
              ) : (
                <Bar
                  yAxisId="left"
                  dataKey="salesQuantity"
                  name="Vendas (kg)"
                  fill="#10b981"
                  radius={[4, 4, 0, 0]}
                />
              )}

              {chartMode === 'both' && (
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="salesValue"
                  name="Faturamento (R$)"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              )}

              {chartMode !== 'value' && (
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="productionQuantity"
                  name="Produção / Entradas (kg)"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={{ r: 2.5 }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 3. Product Breakdown & Health Status */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xs">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Desempenho e Cobertura por Produto</h3>
            <p className="text-sm text-gray-500">
              Comparativo de saldo disponível, vendas acumuladas e autonomia estimada para cada item
            </p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar produto..."
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-gray-50/50 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:bg-white focus:outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
              <tr>
                <th className="px-4 py-3">Produto</th>
                <th className="px-4 py-3 text-right">Estoque Disponível</th>
                <th className="px-4 py-3 text-right">Vendido no Período</th>
                <th className="px-4 py-3 text-right">Faturamento</th>
                <th className="px-4 py-3 text-right">Média Diária</th>
                <th className="px-4 py-3 text-right">Cobertura</th>
                <th className="px-4 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredProducts.map((p) => {
                const conf = statusConfig[p.status];
                const StatusIcon = conf.icon;
                return (
                  <tr
                    key={p.productId}
                    onClick={() => setSelectedProduct(p)}
                    className="cursor-pointer transition-colors hover:bg-blue-50/50"
                  >
                    <td className="px-4 py-3 font-semibold text-gray-900">
                      {p.productName}
                      {p.productCode && (
                        <span className="ml-2 text-xs font-normal text-gray-500">({p.productCode})</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-blue-700">
                      {p.currentStock.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} {p.unitSymbol}
                      {p.currentPieces != null && (
                        <span className="block text-xs font-normal text-gray-500">
                          {p.currentPieces.toLocaleString('pt-BR')} peças
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-emerald-700">
                      {p.totalSoldQuantity.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} {p.unitSymbol}
                      {p.totalSoldPieces > 0 && (
                        <span className="block text-xs font-normal text-gray-500">
                          {p.totalSoldPieces.toLocaleString('pt-BR')} peças
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {formatCurrency(p.totalSalesValue)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {p.avgDailySales.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} {p.unitSymbol}/dia
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      {p.coverageDays >= 999 ? '—' : `${p.coverageDays} dias`}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${conf.badgeClass}`}
                      >
                        <StatusIcon className="h-3 w-3" />
                        {conf.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-sm text-gray-500">
                    Nenhum produto encontrado para a busca.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Historical Timeline Table (Accordion / Toggleable) */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xs">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Detalhamento Diário da Série Histórica</h3>
            <p className="text-sm text-gray-500">
              Consulte os registros diários consolidados de estoque, vendas e entradas
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowTimelineTable((prev) => !prev)}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            {showTimelineTable ? 'Ocultar tabela diária' : 'Exibir tabela diária'}
          </button>
        </div>

        {showTimelineTable && (
          <div className="mt-4 overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                <tr>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3 text-right">Estoque Disponível</th>
                  <th className="px-4 py-3 text-right">Vendas Realizadas</th>
                  <th className="px-4 py-3 text-right">Faturamento</th>
                  <th className="px-4 py-3 text-right">Entradas / Produção</th>
                  <th className="px-4 py-3 text-right">Saldo do Dia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {report.timeline.map((row) => {
                  const netDay = Math.round((row.productionQuantity - row.salesQuantity) * 100) / 100;
                  return (
                    <tr key={row.date} className="hover:bg-gray-50/70">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {format(new Date(row.date + 'T12:00:00'), 'dd/MM/yyyy')}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-blue-700">
                        {row.availableStock.toLocaleString('pt-BR')} kg
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-emerald-700">
                        {row.salesQuantity.toLocaleString('pt-BR')} kg
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">
                        {formatCurrency(row.salesValue)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-amber-600">
                        {row.productionQuantity.toLocaleString('pt-BR')} kg
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-semibold ${
                          netDay > 0 ? 'text-emerald-600' : netDay < 0 ? 'text-rose-600' : 'text-gray-500'
                        }`}
                      >
                        {netDay > 0 ? `+${netDay.toLocaleString('pt-BR')}` : netDay.toLocaleString('pt-BR')} kg
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 5. Product Detail Modal */}
      {selectedProduct && (
        <ReportDetailModal
          title={selectedProduct.productName}
          subtitle={`Código: ${selectedProduct.productCode || '-'} · Unidade: ${selectedProduct.unitSymbol}`}
          onClose={() => setSelectedProduct(null)}
          fields={[
            {
              label: 'Estoque Disponível Atual',
              value: `${selectedProduct.currentStock.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${selectedProduct.unitSymbol}${
                selectedProduct.currentPieces ? ` (${selectedProduct.currentPieces.toLocaleString('pt-BR')} peças)` : ''
              }`,
            },
            {
              label: 'Volume Vendido no Período',
              value: `${selectedProduct.totalSoldQuantity.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${selectedProduct.unitSymbol}${
                selectedProduct.totalSoldPieces ? ` (${selectedProduct.totalSoldPieces.toLocaleString('pt-BR')} peças)` : ''
              }`,
            },
            {
              label: 'Receita Gerada no Período',
              value: formatCurrency(selectedProduct.totalSalesValue),
            },
            {
              label: 'Média de Vendas Diárias',
              value: `${selectedProduct.avgDailySales.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${selectedProduct.unitSymbol}/dia`,
            },
            {
              label: 'Dias de Cobertura Estimados',
              value: selectedProduct.coverageDays >= 999 ? 'Sem vendas no período' : `${selectedProduct.coverageDays} dias de autonomia`,
            },
            {
              label: 'Classificação de Saúde',
              value: statusConfig[selectedProduct.status].label,
            },
          ]}
        />
      )}
    </div>
  );
}

function SummaryCard({
  title,
  value,
}: {
  title: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="mb-1 text-sm text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
        <div className="rounded-lg bg-blue-50 p-3">
          <BarChart3 className="h-6 w-6 text-blue-600" />
        </div>
      </div>
    </div>
  );
}

function DataTable({
  headers,
  rows,
  onRowClick,
}: {
  headers: string[];
  rows: string[][];
  onRowClick?: (index: number) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              {headers.map((header) => (
                <th key={header} className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {rows.map((row, index) => (
              <tr
                key={`${row[0]}-${index}`}
                className={`hover:bg-gray-50 ${onRowClick ? 'cursor-pointer transition-colors hover:bg-blue-50' : ''}`}
                onClick={() => onRowClick?.(index)}
                onKeyDown={(event) => {
                  if (onRowClick && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault();
                    onRowClick(index);
                  }
                }}
                role={onRowClick ? 'button' : undefined}
                tabIndex={onRowClick ? 0 : undefined}
              >
                {row.map((cell, cellIndex) => (
                  <td
                    key={`${cell}-${cellIndex}`}
                    className={`px-4 py-3 text-sm ${cellIndex === 0 ? 'font-medium text-gray-900' : 'text-gray-700'}`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReportDetailModal({
  title,
  subtitle,
  fields,
  children,
  onClose,
}: {
  title: string;
  subtitle?: string;
  fields: Array<{ label: string; value: string }>;
  children?: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sticky top-0 flex items-start justify-between border-b border-gray-200 bg-white px-6 py-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900">{title}</h3>
            {subtitle ? <p className="mt-1 text-sm text-gray-600">{subtitle}</p> : null}
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar detalhes"
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-6 p-6">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            {fields.map((field) => (
              <div key={field.label} className="border-b border-gray-100 pb-3">
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{field.label}</dt>
                <dd className="mt-1 text-sm font-medium text-gray-900">{field.value}</dd>
              </div>
            ))}
          </dl>
          {children}
        </div>
      </div>
    </div>
  );
}

function InputCostList({
  inputs,
}: {
  inputs: ProductionReportResponse['rows'][number]['inputs'];
}) {
  return (
    <section>
      <h4 className="mb-3 text-sm font-semibold text-gray-900">Insumos e componentes do lote</h4>
      {inputs.length === 0 ? (
        <p className="text-sm text-gray-600">Não há insumos registrados para este lote.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">Lote</th>
                <th className="px-3 py-2 text-right">Quantidade</th>
                <th className="px-3 py-2 text-right">Custo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {inputs.map((input, index) => (
                <tr key={`${input.lotCode}-${index}`}>
                  <td className="px-3 py-2 text-gray-700">{input.category}</td>
                  <td className="px-3 py-2 font-medium text-gray-900">{input.name}</td>
                  <td className="px-3 py-2 text-gray-700">{input.lotCode}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{input.quantity.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{formatCurrency(input.totalCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function EmptyReport({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-600">
      {message}
    </div>
  );
}

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function FilterField({
  label,
  type,
  value,
  onChange,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
