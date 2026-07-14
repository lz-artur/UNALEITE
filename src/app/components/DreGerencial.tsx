import { useEffect, useState, Fragment, useMemo } from 'react';
import { Calendar, Loader2 } from 'lucide-react';
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import { loadDreMatrixReport, type DreMatrixReportResponse } from '../services/operationsApi';

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return 'Não foi possível carregar o DRE.';
}

export default function DreGerencial() {
  const [reportData, setReportData] = useState<DreMatrixReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // By default, we'll request a 3-month rolling window (handled by backend if we pass no dates)
  // But we can add a date selector if we want. For now, let's let backend use the default 3 months.
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const loadData = async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const data = await loadDreMatrixReport({ 
        startDate: startDate || undefined, 
        endDate: endDate || undefined 
      });
      setReportData(data);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const applyFilters = () => {
    void loadData();
  };

  const formatCurrency = (val: number) => 
    val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const formatMonth = (yyyyMm: string) => {
    const [y, m] = yyyyMm.split('-');
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    return `${months[parseInt(m) - 1]}/${y}`;
  };

  const chartData = useMemo(() => {
    if (!reportData) return [];
    return reportData.months.map(m => ({
      name: formatMonth(m),
      recPrev: reportData.totals.revenues[m].previsto,
      recReal: reportData.totals.revenues[m].realizado,
      pagPrev: -reportData.totals.expenses[m].previsto,
      pagReal: -reportData.totals.expenses[m].realizado,
      saldoPrev: reportData.totals.accumulatedBalance[m].previsto,
      saldoReal: reportData.totals.accumulatedBalance[m].realizado,
    }));
  }, [reportData]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Fluxo de Caixa / DRE</h2>
          <p className="text-gray-600">Matriz de Competência (Previsto) vs Realizado (Caixa)</p>
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {errorMessage}
        </div>
      ) : null}

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-4">
          <DateFilter
            label="Mês Inicial (Opcional)"
            value={startDate}
            onChange={setStartDate}
          />
          <DateFilter
            label="Mês Final (Opcional)"
            value={endDate}
            onChange={setEndDate}
          />
          <button
            onClick={applyFilters}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 h-[42px]"
          >
            <Calendar className="h-4 w-4" />
            Aplicar período
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-3 p-10 text-sm text-gray-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          Gerando matriz financeira...
        </div>
      ) : reportData ? (
        <div className="space-y-6">
          {/* GRÁFICO */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-6 text-lg font-bold text-gray-800">Fluxo de Caixa Mensal - Previsto e Realizado</h3>
            <div className="h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={chartData}
                  margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6b7280' }} dy={10} />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#6b7280' }} 
                    tickFormatter={(val) => `R$ ${(val / 1000).toFixed(0)}k`}
                  />
                  <Tooltip 
                    formatter={(value: number) => formatCurrency(Math.abs(value))}
                    cursor={{ fill: '#f3f4f6' }}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} />
                  
                  <ReferenceLine y={0} stroke="#9ca3af" />
                  
                  <Bar dataKey="recPrev" name="Recebimentos previstos" fill="#86efac" radius={[4, 4, 0, 0]} maxBarSize={60} />
                  <Bar dataKey="recReal" name="Recebimentos realizados" fill="#16a34a" radius={[4, 4, 0, 0]} maxBarSize={60} />
                  
                  {/* Despesas são negativas, o radius fica invertido para baixo */}
                  <Bar dataKey="pagPrev" name="Pagamentos previstos" fill="#fca5a5" radius={[0, 0, 4, 4]} maxBarSize={60} />
                  <Bar dataKey="pagReal" name="Pagamentos realizados" fill="#dc2626" radius={[0, 0, 4, 4]} maxBarSize={60} />
                  
                  <Line type="monotone" dataKey="saldoPrev" name="Saldo previsto" stroke="#93c5fd" strokeWidth={3} dot={{ r: 4, fill: '#93c5fd', strokeWidth: 2, stroke: '#fff' }} />
                  <Line type="monotone" dataKey="saldoReal" name="Saldo realizado" stroke="#2563eb" strokeWidth={3} dot={{ r: 4, fill: '#2563eb', strokeWidth: 2, stroke: '#fff' }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="p-4 font-bold text-gray-700 min-w-[250px] border-r border-gray-200 align-bottom" rowSpan={2}>
                  Categorias de Lançamentos
                </th>
                {reportData.months.map(m => (
                  <th key={m} colSpan={2} className="p-3 text-center font-bold text-gray-700 border-r border-gray-200 bg-gray-50">
                    {formatMonth(m)}
                  </th>
                ))}
              </tr>
              <tr className="border-b border-gray-300">
                {reportData.months.map(m => (
                  <Fragment key={m}>
                    <th className="px-3 py-2 text-center font-semibold text-gray-800 bg-yellow-100 border-r border-gray-200 w-32">
                      Previsto
                    </th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-600 bg-white border-r border-gray-200 w-32">
                      Realizado
                    </th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            
            <tbody>
              {/* SALDO DO MES ANTERIOR */}
              <tr className="border-b border-gray-200 hover:bg-gray-50">
                <td className="p-4 font-semibold text-gray-700 border-r border-gray-200 bg-gray-50">
                  Saldo Acumulado (Início do Mês)
                </td>
                {reportData.months.map((m, idx) => {
                  // The balance at the START of the month is the accumulated balance of the PREVIOUS month
                  // For the very first month, it's the initialBalance.
                  const startBalance = idx === 0 
                    ? reportData.initialBalance 
                    : reportData.totals.accumulatedBalance[reportData.months[idx-1]].realizado;
                    
                  return (
                    <Fragment key={m}>
                      <td className="px-3 py-3 text-right text-gray-400 bg-yellow-50/30 border-r border-gray-100">-</td>
                      <td className="px-3 py-3 text-right font-medium text-gray-700 bg-white border-r border-gray-200">
                        {formatCurrency(startBalance)}
                      </td>
                    </Fragment>
                  );
                })}
              </tr>

              {/* RECEITAS SECTION */}
              <tr className="border-b-2 border-green-200">
                <td className="p-4 font-bold text-green-800 border-r border-gray-200 bg-green-50/50">
                  Total de Recebimentos
                </td>
                {reportData.months.map(m => (
                  <Fragment key={m}>
                    <td className="px-3 py-3 text-right font-bold text-green-700 bg-yellow-50/50 border-r border-gray-200">
                      {formatCurrency(reportData.totals.revenues[m].previsto)}
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-green-700 bg-green-50/30 border-r border-gray-200">
                      {formatCurrency(reportData.totals.revenues[m].realizado)}
                    </td>
                  </Fragment>
                ))}
              </tr>
              
              {/* RECEITA ROWS */}
              {reportData.revenues.map(rev => (
                <tr key={rev.category} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="p-3 pl-8 text-gray-600 border-r border-gray-200">
                    {rev.category}
                  </td>
                  {reportData.months.map(m => (
                    <Fragment key={m}>
                      <td className="px-3 py-2 text-right text-gray-600 bg-yellow-50/20 border-r border-gray-100">
                        {formatCurrency(rev.data[m].previsto)}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-600 bg-white border-r border-gray-200">
                        {formatCurrency(rev.data[m].realizado)}
                      </td>
                    </Fragment>
                  ))}
                </tr>
              ))}

              {/* DESPESAS SECTION */}
              <tr className="border-b-2 border-red-200">
                <td className="p-4 font-bold text-red-800 border-r border-gray-200 bg-red-50/50 mt-4">
                  Total de Pagamentos
                </td>
                {reportData.months.map(m => (
                  <Fragment key={m}>
                    <td className="px-3 py-3 text-right font-bold text-red-700 bg-yellow-50/50 border-r border-gray-200">
                      {formatCurrency(reportData.totals.expenses[m].previsto)}
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-red-700 bg-red-50/30 border-r border-gray-200">
                      {formatCurrency(reportData.totals.expenses[m].realizado)}
                    </td>
                  </Fragment>
                ))}
              </tr>

              {/* DESPESA ROWS */}
              {reportData.expenses.map(exp => (
                <tr key={exp.category} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="p-3 pl-8 text-gray-600 border-r border-gray-200">
                    {exp.category}
                  </td>
                  {reportData.months.map(m => (
                    <Fragment key={m}>
                      <td className="px-3 py-2 text-right text-gray-600 bg-yellow-50/20 border-r border-gray-100">
                        {formatCurrency(exp.data[m].previsto)}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-600 bg-white border-r border-gray-200">
                        {formatCurrency(exp.data[m].realizado)}
                      </td>
                    </Fragment>
                  ))}
                </tr>
              ))}

              {/* RESULTADO DO MES */}
              <tr className="border-b border-gray-300">
                <td className="p-4 font-bold text-gray-800 border-r border-gray-200 bg-gray-100">
                  Resultado do Mês (Receitas - Despesas)
                </td>
                {reportData.months.map(m => {
                  const netPrev = reportData.totals.netIncome[m].previsto;
                  const netReal = reportData.totals.netIncome[m].realizado;
                  return (
                    <Fragment key={m}>
                      <td className={`px-3 py-3 text-right font-bold border-r border-gray-200 ${netPrev >= 0 ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'}`}>
                        {formatCurrency(netPrev)}
                      </td>
                      <td className={`px-3 py-3 text-right font-bold border-r border-gray-200 ${netReal >= 0 ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'}`}>
                        {formatCurrency(netReal)}
                      </td>
                    </Fragment>
                  )
                })}
              </tr>

              {/* SALDO ACUMULADO FINAL */}
              <tr className="border-b border-gray-300">
                <td className="p-4 font-bold text-gray-900 border-r border-gray-200 bg-blue-50/50">
                  Saldo Final (Caixa Atual)
                </td>
                {reportData.months.map(m => {
                  const acc = reportData.totals.accumulatedBalance[m].realizado;
                  return (
                    <Fragment key={m}>
                      <td className="px-3 py-3 text-right text-gray-400 bg-yellow-50/30 border-r border-gray-100">-</td>
                      <td className={`px-3 py-3 text-right font-black border-r border-gray-200 ${acc >= 0 ? 'text-blue-700 bg-blue-50' : 'text-red-700 bg-red-50'}`}>
                        {formatCurrency(acc)}
                      </td>
                    </Fragment>
                  )
                })}
              </tr>

            </tbody>
          </table>
        </div>
        </div>
      ) : null}
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
