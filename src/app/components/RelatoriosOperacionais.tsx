import { useEffect, useState } from 'react';
import { BarChart3, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { useCadastros } from '../context/CadastrosContext';
import {
  loadPricingReport,
  loadProductionReport,
  loadQualityReport,
  type PricingReportResponse,
  type ProductionReportResponse,
  type QualityReportResponse,
} from '../services/operationsApi';

type ReportTab = 'production' | 'quality' | 'pricing';

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
  const [activeTab, setActiveTab] = useState<ReportTab>('production');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    ...getDefaultPeriod(),
    productId: '',
    producerId: '',
    status: '',
  });
  const [productionReport, setProductionReport] = useState<ProductionReportResponse | null>(null);
  const [qualityReport, setQualityReport] = useState<QualityReportResponse | null>(null);
  const [pricingReport, setPricingReport] = useState<PricingReportResponse | null>(null);
  const { finishedProducts, producers } = useCadastros();

  const loadCurrentReport = async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      if (activeTab === 'production') {
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
      } else {
        const report = await loadPricingReport({
          startDate: filters.startDate,
          endDate: filters.endDate,
          producerId: filters.producerId || undefined,
          status: filters.status || undefined,
        });
        setPricingReport(report);
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

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Relatorios operacionais</h2>
          <p className="text-gray-600">Acompanhe producao, qualidade e precificacao por periodo</p>
        </div>
        <button
          onClick={applyFilters}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          Atualizar
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex border-b border-gray-200">
          {[
            { key: 'production', label: 'Producao' },
            { key: 'quality', label: 'Qualidade' },
            { key: 'pricing', label: 'Precificacao' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as ReportTab)}
              className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'border-b-2 border-blue-600 bg-blue-50 text-blue-700'
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
            {activeTab === 'production' ? (
              <FilterSelect
                label="Produto"
                value={filters.productId}
                onChange={(value) => setFilters((current) => ({ ...current, productId: value }))}
                options={[
                  { label: 'Todos', value: '' },
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
            <FilterSelect
              label="Status"
              value={filters.status}
              onChange={(value) => setFilters((current) => ({ ...current, status: value }))}
              options={statusOptionsByTab[activeTab]}
            />
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
      ) : activeTab === 'production' ? (
        <ProductionReportView report={productionReport} />
      ) : activeTab === 'quality' ? (
        <QualityReportView report={qualityReport} />
      ) : (
        <PricingReportView report={pricingReport} />
      )}
    </div>
  );
}

const statusOptionsByTab: Record<ReportTab, Array<{ label: string; value: string }>> = {
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
};

function ProductionReportView({ report }: { report: ProductionReportResponse | null }) {
  if (!report || report.rows.length === 0) {
    return <EmptyReport message="Nenhuma ordem encontrada para os filtros selecionados." />;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
        <SummaryCard title="Ordens" value={report.totals.ordersCount} />
        <SummaryCard title="Litros planejados" value={`${report.totals.litersPlanned.toLocaleString('pt-BR')} L`} />
        <SummaryCard title="Rendimento esperado" value={report.totals.expectedYield.toFixed(2)} />
        <SummaryCard title="Produzido" value={report.totals.actualQuantityProduced.toFixed(2)} />
      </div>
      <DataTable
        headers={['OP', 'Produto', 'Lote', 'Litros', 'Esperado', 'Produzido', 'Delta', 'Status']}
        rows={report.rows.map((row) => [
          row.orderNumber,
          row.productName,
          row.milkLotCode,
          `${row.litersPlanned.toLocaleString('pt-BR')} L`,
          row.expectedYield.toFixed(2),
          row.actualQuantityProduced.toFixed(2),
          row.yieldDelta.toFixed(2),
          row.status,
        ])}
      />
    </div>
  );
}

function QualityReportView({ report }: { report: QualityReportResponse | null }) {
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
      />
    </div>
  );
}

function PricingReportView({ report }: { report: PricingReportResponse | null }) {
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
      />
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
}: {
  headers: string[];
  rows: string[][];
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
              <tr key={`${row[0]}-${index}`} className="hover:bg-gray-50">
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

function EmptyReport({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-600">
      {message}
    </div>
  );
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
