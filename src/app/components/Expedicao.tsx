import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, ClipboardList, History, Loader2, Package, Plus, Scale, Send, Trash2, Truck } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { usePermissions } from '../context/PermissionsContext';
import { useCadastros } from '../context/CadastrosContext';
import {
  addExpeditionWeighing,
  confirmSaleExpedition,
  createSaleExpedition,
  deleteExpeditionWeighing,
  loadFinishedProductLots,
  loadSaleExpedition,
  loadSaleExpeditions,
  loadSalesOrders,
  type SaleExpedition,
  type SaleExpeditionSummary,
  type SalesOrderRecord,
} from '../services/operationsApi';

const statusLabel: Record<SaleExpeditionSummary['status'], { text: string; className: string }> = {
  em_pesagem: { text: 'Em pesagem', className: 'bg-blue-50 text-blue-700' },
  expedida: { text: 'Expedida', className: 'bg-emerald-50 text-emerald-700' },
  cancelada: { text: 'Cancelada', className: 'bg-slate-100 text-slate-600' },
};

function parseQuantity(value: string) {
  const number = Number(value.replace(',', '.'));
  return Number.isFinite(number) && number > 0 ? number : null;
}

function quantity(value: number) {
  return Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

function dateTime(value?: string | null) {
  return value ? format(new Date(value), "dd/MM/yy 'às' HH:mm", { locale: ptBR }) : '—';
}

export default function Expedicao() {
  const { hasPermission } = usePermissions();
  const { getFinishedProductById } = useCadastros();
  const canCreate = hasPermission('expedicao', 'create');
  const canEdit = hasPermission('expedicao', 'edit');
  const [expeditions, setExpeditions] = useState<SaleExpeditionSummary[]>([]);
  const [orders, setOrders] = useState<SalesOrderRecord[]>([]);
  const [lots, setLots] = useState<Array<{ id: string; produtoId: string; lote: string; disponivel: number; disponivelPecas?: number }>>([]);
  const [active, setActive] = useState<SaleExpedition | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [weighingForms, setWeighingForms] = useState<Record<string, { lotId: string; quantity: string; pieces: string }>>({});

  const loadOverview = async () => {
    setLoading(true);
    try {
      const [nextExpeditions, nextOrders, nextLots] = await Promise.all([
        loadSaleExpeditions(),
        loadSalesOrders(),
        loadFinishedProductLots({ requireLive: true }),
      ]);
      setExpeditions(nextExpeditions);
      setOrders(nextOrders);
      setLots(nextLots.map((lot) => ({ id: lot.id, produtoId: lot.produtoId, lote: lot.lote, disponivel: lot.disponivel, disponivelPecas: lot.disponivelPecas })));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível carregar a expedição.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadOverview(); }, []);

  const openExpedition = async (id: string) => {
    setWorking(true);
    try {
      setActive(await loadSaleExpedition(id));
      setWeighingForms({});
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível abrir a expedição.');
    } finally { setWorking(false); }
  };

  const startExpedition = async (order: SalesOrderRecord) => {
    setWorking(true);
    try {
      const expedition = await createSaleExpedition(order.id);
      setActive(expedition);
      setWeighingForms({});
      await loadOverview();
      toast.success(`Expedição do pedido ${order.number} iniciada.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível iniciar a expedição.');
    } finally { setWorking(false); }
  };

  const addWeighing = async (itemId: string) => {
    if (!active) return;
    const form = weighingForms[itemId] ?? { lotId: '', quantity: '', pieces: '' };
    const amount = parseQuantity(form.quantity);
    const pieces = form.pieces ? parseQuantity(form.pieces) : null;
    const isCheese = itemIsCheese(itemId);
    if (!form.lotId || amount === null || (isCheese && (!pieces || !Number.isInteger(pieces)))) { toast.error(isCheese ? 'Selecione o lote e informe KG e peças válidos.' : 'Selecione o lote e informe uma pesagem válida.'); return; }
    setWorking(true);
    try {
      const expedition = await addExpeditionWeighing({ expeditionId: active.id, salesOrderItemId: itemId, finishedProductLotId: form.lotId, quantity: amount, piecesQuantity: isCheese ? pieces! : undefined });
      setActive(expedition);
      setWeighingForms((current) => ({ ...current, [itemId]: { lotId: form.lotId, quantity: '', pieces: '' } }));
      toast.success(`${quantity(amount)} registrado na pesagem.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível registrar a pesagem.');
    } finally { setWorking(false); }
  };

  const removeWeighing = async (weighingId: string) => {
    if (!active) return;
    setWorking(true);
    try {
      setActive(await deleteExpeditionWeighing(active.id, weighingId));
      toast.success('Pesagem removida.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível remover a pesagem.');
    } finally { setWorking(false); }
  };

  const confirm = async () => {
    if (!active) return;
    const total = active.order.items.reduce((sum, item) => sum + item.lines.reduce((lineTotal, line) => lineTotal + line.weighed_quantity, 0), 0);
    if (!total) { toast.error('Registre ao menos uma pesagem antes de confirmar a saída.'); return; }
    setWorking(true);
    try {
      const expedition = await confirmSaleExpedition(active.id);
      setActive(expedition);
      await loadOverview();
      toast.success('Expedição conferida e estoque baixado. Finalize a venda no Comercial para gerar o contas a receber.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'A confirmação não pôde ser concluída.');
    } finally { setWorking(false); }
  };

  const activeOrderIds = useMemo(() => new Set(expeditions.filter((entry) => entry.status === 'em_pesagem').map((entry) => entry.sales_order_id)), [expeditions]);
  const pendingOrders = useMemo(() => orders.filter((order) => order.status !== 'Atendido' && order.status !== 'Cancelado' && order.items.some((item) => item.pendingQuantity > 0)), [orders]);
  const itemIsCheese = (itemId: string) => {
    const item = active?.order.items.find((entry) => entry.id === itemId);
    return item ? getFinishedProductById(item.product_id)?.category === 'Queijo' : false;
  };

  if (active) {
    const editable = active.status === 'em_pesagem' && (canCreate || canEdit);
    const totalWeighed = active.order.items.reduce((sum, item) => sum + item.lines.reduce((lineTotal, line) => lineTotal + line.weighed_quantity, 0), 0);
    return <div className="mx-auto max-w-6xl space-y-5 pb-24">
      <div className="flex items-start gap-3"><button onClick={() => { setActive(null); void loadOverview(); }} className="mt-0.5 rounded-xl p-2 text-gray-600 hover:bg-gray-100"><ArrowLeft className="h-5 w-5" /></button><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Pedido {active.order.number}</h1><Badge status={active.status} /></div><p className="mt-1 text-sm text-gray-500">Cliente: {active.order.client_name} · Expedição {active.expedition_number}</p></div></div>
      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900"><strong>Pesagem parcial:</strong> cada registro é somado automaticamente. A saída e a baixa de estoque só ocorrem ao confirmar a expedição.</div>
      <div className="grid grid-cols-3 gap-2"><Summary label="Itens" value={active.order.items.length} /><Summary label="Pesado" value={quantity(totalWeighed)} /><Summary label="Status" value={active.status === 'expedida' ? 'Enviado' : 'Pesando'} /></div>
      <div className="space-y-4">{active.order.items.filter((item) => item.pending_quantity > 0 || item.lines.length).map((item) => {
        const weighed = item.lines.reduce((sum, line) => sum + line.weighed_quantity, 0);
        const remaining = Math.max(0, item.pending_quantity - weighed);
        const availableLots = lots.filter((lot) => lot.produtoId === item.product_id && lot.disponivel > 0);
        const form = weighingForms[item.id] ?? { lotId: item.lines[0]?.finished_product_lot_id ?? '', quantity: '', pieces: '' };
        const isCheese = itemIsCheese(item.id);
        const weighedPieces = item.lines.reduce((sum, line) => sum + line.weighed_pieces, 0);
        return <article key={item.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-bold text-gray-900">{item.product_name}</p><p className="mt-0.5 text-xs text-gray-500">{item.product_code ?? 'Produto acabado'} · Pedido: {quantity(item.ordered_quantity)}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${remaining <= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{remaining <= 0 ? 'Quantidade atingida' : `Faltam ${quantity(remaining)}`}</span></div>
          <div className={`mt-4 grid gap-2 ${isCheese ? 'grid-cols-3' : 'grid-cols-2'}`}><Metric label="Já atendido" value={`${quantity(item.fulfilled_quantity)} kg`} /><Metric label="Nesta expedição" value={`${quantity(weighed)} kg`} tone="blue" />{isCheese && <Metric label="Peças nesta expedição" value={quantity(weighedPieces)} tone="blue" />}</div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${Math.min(100, item.pending_quantity ? (weighed / item.pending_quantity) * 100 : 100)}%` }} /></div>
          {editable && remaining > 0 && <div className="mt-4 min-w-0 rounded-xl border border-gray-200 bg-slate-50 p-3"><p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-700"><Scale className="h-4 w-4 text-blue-600" />Registrar nova pesagem</p><div className={`grid min-w-0 gap-2 ${isCheese ? 'sm:grid-cols-[minmax(0,1fr)_130px_120px_auto]' : 'sm:grid-cols-[minmax(0,1fr)_150px_auto]'}`}><select value={form.lotId} onChange={(event) => setWeighingForms((current) => ({ ...current, [item.id]: { ...form, lotId: event.target.value } }))} className="h-11 w-full min-w-0 rounded-xl border border-gray-200 bg-white px-3 text-sm"><option value="">Selecione o lote</option>{availableLots.map((lot) => <option key={lot.id} value={lot.id}>{lot.lote} · {quantity(lot.disponivel)} kg{isCheese ? ` · ${quantity(lot.disponivelPecas ?? 0)} peças` : ''}</option>)}</select><input inputMode="decimal" value={form.quantity} onChange={(event) => setWeighingForms((current) => ({ ...current, [item.id]: { ...form, quantity: event.target.value } }))} placeholder="KG" className="h-11 w-full min-w-0 rounded-xl border border-gray-200 px-3 text-sm outline-none ring-blue-500 focus:ring-2" />{isCheese && <input inputMode="numeric" value={form.pieces} onChange={(event) => setWeighingForms((current) => ({ ...current, [item.id]: { ...form, pieces: event.target.value } }))} placeholder="Peças" className="h-11 w-full min-w-0 rounded-xl border border-gray-200 px-3 text-sm outline-none ring-blue-500 focus:ring-2" />}<button disabled={working} onClick={() => void addWeighing(item.id)} className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-50 sm:w-auto"><Plus className="h-4 w-4" />Adicionar</button></div></div>}
          {item.lines.flatMap((line) => line.weighings.map((weighing) => ({ ...weighing, lotCode: line.lot?.lot_code ?? 'Lote' }))).length > 0 && <div className="mt-4 border-t border-gray-100 pt-3"><p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">Histórico de pesagens</p><div className="space-y-2">{item.lines.flatMap((line) => line.weighings.map((weighing) => ({ ...weighing, lotCode: line.lot?.lot_code ?? 'Lote' }))).map((weighing) => <div key={weighing.id} className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2 text-sm"><Scale className="h-4 w-4 text-blue-600" /><span className="font-semibold text-gray-800">{quantity(weighing.quantity)} kg{weighing.pieces_quantity != null ? ` · ${quantity(weighing.pieces_quantity)} peças` : ''}</span><span className="text-xs text-gray-500">{weighing.lotCode} · {dateTime(weighing.weighed_at)}</span>{editable && <button disabled={working} onClick={() => void removeWeighing(weighing.id)} className="ml-auto rounded-lg p-1.5 text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>}</div>)}</div></div>}
        </article>;
      })}</div>
      {active.logs.length > 0 && <section className="rounded-2xl border border-gray-200 bg-white p-4"><h2 className="mb-3 flex items-center gap-2 font-bold text-gray-900"><History className="h-5 w-5 text-blue-600" />Rastreio da expedição</h2>{active.logs.map((log) => <div key={log.id} className="mb-3 flex gap-3 text-sm"><span className="mt-1.5 h-2 w-2 rounded-full bg-blue-500" /><div><p className="font-medium text-gray-800">{log.actor_name} · {log.action.replaceAll('_', ' ')}</p><p className="text-xs text-gray-500">{dateTime(log.created_at)}</p></div></div>)}</section>}
      {editable && <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-gray-200 bg-white/95 p-3 backdrop-blur md:left-64"><button disabled={working || !totalWeighed} onClick={() => void confirm()} className="mx-auto flex h-12 w-full max-w-6xl items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-bold text-white disabled:opacity-50"><Send className="h-4 w-4" />{working ? 'Confirmando...' : 'Confirmar saída e baixar estoque'}</button></div>}
    </div>;
  }

  return <div className="mx-auto max-w-6xl space-y-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><div className="mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white"><Truck className="h-6 w-6" /></div><h1 className="text-2xl font-bold text-gray-900">Expedição</h1><p className="mt-1 text-sm text-gray-600">Registre pesagens parciais e confirme a saída dos pedidos.</p></div></div>
    <section className="rounded-2xl border border-gray-200 bg-white"><div className="border-b border-gray-100 p-4"><h2 className="font-bold text-gray-900">Em pesagem e histórico</h2></div>{loading ? <Loading /> : expeditions.length ? <div className="divide-y divide-gray-100">{expeditions.map((expedition) => <button key={expedition.id} onClick={() => void openExpedition(expedition.id)} className="flex w-full items-center gap-3 p-4 text-left hover:bg-gray-50"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Scale className="h-5 w-5" /></div><div className="min-w-0 flex-1"><p className="font-semibold text-gray-900">Pedido {expedition.order_number} · {expedition.client_name}</p><p className="mt-0.5 text-xs text-gray-500">{expedition.expedition_number} · {dateTime(expedition.created_at)}</p></div><Badge status={expedition.status} /></button>)}</div> : <Empty text="Nenhuma expedição registrada." />}</section>
    <section className="rounded-2xl border border-gray-200 bg-white"><div className="border-b border-gray-100 p-4"><h2 className="font-bold text-gray-900">Pedidos aguardando expedição</h2><p className="mt-1 text-sm text-gray-500">Escolha um pedido para iniciar as pesagens.</p></div>{loading ? <Loading /> : pendingOrders.length ? <div className="divide-y divide-gray-100">{pendingOrders.map((order) => <div key={order.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"><div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-slate-100 text-slate-600"><Package className="h-5 w-5" /></div><div className="min-w-0 flex-1"><p className="font-semibold text-gray-900">{order.number} · {order.clientName}</p><p className="mt-0.5 text-xs text-gray-500">{order.items.filter((item) => item.pendingQuantity > 0).length} item(ns) pendente(s)</p></div>{activeOrderIds.has(order.id) ? <span className="rounded-xl bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">Já em pesagem</span> : canCreate && <button disabled={working} onClick={() => void startExpedition(order)} className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 text-sm font-semibold text-white disabled:opacity-50"><Plus className="h-4 w-4" />Iniciar</button>}</div>)}</div> : <Empty text="Não há pedidos pendentes de expedição." />}</section>
  </div>;
}

function Badge({ status }: { status: SaleExpeditionSummary['status'] }) { const item = statusLabel[status]; return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.className}`}>{item.text}</span>; }
function Summary({ label, value }: { label: string; value: string | number }) { return <div className="rounded-2xl border border-gray-200 bg-white p-3 text-center"><p className="truncate text-base font-bold text-gray-900">{value}</p><p className="text-[11px] font-medium text-gray-500">{label}</p></div>; }
function Metric({ label, value, tone }: { label: string; value: string; tone?: 'blue' }) { return <div className={`rounded-xl p-2.5 ${tone === 'blue' ? 'bg-blue-50' : 'bg-slate-50'}`}><p className="text-[11px] font-medium uppercase text-gray-500">{label}</p><p className="mt-1 font-bold text-gray-900">{value}</p></div>; }
function Loading() { return <div className="flex items-center justify-center gap-2 p-10 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" />Carregando...</div>; }
function Empty({ text }: { text: string }) { return <div className="p-10 text-center text-sm text-gray-500"><ClipboardList className="mx-auto mb-2 h-7 w-7 text-gray-300" />{text}</div>; }
