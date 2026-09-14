import { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Loader2, PackageMinus, Plus, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { usePermissions } from '../context/PermissionsContext';
import { useCadastros } from '../context/CadastrosContext';
import { createWarehouseWithdrawal, loadSupplyLots, loadWarehouseWithdrawals, type SupplyLotInventoryItem, type WarehouseWithdrawal } from '../services/operationsApi';

const SECTORS = ['Limpeza', 'Laboratório', 'Produção', 'Manutenção', 'Administrativo'];
const parseQuantity = (value: string) => { const result = Number(value.replace(',', '.')); return Number.isFinite(result) && result > 0 ? result : null; };
const showQuantity = (value: number) => Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 3 });

type DraftLine = { supplyItemId: string; quantity: string };

export default function Almoxarifado() {
  const { hasPermission } = usePermissions();
  const { supplyItems, units } = useCadastros();
  const [lots, setLots] = useState<SupplyLotInventoryItem[]>([]);
  const [history, setHistory] = useState<WarehouseWithdrawal[]>([]);
  const [sector, setSector] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([{ supplyItemId: '', quantity: '' }]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const canCreate = hasPermission('inventario', 'create') || hasPermission('inventario', 'edit');

  const refresh = async () => {
    setLoading(true);
    try {
      const [nextLots, nextHistory] = await Promise.all([loadSupplyLots(), loadWarehouseWithdrawals()]);
      setLots(nextLots); setHistory(nextHistory);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Não foi possível carregar o almoxarifado.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); }, []);

  const items = useMemo(() => supplyItems.filter((item) => item.active && item.isWarehouseItem).map((item) => ({
    ...item,
    available: lots.filter((lot) => lot.supplyItemId === item.id).reduce((total, lot) => total + lot.availableQuantity, 0),
    symbol: units.find((unit) => unit.id === item.unitId)?.symbol ?? 'un',
  })).sort((a, b) => a.name.localeCompare(b.name)), [lots, supplyItems, units]);
  const selectedIds = new Set(lines.map((line) => line.supplyItemId).filter(Boolean));
  const updateLine = (index: number, change: Partial<DraftLine>) => setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...change } : line));

  const submit = async () => {
    const payloadLines = lines.map((line) => ({ supplyItemId: line.supplyItemId, quantity: parseQuantity(line.quantity) })).filter((line): line is { supplyItemId: string; quantity: number } => Boolean(line.supplyItemId) && line.quantity !== null);
    if (!sector) return toast.error('Selecione o setor de destino.');
    if (!payloadLines.length || payloadLines.length !== lines.length) return toast.error('Informe um item e uma quantidade válida em cada linha.');
    if (new Set(payloadLines.map((line) => line.supplyItemId)).size !== payloadLines.length) return toast.error('Use apenas uma linha para cada item.');
    for (const line of payloadLines) { const item = items.find((entry) => entry.id === line.supplyItemId); if (!item || line.quantity > item.available) return toast.error(`Estoque insuficiente para ${item?.name ?? 'o item selecionado'}.`); }
    setWorking(true);
    try {
      await createWarehouseWithdrawal({ sector, notes: notes || undefined, items: payloadLines });
      toast.success('Saída registrada e estoque baixado.');
      setSector(''); setNotes(''); setLines([{ supplyItemId: '', quantity: '' }]);
      await refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Não foi possível registrar a saída.'); }
    finally { setWorking(false); }
  };

  return <div className="mx-auto max-w-6xl space-y-6 pb-16">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><div className="mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-600 text-white"><PackageMinus className="h-6 w-6" /></div><h1 className="text-2xl font-bold text-gray-900">Almoxarifado</h1><p className="mt-1 text-sm text-gray-600">Registre a entrega de materiais internos por setor.</p></div></header>
    <section className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-900"><strong>Itens disponíveis:</strong> somente insumos marcados como “Item do almoxarifado” no cadastro aparecem nesta tela. A baixa usa os lotes mais próximos do vencimento primeiro.</section>
    {canCreate && <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6"><div className="mb-5"><h2 className="font-bold text-gray-900">Nova saída para setor</h2><p className="mt-1 text-sm text-gray-500">Adicione os itens e informe onde serão utilizados.</p></div><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium text-gray-700">Setor de destino<select value={sector} onChange={(event) => setSector(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm"><option value="">Selecione o setor</option>{SECTORS.map((entry) => <option key={entry}>{entry}</option>)}</select></label><label className="text-sm font-medium text-gray-700">Observações (opcional)<input value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" placeholder="Ex.: uso semanal" /></label></div><div className="mt-5 space-y-2">{lines.map((line, index) => <div key={index} className="grid gap-2 rounded-xl bg-slate-50 p-2 sm:grid-cols-[minmax(0,1fr)_160px_auto]"><select value={line.supplyItemId} onChange={(event) => updateLine(index, { supplyItemId: event.target.value })} className="h-11 min-w-0 rounded-xl border border-gray-200 bg-white px-3 text-sm"><option value="">Selecione o item</option>{items.filter((item) => item.id === line.supplyItemId || !selectedIds.has(item.id)).map((item) => <option key={item.id} value={item.id}>{item.name} · disponível {showQuantity(item.available)} {item.symbol}</option>)}</select><input inputMode="decimal" value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} placeholder="Quantidade" className="h-11 rounded-xl border border-gray-200 px-3 text-sm" />{lines.length > 1 ? <button onClick={() => setLines((current) => current.filter((_, currentIndex) => currentIndex !== index))} className="flex h-11 items-center justify-center rounded-xl px-3 text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button> : <div className="hidden sm:block" />}</div>)}</div><div className="mt-4 flex flex-wrap gap-2"><button onClick={() => setLines((current) => [...current, { supplyItemId: '', quantity: '' }])} disabled={lines.length >= items.length} className="flex h-10 items-center gap-1.5 rounded-xl border border-gray-200 px-3 text-sm font-semibold text-gray-700 disabled:opacity-50"><Plus className="h-4 w-4" />Adicionar item</button><button onClick={() => void submit()} disabled={working || !items.length} className="flex h-10 items-center gap-1.5 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-50"><Send className="h-4 w-4" />{working ? 'Registrando...' : 'Confirmar saída'}</button></div></section>}
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white"><div className="border-b border-gray-100 p-4"><h2 className="font-bold text-gray-900">Histórico de saídas</h2></div>{loading ? <div className="flex items-center justify-center gap-2 p-10 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" />Carregando...</div> : history.length ? <div className="divide-y divide-gray-100">{history.map((entry) => <article key={entry.id} className="p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold text-gray-900">{entry.withdrawal_number} · {entry.sector}</p><p className="mt-0.5 text-xs text-gray-500">{new Date(entry.withdrawal_date).toLocaleString('pt-BR')}</p></div><span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">{entry.warehouse_withdrawal_items.length} item(ns)</span></div><div className="mt-3 flex flex-wrap gap-2">{entry.warehouse_withdrawal_items.map((item) => <span key={item.id} className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs text-slate-700">{item.supply_items?.name ?? 'Item'}: <strong>{showQuantity(item.quantity)} {item.supply_items?.units?.symbol ?? ''}</strong></span>)}</div>{entry.notes && <p className="mt-2 text-xs text-gray-500">{entry.notes}</p>}</article>)}</div> : <div className="p-10 text-center text-sm text-gray-500"><ClipboardList className="mx-auto mb-2 h-7 w-7 text-gray-300" />Nenhuma saída registrada.</div>}</section>
  </div>;
}
