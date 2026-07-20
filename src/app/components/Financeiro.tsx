import { useEffect, useMemo, useState } from 'react';
import { Calendar, Loader2, TrendingDown, TrendingUp, Wallet, Trash2 } from 'lucide-react';
import { format, isPast } from 'date-fns';
import {
  loadFinancialEntries,
  settleFinancialEntry,
  deleteFinancialEntry,
  type FinancialEntryFilters,
  type FinancialEntryRecord,
} from '../services/operationsApi';
import { useCadastros } from '../context/CadastrosContext';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Nao foi possivel carregar o financeiro.';
}

function getDefaultPeriod() {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    startDate: firstDay.toISOString().slice(0, 10),
    endDate: now.toISOString().slice(0, 10),
  };
}

export default function Financeiro() {
  const [filters, setFilters] = useState<FinancialEntryFilters>(getDefaultPeriod);
  const [contasFinanceiras, setContasFinanceiras] = useState<FinancialEntryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [settlingId, setSettlingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const { producers, getProducerById } = useCadastros();

  const loadData = async (nextFilters: FinancialEntryFilters = filters) => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const entries = await loadFinancialEntries(nextFilters);
      setContasFinanceiras(entries);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData(filters);
  }, []);

  const contasPagar = contasFinanceiras.filter((entry) => entry.tipo === 'Pagar');
  const contasReceber = contasFinanceiras.filter((entry) => entry.tipo === 'Receber');

  const totalPagar = contasPagar
    .filter((entry) => entry.statusCalculado !== 'Pago' && entry.statusCalculado !== 'Cancelado')
    .reduce((sum, entry) => sum + entry.valor, 0);

  const totalReceber = contasReceber
    .filter((entry) => entry.statusCalculado !== 'Pago' && entry.statusCalculado !== 'Cancelado')
    .reduce((sum, entry) => sum + entry.valor, 0);

  const totalVencido = contasFinanceiras
    .filter((entry) => entry.statusCalculado === 'Vencido')
    .reduce((sum, entry) => sum + entry.valor, 0);

  const saldo = totalReceber - totalPagar;
  const categories = useMemo(
    () => Array.from(new Set(contasFinanceiras.map((entry) => entry.categoria))).sort(),
    [contasFinanceiras],
  );

  const getStatusColor = (conta: FinancialEntryRecord) => {
    if (conta.statusCalculado === 'Pago') return 'bg-green-100 text-green-800';
    if (conta.statusCalculado === 'Cancelado') return 'bg-gray-100 text-gray-800';
    if (conta.statusCalculado === 'Vencido' || (conta.status === 'Aberto' && isPast(conta.dataVencimento))) {
      return 'bg-red-100 text-red-800';
    }
    return 'bg-yellow-100 text-yellow-800';
  };

  const applyFilters = () => {
    void loadData(filters);
  };

  const handleSettle = async (entry: FinancialEntryRecord) => {
    setSettlingId(entry.id);
    setErrorMessage(null);

    try {
      const updated = await settleFinancialEntry(entry.id, new Date().toISOString());
      setContasFinanceiras((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setSettlingId(null);
    }
  };

  const handleDelete = async () => {
    if (!itemToDelete) return;
    setIsDeleting(true);
    setErrorMessage(null);

    try {
      await deleteFinancialEntry(itemToDelete);
      setContasFinanceiras((current) => current.filter((entry) => entry.id !== itemToDelete));
      setDeleteConfirmOpen(false);
      setItemToDelete(null);
    } catch (error) {
      setDeleteConfirmOpen(false);
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Financeiro</h2>
          <p className="text-gray-600">Titulos a pagar e receber com baixa e filtros reais</p>
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-6">
          <SelectFilter
            label="Tipo"
            value={filters.type || ''}
            onChange={(value) => setFilters((current) => ({ ...current, type: value as FinancialEntryFilters['type'] || undefined }))}
            options={[
              { label: 'Todos', value: '' },
              { label: 'Pagar', value: 'Pagar' },
              { label: 'Receber', value: 'Receber' },
            ]}
          />
          <SelectFilter
            label="Status"
            value={filters.status || ''}
            onChange={(value) => setFilters((current) => ({ ...current, status: value as FinancialEntryFilters['status'] || undefined }))}
            options={[
              { label: 'Todos', value: '' },
              { label: 'Aberto', value: 'Aberto' },
              { label: 'Pago', value: 'Pago' },
              { label: 'Vencido', value: 'Vencido' },
              { label: 'Cancelado', value: 'Cancelado' },
            ]}
          />
          <SelectFilter
            label="Categoria"
            value={filters.category || ''}
            onChange={(value) => setFilters((current) => ({ ...current, category: value || undefined }))}
            options={[{ label: 'Todas', value: '' }, ...categories.map((category) => ({ label: category, value: category }))]}
          />
          <SelectFilter
            label="Produtor"
            value={filters.producerId || ''}
            onChange={(value) => setFilters((current) => ({ ...current, producerId: value || undefined }))}
            options={[{ label: 'Todos', value: '' }, ...producers.map((producer) => ({ label: producer.name, value: producer.id }))]}
          />
          <DateFilter
            label="Data inicial"
            value={filters.startDate || ''}
            onChange={(value) => setFilters((current) => ({ ...current, startDate: value || undefined }))}
          />
          <DateFilter
            label="Data final"
            value={filters.endDate || ''}
            onChange={(value) => setFilters((current) => ({ ...current, endDate: value || undefined }))}
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

      <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
        <SummaryCard
          title="Contas a pagar"
          value={`R$ ${totalPagar.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          tone="red"
          icon={<TrendingDown className="h-6 w-6 text-red-600" />}
        />
        <SummaryCard
          title="Contas a receber"
          value={`R$ ${totalReceber.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          tone="green"
          icon={<TrendingUp className="h-6 w-6 text-green-600" />}
        />
        <SummaryCard
          title="Saldo previsto"
          value={`R$ ${saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          tone={saldo >= 0 ? 'green' : 'red'}
          icon={<Wallet className="h-6 w-6 text-blue-600" />}
        />
        <SummaryCard
          title="Titulos vencidos"
          value={`R$ ${totalVencido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          tone="yellow"
          icon={<Calendar className="h-6 w-6 text-yellow-600" />}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-200 p-4">
          <h3 className="font-bold text-gray-900">Lancamentos financeiros</h3>
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-3 p-10 text-sm text-gray-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            Carregando lancamentos...
          </div>
        ) : contasFinanceiras.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-600">
            Nenhum lancamento encontrado para os filtros selecionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Tipo</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Descricao</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Categoria</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Produtor</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Valor</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Vencimento</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Origem</th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase text-gray-500">Acoes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {contasFinanceiras.map((conta) => (
                  <tr key={conta.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                          conta.tipo === 'Pagar'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-green-100 text-green-800'
                        }`}
                      >
                        {conta.tipo}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{conta.descricao}</div>
                      {conta.dataPagamento ? (
                        <div className="text-xs text-gray-500">
                          Pago em {format(conta.dataPagamento, 'dd/MM/yyyy')}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-6 py-4 text-sm">{conta.categoria}</td>
                    <td className="px-6 py-4 text-sm">
                      {conta.produtorId ? getProducerById(conta.produtorId)?.name || conta.produtorId : '-'}
                    </td>
                    <td
                      className={`px-6 py-4 font-medium ${
                        conta.tipo === 'Pagar' ? 'text-red-600' : 'text-green-600'
                      }`}
                    >
                      R$ {conta.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {format(conta.dataVencimento, 'dd/MM/yyyy')}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${getStatusColor(conta)}`}>
                        {conta.statusCalculado || conta.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {conta.referenceTable && conta.referenceId
                        ? `${conta.referenceTable} / ${String(conta.referenceId).slice(0, 8)}`
                        : '-'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        {conta.statusCalculado !== 'Pago' && conta.statusCalculado !== 'Cancelado' ? (
                          <button
                            onClick={() => void handleSettle(conta)}
                            disabled={settlingId === conta.id}
                            className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-700 hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {settlingId === conta.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            Dar baixa
                          </button>
                        ) : (
                          <span className="text-sm text-gray-400 mr-2">Sem acao</span>
                        )}
                        <button
                          onClick={() => {
                            setItemToDelete(conta.id);
                            setDeleteConfirmOpen(true);
                          }}
                          className="text-red-600 hover:text-red-900"
                          title="Excluir lançamento"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Lançamento Financeiro</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este lançamento financeiro? Esta ação não pode ser desfeita.
              A exclusão não será permitida se o lançamento já estiver pago ou for originado por uma operação (compra/venda/recepção) - nesse caso, exclua a operação de origem.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
            >
              {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
        className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}
