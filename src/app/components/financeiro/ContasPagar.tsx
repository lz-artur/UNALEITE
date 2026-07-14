import { useState, useMemo, useEffect } from 'react';
import { format } from 'date-fns';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Trash2,
  FileText,
  HelpCircle,
  MoreHorizontal,
  Loader2,
  Download,
  Edit2,
  CheckCircle,
  Eye
} from 'lucide-react';
import { loadFinancialEntries, createFinancialEntry, deleteFinancialEntry, settleFinancialEntry, updateFinancialEntry, type FinancialEntryRecord } from '../../services/operationsApi';
import type { ContaFinanceira } from '../../data/mockData';
import NovaDespesaModal from './NovaDespesaModal';
import { toast } from 'sonner';

export default function ContasPagar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [searchQuery, setSearchQuery] = useState('');
  const [entries, setEntries] = useState<FinancialEntryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sortColumn, setSortColumn] = useState<string>('dataVencimento');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [isBatchDropdownOpen, setIsBatchDropdownOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<FinancialEntryRecord | null>(null);
  const [viewingEntry, setViewingEntry] = useState<FinancialEntryRecord | null>(null);

  const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const selectedMonthLabel = `${monthNames[currentDate.getMonth()]} de ${currentDate.getFullYear()}`;

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const startDate = new Date(year, month, 1).toISOString().split('T')[0];
      const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];

      const data = await loadFinancialEntries({ 
        type: 'Pagar',
        startDate,
        endDate 
      });
      setEntries(data);
    } catch (err) {
      setError('Erro ao carregar dados do financeiro.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
    setCurrentPage(1); // Reset page on month change
  }, [currentDate]);

  const handleSaveDespesa = async (payload: Omit<ContaFinanceira, 'id' | 'statusCalculado'>) => {
    try {
      if (editingEntry) {
        await updateFinancialEntry(editingEntry.id, payload);
        toast.success('Despesa atualizada com sucesso!');
      } else {
        await createFinancialEntry(payload);
        toast.success('Despesa criada com sucesso!');
      }
      setIsModalOpen(false);
      setEditingEntry(null);
      void loadData();
    } catch (err) {
      toast.error(editingEntry ? 'Erro ao atualizar despesa.' : 'Erro ao criar despesa.');
      throw err;
    }
  };

  const handleExportCsv = () => {
    const headers = ['Vencimento', 'Pagamento', 'Descrição', 'Categoria', 'Valor Total', 'A Pagar', 'Situação'];
    const csvContent = [
      headers.join(';'),
      ...entries.map(entry => {
        const isPaid = entry.statusCalculado === 'Pago' || entry.status === 'Pago';
        const aPagar = isPaid ? 0 : entry.valor;
        return [
          safeFormatDate(entry.dataVencimento),
          entry.dataPagamento ? safeFormatDate(entry.dataPagamento) : '',
          `"${entry.descricao}"`,
          `"${entry.categoria}"`,
          entry.valor.toString().replace('.', ','),
          aPagar.toString().replace('.', ','),
          entry.statusCalculado || entry.status
        ].join(';');
      })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `contas_pagar_${format(currentDate, 'MM_yyyy')}.csv`;
    link.click();
  };

  const filteredEntries = useMemo(() => {
    if (!searchQuery) return entries;
    const query = searchQuery.toLowerCase();
    return entries.filter(entry => 
      entry.descricao.toLowerCase().includes(query) || 
      entry.categoria.toLowerCase().includes(query)
    );
  }, [entries, searchQuery]);

  const kpis = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let vencidos = 0;
    let vencemHoje = 0;
    let aVencer = 0;
    let pagos = 0;

    filteredEntries.forEach(entry => {
      const isPaid = entry.statusCalculado === 'Pago' || entry.status === 'Pago';
      const entryDate = new Date(entry.dataVencimento);
      entryDate.setHours(0, 0, 0, 0);

      if (isPaid) {
        pagos += entry.valor;
      } else {
        if (entryDate < today) vencidos += entry.valor;
        else if (entryDate.getTime() === today.getTime()) vencemHoje += entry.valor;
        else aVencer += entry.valor;
      }
    });

    return {
      vencidos,
      vencemHoje,
      aVencer,
      pagos,
      total: pagos + aVencer + vencidos + vencemHoje
    };
  }, [filteredEntries]);

  const sortedEntries = useMemo(() => {
    return [...filteredEntries].sort((a, b) => {
      const isPaidA = a.statusCalculado === 'Pago' || a.status === 'Pago';
      const isPaidB = b.statusCalculado === 'Pago' || b.status === 'Pago';
      const aPagarA = isPaidA ? 0 : a.valor;
      const aPagarB = isPaidB ? 0 : b.valor;

      let valA: any, valB: any;
      switch (sortColumn) {
        case 'dataVencimento':
          valA = new Date(a.dataVencimento).getTime();
          valB = new Date(b.dataVencimento).getTime();
          break;
        case 'dataPagamento':
          valA = a.dataPagamento ? new Date(a.dataPagamento).getTime() : 0;
          valB = b.dataPagamento ? new Date(b.dataPagamento).getTime() : 0;
          break;
        case 'valor':
          valA = a.valor;
          valB = b.valor;
          break;
        case 'aPagar':
          valA = aPagarA;
          valB = aPagarB;
          break;
        default:
          valA = a[sortColumn as keyof FinancialEntryRecord];
          valB = b[sortColumn as keyof FinancialEntryRecord];
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredEntries, sortColumn, sortDirection]);

  const totalItems = sortedEntries.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedEntries = sortedEntries.slice(startIndex, startIndex + itemsPerPage);

  const prevMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };
  
  const nextMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setCurrentDate(new Date());
  };

  const formatCurrency = (val: number) => {
    return val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const getStatusStyle = (status?: string) => {
    switch(status) {
      case 'Pago': return 'bg-green-100 text-green-700';
      case 'Vencido': return 'bg-red-100 text-red-700';
      case 'Cancelado': return 'bg-gray-100 text-gray-700';
      default: return 'bg-amber-100 text-amber-700'; // Aberto
    }
  };

  const safeFormatDate = (dateVal: string | Date | undefined) => {
    if (!dateVal) return '-';
    // Ensure we parse the date properly without timezone backward shifting
    try {
      const d = new Date(dateVal);
      const userTimezoneOffset = d.getTimezoneOffset() * 60000;
      const adjustedDate = new Date(d.getTime() + userTimezoneOffset);
      return format(adjustedDate, 'dd/MM/yyyy');
    } catch {
      return '-';
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(paginatedEntries.map(entry => entry.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleBatchSettle = async () => {
    if (selectedIds.length === 0) return;
    try {
      await Promise.all(selectedIds.map(id => settleFinancialEntry(id)));
      toast.success(`${selectedIds.length} conta(s) baixada(s) com sucesso!`);
      setSelectedIds([]);
      setIsBatchDropdownOpen(false);
      void loadData();
    } catch (err) {
      toast.error('Erro ao baixar contas em lote.');
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Tem certeza que deseja excluir ${selectedIds.length} conta(s)?`)) return;
    try {
      await Promise.all(selectedIds.map(id => deleteFinancialEntry(id)));
      toast.success(`${selectedIds.length} conta(s) excluída(s) com sucesso!`);
      setSelectedIds([]);
      setIsBatchDropdownOpen(false);
      void loadData();
    } catch (err) {
      toast.error('Erro ao excluir contas em lote.');
    }
  };

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow-sm">
      {/* Module Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between p-4 border-b border-gray-200 gap-4">
        <h2 className="text-xl font-semibold text-gray-800">Contas a pagar</h2>
        
        <div className="flex flex-wrap items-center gap-2">
          <button 
            onClick={() => {
              setEditingEntry(null);
              setIsModalOpen(true);
            }}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded text-sm font-medium transition-colors"
          >
            Nova despesa
          </button>
          
          <button 
            onClick={handleExportCsv}
            className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center gap-1"
          >
            <Download className="w-4 h-4" /> Exportar
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="p-4 flex flex-col gap-4 border-b border-gray-100">
        <div className="flex flex-wrap items-end gap-4">
          
          <div className="flex flex-col">
            <label className="text-xs text-gray-500 mb-1">Vencimento</label>
            <div className="flex items-center border border-gray-300 rounded overflow-hidden">
              <button onClick={prevMonth} className="px-2 py-1.5 bg-gray-50 hover:bg-gray-100 border-r border-gray-300 text-blue-600 transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button className="px-4 py-1.5 bg-white hover:bg-gray-50 text-sm font-medium text-blue-600 flex items-center gap-2 min-w-[160px] justify-center transition-colors">
                {selectedMonthLabel} <ChevronDown className="w-4 h-4" />
              </button>
              <button onClick={nextMonth} className="px-2 py-1.5 bg-gray-50 hover:bg-gray-100 border-l border-gray-300 text-blue-600 transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex flex-col flex-grow">
            <label className="text-xs text-gray-500 mb-1">Pesquisar no período selecionado</label>
            <div className="relative">
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Pesquisar" 
                className="w-full border border-gray-300 rounded pl-3 pr-10 py-1.5 text-sm focus:outline-none focus:border-blue-500"
              />
              <Search className="w-4 h-4 text-blue-500 absolute right-3 top-1/2 -translate-y-1/2" />
            </div>
          </div>
        </div>

        <div>
          <button onClick={handleClearFilters} className="flex items-center gap-1 text-sm text-blue-600 hover:underline">
            <Trash2 className="w-4 h-4" /> Limpar filtros
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-5 divide-x border-b border-gray-200 bg-white">
        <div className="p-4 flex flex-col items-center justify-center">
          <span className="text-xs text-gray-500 mb-1">Vencidos (R$)</span>
          <span className="text-xl font-bold text-red-500">{formatCurrency(kpis.vencidos)}</span>
        </div>
        <div className="p-4 flex flex-col items-center justify-center">
          <span className="text-xs text-gray-500 mb-1">Vencem hoje (R$)</span>
          <span className="text-xl font-bold text-red-500">{formatCurrency(kpis.vencemHoje)}</span>
        </div>
        <div className="p-4 flex flex-col items-center justify-center">
          <span className="text-xs text-gray-500 mb-1">A vencer (R$)</span>
          <span className="text-xl font-bold text-blue-500">{formatCurrency(kpis.aVencer)}</span>
        </div>
        <div className="p-4 flex flex-col items-center justify-center">
          <span className="text-xs text-gray-500 mb-1">Pagos (R$)</span>
          <span className="text-xl font-bold text-green-500">{formatCurrency(kpis.pagos)}</span>
        </div>
        <div className="p-4 flex flex-col items-center justify-center relative">
          <span className="text-xs text-gray-500 mb-1 flex items-center gap-1">
            Total do período (R$) <HelpCircle className="w-3 h-3 text-blue-500" />
          </span>
          <span className="text-xl font-bold text-blue-500">{formatCurrency(kpis.total)}</span>
        </div>
      </div>

      {/* List Actions */}
      <div className="p-3 bg-gray-50 flex items-center gap-4 border-b border-gray-200">
        <span className="text-xs text-gray-500 font-medium">{selectedIds.length} registro(s) selecionado(s)</span>
        
        <div className="relative">
          <button 
            disabled={selectedIds.length === 0}
            onClick={() => setIsBatchDropdownOpen(!isBatchDropdownOpen)}
            className="flex items-center gap-1 text-sm text-blue-600 font-medium bg-white border border-gray-300 rounded px-3 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Ações em lote <ChevronDown className="w-4 h-4" />
          </button>
          
          {isBatchDropdownOpen && selectedIds.length > 0 && (
            <div className="absolute top-full left-0 mt-1 w-40 bg-white rounded-md shadow-lg border border-gray-200 z-10 py-1">
              <button 
                onClick={handleBatchSettle}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
              >
                <CheckCircle className="w-4 h-4 text-green-500" /> Dar baixa
              </button>
              <button 
                onClick={handleBatchDelete}
                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100 flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" /> Excluir
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto flex-grow">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 w-10">
                <input 
                  type="checkbox" 
                  className="rounded border-gray-300"
                  checked={paginatedEntries.length > 0 && selectedIds.length === paginatedEntries.length}
                  onChange={handleSelectAll}
                />
              </th>
              <th className="px-4 py-3 font-medium whitespace-nowrap cursor-pointer hover:bg-gray-100" onClick={() => handleSort('dataVencimento')}>
                Vencimento {sortColumn === 'dataVencimento' && <ChevronDown className={`inline w-3 h-3 transition-transform ${sortDirection === 'desc' ? 'rotate-180' : ''}`} />}
              </th>
              <th className="px-4 py-3 font-medium whitespace-nowrap cursor-pointer hover:bg-gray-100" onClick={() => handleSort('dataPagamento')}>
                Pagamento <HelpCircle className="inline w-3 h-3 text-blue-500" /> {sortColumn === 'dataPagamento' && <ChevronDown className={`inline w-3 h-3 transition-transform ${sortDirection === 'desc' ? 'rotate-180' : ''}`} />}
              </th>
              <th className="px-4 py-3 font-medium">Descrição</th>
              <th className="px-4 py-3 font-medium text-right whitespace-nowrap cursor-pointer hover:bg-gray-100" onClick={() => handleSort('valor')}>
                Total (R$) {sortColumn === 'valor' && <ChevronDown className={`inline w-3 h-3 transition-transform ${sortDirection === 'desc' ? 'rotate-180' : ''}`} />}
              </th>
              <th className="px-4 py-3 font-medium text-right whitespace-nowrap cursor-pointer hover:bg-gray-100" onClick={() => handleSort('aPagar')}>
                A pagar (R$) {sortColumn === 'aPagar' && <ChevronDown className={`inline w-3 h-3 transition-transform ${sortDirection === 'desc' ? 'rotate-180' : ''}`} />}
              </th>
              <th className="px-4 py-3 font-medium cursor-pointer hover:bg-gray-100" onClick={() => handleSort('status')}>
                Situação {sortColumn === 'status' && <ChevronDown className={`inline w-3 h-3 transition-transform ${sortDirection === 'desc' ? 'rotate-180' : ''}`} />}
              </th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-500" />
                  Carregando registros...
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-red-500">
                  {error}
                </td>
              </tr>
            ) : paginatedEntries.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500">
                  Nenhum registro encontrado.
                </td>
              </tr>
            ) : (
              paginatedEntries.map((entry) => {
                const isPaid = entry.statusCalculado === 'Pago' || entry.status === 'Pago';
                const aPagar = isPaid ? 0 : entry.valor;
                
                return (
                  <tr key={entry.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <input 
                        type="checkbox" 
                        className="rounded border-gray-300"
                        checked={selectedIds.includes(entry.id)}
                        onChange={() => handleSelect(entry.id)}
                      />
                    </td>
                    <td className="px-4 py-3 text-gray-600">{safeFormatDate(entry.dataVencimento)}</td>
                    <td className="px-4 py-3 text-gray-600">{entry.dataPagamento ? safeFormatDate(entry.dataPagamento) : '-'}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{entry.descricao}</div>
                      <div className="text-xs text-gray-400">{entry.categoria}</div>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(entry.valor)}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(aPagar)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${getStatusStyle(entry.statusCalculado || entry.status)}`}>
                        {entry.statusCalculado || entry.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right relative">
                      <div className="flex items-center justify-end gap-2">
                        <FileText className="w-4 h-4 text-gray-400 hover:text-blue-500 cursor-pointer" />
                        <button 
                          onClick={() => setOpenDropdownId(openDropdownId === entry.id ? null : entry.id)}
                          className="flex items-center gap-1 text-xs font-medium text-blue-600 bg-white border border-gray-300 rounded px-2 py-1 hover:bg-gray-50"
                        >
                          Ações <ChevronDown className="w-3 h-3" />
                        </button>
                      </div>
                      
                      {openDropdownId === entry.id && (
                        <div className="absolute right-4 top-10 w-36 bg-white rounded-md shadow-lg border border-gray-200 z-20 py-1">
                          <button 
                            onClick={async () => {
                              try {
                                await settleFinancialEntry(entry.id);
                                toast.success('Conta baixada com sucesso!');
                                setOpenDropdownId(null);
                                void loadData();
                              } catch (e) {
                                toast.error('Erro ao baixar conta.');
                              }
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                          >
                            <CheckCircle className="w-4 h-4 text-green-500" /> Dar baixa
                          </button>
                          <button 
                            onClick={() => {
                              setEditingEntry(entry);
                              setIsModalOpen(true);
                              setOpenDropdownId(null);
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                          >
                            <Edit2 className="w-4 h-4 text-blue-500" /> Editar
                          </button>
                          <button 
                            onClick={() => {
                              setViewingEntry(entry);
                              setOpenDropdownId(null);
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                          >
                            <Eye className="w-4 h-4 text-gray-500" /> Ver detalhes
                          </button>
                          <button 
                            onClick={async () => {
                              if (confirm('Tem certeza que deseja excluir esta conta?')) {
                                try {
                                  await deleteFinancialEntry(entry.id);
                                  toast.success('Conta excluída com sucesso!');
                                  setOpenDropdownId(null);
                                  void loadData();
                                } catch (e) {
                                  toast.error('Erro ao excluir conta.');
                                }
                              }
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100 flex items-center gap-2"
                          >
                            <Trash2 className="w-4 h-4" /> Excluir
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer Area */}
      <div className="border-t border-gray-200">
        
        {/* Totals Section */}
        <div className="p-4 flex justify-between items-center bg-gray-50">
          <div>
            <div className="text-sm font-semibold text-gray-700">Totais do período</div>
            <div className="text-xs text-gray-500">
              {format(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1), 'dd/MM/yyyy')} a {format(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0), 'dd/MM/yyyy')}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-500 mb-1 flex items-center justify-end gap-1">
              Totais do período (R$) <ChevronDown className="w-3 h-3" />
            </div>
            <div className="text-lg font-bold text-gray-800">{formatCurrency(kpis.total)}</div>
          </div>
        </div>

        {/* Pagination Section */}
        <div className="p-4 flex flex-col md:flex-row items-center justify-between gap-4 bg-white border-t border-gray-200">
          <div className="flex items-center gap-2">
            <select 
              value={itemsPerPage}
              onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
              className="border border-gray-300 rounded text-sm py-1 pl-2 pr-6 focus:outline-none focus:border-blue-500 appearance-none bg-white"
            >
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
            </select>
            <span className="text-xs text-gray-500">Registros por página</span>
          </div>

          <div className="flex flex-col items-center">
            <div className="flex rounded border border-gray-300 overflow-hidden text-sm">
              <button 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 flex items-center text-blue-600 bg-white hover:bg-gray-50 border-r border-gray-300 font-medium disabled:text-gray-400 disabled:hover:bg-white"
              >
                <ChevronLeft className="w-4 h-4 mr-1" /> Anterior
              </button>
              
              <div className="flex bg-white">
                {Array.from({ length: totalPages }).map((_, i) => (
                  <button 
                    key={i + 1}
                    onClick={() => setCurrentPage(i + 1)}
                    className={`px-3 py-1 border-r border-gray-300 transition-colors ${
                      currentPage === i + 1 
                        ? 'text-white bg-blue-500' 
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>

              <button 
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 flex items-center text-blue-600 bg-white hover:bg-gray-50 font-medium disabled:text-gray-400 disabled:hover:bg-white"
              >
                Próximo <ChevronRight className="w-4 h-4 ml-1" />
              </button>
            </div>
            <span className="text-xs text-gray-400 mt-2">
              Mostrando {Math.min(startIndex + 1, totalItems)} - {Math.min(startIndex + itemsPerPage, totalItems)} de {totalItems} registros
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Ir para página</span>
            <input 
              type="text" 
              className="border border-gray-300 rounded w-12 py-1 px-2 text-sm text-center" 
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const val = parseInt(e.currentTarget.value);
                  if (val >= 1 && val <= totalPages) setCurrentPage(val);
                }
              }}
            />
            <button className="text-sm font-medium text-blue-600">Ok</button>
          </div>
        </div>
      </div>
      
      <NovaDespesaModal 
          isOpen={isModalOpen} 
          onClose={() => {
            setIsModalOpen(false);
            setEditingEntry(null);
          }} 
          onSave={handleSaveDespesa} 
          initialData={editingEntry}
        />
        
        {viewingEntry && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-800">Detalhes da Despesa</h2>
                <button onClick={() => setViewingEntry(null)} className="text-gray-500 hover:text-gray-700">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4 flex flex-col gap-3 text-sm">
                <div><span className="font-semibold text-gray-700">Descrição:</span> {viewingEntry.descricao}</div>
                <div><span className="font-semibold text-gray-700">Categoria:</span> {viewingEntry.categoria}</div>
                <div><span className="font-semibold text-gray-700">Valor Total:</span> {formatCurrency(viewingEntry.valor)}</div>
                <div><span className="font-semibold text-gray-700">Data de Vencimento:</span> {safeFormatDate(viewingEntry.dataVencimento)}</div>
                <div><span className="font-semibold text-gray-700">Data de Pagamento:</span> {viewingEntry.dataPagamento ? safeFormatDate(viewingEntry.dataPagamento) : '-'}</div>
                <div>
                  <span className="font-semibold text-gray-700">Situação:</span> 
                  <span className={`ml-2 inline-block px-2 py-0.5 text-xs font-medium rounded ${getStatusStyle(viewingEntry.statusCalculado || viewingEntry.status)}`}>
                    {viewingEntry.statusCalculado || viewingEntry.status}
                  </span>
                </div>
              </div>
              <div className="p-4 border-t border-gray-200 flex justify-end">
                <button 
                  onClick={() => setViewingEntry(null)}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-2 rounded text-sm font-medium transition-colors"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
