import { useEffect, useMemo, useState } from 'react';
import { Calendar, FileText, Loader2, Milk, Wallet } from 'lucide-react';
import { format } from 'date-fns';
import {
  loadMilkPayrollProducerDetail,
  loadMilkPayrollSummary,
  type MilkPayrollProducerDetail,
  type MilkPayrollSummary,
} from '../services/operationsApi';

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Nao foi possivel carregar a folha do leite.';
}

function getDefaultPeriod() {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    startDate: firstDay.toISOString().slice(0, 10),
    endDate: now.toISOString().slice(0, 10),
  };
}

export default function FolhaLeite() {
  const [filters, setFilters] = useState(getDefaultPeriod);
  const [summary, setSummary] = useState<MilkPayrollSummary | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<MilkPayrollProducerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const nextSummary = await loadMilkPayrollSummary(filters.startDate, filters.endDate);
      setSummary(nextSummary);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleApplyFilters = () => {
    void loadData();
    setSelectedDetail(null);
  };

  const handleOpenDetail = async (producerId: string) => {
    setDetailLoading(true);
    setErrorMessage(null);

    try {
      const detail = await loadMilkPayrollProducerDetail(
        producerId,
        filters.startDate,
        filters.endDate,
      );
      setSelectedDetail(detail);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setDetailLoading(false);
    }
  };

  const totals = useMemo(
    () =>
      summary?.totals ?? {
        producersCount: 0,
        lotsCount: 0,
        totalValue: 0,
        totalVolumeLiters: 0,
        averagePricePerLiter: 0,
      },
    [summary],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Folha do leite</h2>
          <p className="text-gray-600">Fechamento por produtor com base nos lotes precificados</p>
        </div>
        <button
          onClick={handleApplyFilters}
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Data inicial</label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(event) =>
                setFilters((current) => ({ ...current, startDate: event.target.value }))
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Data final</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(event) =>
                setFilters((current) => ({ ...current, endDate: event.target.value }))
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleApplyFilters}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              <Calendar className="h-4 w-4" />
              Aplicar periodo
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Total a pagar"
          value={`R$ ${totals.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          icon={<Wallet className="h-6 w-6 text-blue-600" />}
        />
        <SummaryCard
          title="Produtores no periodo"
          value={totals.producersCount}
          icon={<FileText className="h-6 w-6 text-green-600" />}
        />
        <SummaryCard
          title="Volume recebido"
          value={`${totals.totalVolumeLiters.toLocaleString('pt-BR')} L`}
          icon={<Milk className="h-6 w-6 text-orange-600" />}
        />
        <SummaryCard
          title="Preco medio por litro"
          value={`R$ ${totals.averagePricePerLiter.toFixed(2)}`}
          icon={<Wallet className="h-6 w-6 text-purple-600" />}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-200 p-4">
          <h3 className="font-bold text-gray-900">Resumo por produtor</h3>
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-3 p-10 text-sm text-gray-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            Carregando folha do leite...
          </div>
        ) : !summary || summary.producers.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-600">
            Nenhum lote precificado encontrado para o periodo selecionado.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Produtor</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Lotes</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Volume</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Preco medio</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Total</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Acoes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {summary.producers.map((producer) => (
                  <tr key={producer.producerId} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{producer.producerName}</div>
                      <div className="text-xs text-gray-500">{producer.producerCode}</div>
                    </td>
                    <td className="px-6 py-4">{producer.lotsCount}</td>
                    <td className="px-6 py-4">{producer.totalVolumeLiters.toLocaleString('pt-BR')} L</td>
                    <td className="px-6 py-4">R$ {producer.averagePricePerLiter.toFixed(2)}</td>
                    <td className="px-6 py-4 font-medium text-green-700">
                      R$ {producer.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => void handleOpenDetail(producer.producerId)}
                        className="text-sm font-medium text-blue-600 hover:text-blue-800"
                      >
                        Ver detalhes
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedDetail || detailLoading ? (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-200 p-4">
            <h3 className="font-bold text-gray-900">
              {selectedDetail
                ? `Detalhamento de ${selectedDetail.producer.name}`
                : 'Carregando produtor...'}
            </h3>
          </div>
          {detailLoading ? (
            <div className="flex items-center justify-center gap-3 p-10 text-sm text-gray-600">
              <Loader2 className="h-5 w-5 animate-spin" />
              Carregando detalhe do produtor...
            </div>
          ) : selectedDetail ? (
            <div className="space-y-4 p-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <DetailMetric
                  label="Lotes"
                  value={selectedDetail.totals.lotsCount}
                />
                <DetailMetric
                  label="Volume"
                  value={`${selectedDetail.totals.totalVolumeLiters.toLocaleString('pt-BR')} L`}
                />
                <DetailMetric
                  label="Preco medio"
                  value={`R$ ${selectedDetail.totals.averagePricePerLiter.toFixed(2)}`}
                />
                <DetailMetric
                  label="Total"
                  value={`R$ ${selectedDetail.totals.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Lote</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Recebimento</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Volume</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Preco final</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {selectedDetail.lots.map((lot) => (
                      <tr key={lot.lotId} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium">{lot.lotCode}</td>
                        <td className="px-4 py-3 text-sm">
                          {format(new Date(lot.receivedAt), 'dd/MM/yyyy HH:mm')}
                        </td>
                        <td className="px-4 py-3 text-sm">{lot.status}</td>
                        <td className="px-4 py-3">{lot.volumeLiters.toLocaleString('pt-BR')} L</td>
                        <td className="px-4 py-3">R$ {lot.finalPrice.toFixed(2)}</td>
                        <td className="px-4 py-3 font-medium text-green-700">
                          R$ {lot.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SummaryCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="mb-1 text-sm text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
        <div className="rounded-lg bg-gray-50 p-3">{icon}</div>
      </div>
    </div>
  );
}

function DetailMetric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg bg-gray-50 p-4">
      <p className="text-sm text-gray-600">{label}</p>
      <p className="mt-1 text-xl font-bold text-gray-900">{value}</p>
    </div>
  );
}
