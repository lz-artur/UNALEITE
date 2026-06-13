import { useEffect, useState } from 'react';
import { Calendar, TrendingDown, TrendingUp, BarChart3, Loader2 } from 'lucide-react';
import { loadDreReport, type DreReportResponse } from '../services/operationsApi';

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return 'Não foi possível carregar o DRE.';
}

function getDefaultPeriod() {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    startDate: firstDay.toISOString().slice(0, 10),
    endDate: now.toISOString().slice(0, 10),
    basis: 'cash' as const,
  };
}

export default function DreGerencial() {
  const [filters, setFilters] = useState(getDefaultPeriod);
  const [reportData, setReportData] = useState<DreReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadData = async (nextFilters = filters) => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const data = await loadDreReport(nextFilters);
      setReportData(data);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData(filters);
  }, []);

  const applyFilters = () => {
    void loadData(filters);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">DRE Gerencial</h2>
          <p className="text-gray-600">Demonstrativo de Resultado do Exercício</p>
        </div>
        <button
          onClick={applyFilters}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          Atualizar
        </button>
      </div>

      {errorMessage ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {errorMessage}
        </div>
      ) : null}

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-4">
          <SelectFilter
            label="Regime"
            value={filters.basis}
            onChange={(value) => setFilters((current) => ({ ...current, basis: value as 'cash' | 'accrual' }))}
            options={[
              { label: 'Caixa (Pagamentos e Recebimentos)', value: 'cash' },
              { label: 'Competência (Vencimentos)', value: 'accrual' },
            ]}
          />
          <DateFilter
            label="Data inicial"
            value={filters.startDate}
            onChange={(value) => setFilters((current) => ({ ...current, startDate: value }))}
          />
          <DateFilter
            label="Data final"
            value={filters.endDate}
            onChange={(value) => setFilters((current) => ({ ...current, endDate: value }))}
          />
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={applyFilters}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            <Calendar className="h-4 w-4" />
            Aplicar filtros
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-3 p-10 text-sm text-gray-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          Calculando resultados...
        </div>
      ) : reportData ? (
        <>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <SummaryCard
              title="Receita Operacional"
              value={`R$ ${reportData.totals.totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
              tone="green"
              icon={<TrendingUp className="h-6 w-6 text-green-600" />}
            />
            <SummaryCard
              title="Custos e Despesas"
              value={`R$ ${reportData.totals.totalExpense.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
              tone="red"
              icon={<TrendingDown className="h-6 w-6 text-red-600" />}
            />
            <SummaryCard
              title="Resultado Líquido"
              value={`R$ ${reportData.totals.netIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
              tone={reportData.totals.netIncome >= 0 ? 'green' : 'red'}
              icon={<BarChart3 className={`h-6 w-6 ${reportData.totals.netIncome >= 0 ? 'text-green-600' : 'text-red-600'}`} />}
            />
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-200 bg-gray-50 p-4">
              <h3 className="font-bold text-gray-900">Estrutura do DRE</h3>
            </div>
            
            <div className="p-0">
              <div className="border-b border-gray-100 p-4 bg-green-50/30">
                <h4 className="font-semibold text-green-800 mb-2">RECEITAS OPERACIONAIS</h4>
                {reportData.revenues.length === 0 ? (
                  <p className="text-sm text-gray-500 pl-4">Nenhuma receita no período</p>
                ) : (
                  <div className="space-y-2 pl-4">
                    {reportData.revenues.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-sm">
                        <span className="text-gray-700">{item.category}</span>
                        <span className="font-medium text-green-700">
                          R$ {item.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-3 flex justify-between border-t border-green-100 pt-2 font-semibold text-green-900">
                  <span>Receita Operacional Bruta</span>
                  <span>R$ {reportData.totals.totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>

              <div className="border-b border-gray-100 p-4 bg-red-50/30">
                <h4 className="font-semibold text-red-800 mb-2">CUSTOS E DESPESAS</h4>
                {reportData.expenses.length === 0 ? (
                  <p className="text-sm text-gray-500 pl-4">Nenhuma despesa no período</p>
                ) : (
                  <div className="space-y-2 pl-4">
                    {reportData.expenses.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-sm">
                        <span className="text-gray-700">{item.category}</span>
                        <span className="font-medium text-red-700">
                          - R$ {item.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-3 flex justify-between border-t border-red-100 pt-2 font-semibold text-red-900">
                  <span>Total de Custos e Despesas</span>
                  <span>- R$ {reportData.totals.totalExpense.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>

              <div className={`p-4 ${reportData.totals.netIncome >= 0 ? 'bg-green-100/50 text-green-900' : 'bg-red-100/50 text-red-900'}`}>
                <div className="flex justify-between text-lg font-bold">
                  <span>RESULTADO LÍQUIDO DO EXERCÍCIO</span>
                  <span>R$ {reportData.totals.netIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function SummaryCard({
  title,
  value,
  tone,
  icon,
}: {
  title: string;
  value: string;
  tone: 'red' | 'green' | 'yellow';
  icon: React.ReactNode;
}) {
  const colorClass =
    tone === 'red' ? 'text-red-600' : tone === 'green' ? 'text-green-600' : 'text-yellow-600';

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="mb-1 text-sm text-gray-600">{title}</p>
          <p className={`text-2xl font-bold ${colorClass}`}>{value}</p>
        </div>
        <div className="rounded-lg bg-gray-50 p-3">{icon}</div>
      </div>
    </div>
  );
}

function SelectFilter({
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
        className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
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

function DateFilter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
      />
    </div>
  );
}
