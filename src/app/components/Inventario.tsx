import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ClipboardCheck,
  Clock3,
  FileSearch,
  History,
  Loader2,
  PackageCheck,
  Plus,
  Search,
  Send,
  ShieldCheck,
  X,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { usePermissions } from '../context/PermissionsContext';
import {
  approveInventoryCountItem,
  createInventorySession,
  loadInventorySession,
  loadInventorySessions,
  rejectInventoryCountItem,
  saveInventoryCounts,
  submitInventorySession,
  type InventoryCountItem,
  type InventoryCountItemStatus,
  type InventorySession,
  type InventorySessionStatus,
  type InventorySessionSummary,
} from '../services/operationsApi';

const STATUS: Record<InventorySessionStatus, { label: string; className: string }> = {
  em_contagem: { label: 'Em contagem', className: 'bg-blue-50 text-blue-700 ring-blue-100' },
  aguardando_aprovacao: { label: 'Aguardando aprovação', className: 'bg-amber-50 text-amber-800 ring-amber-100' },
  concluido: { label: 'Concluído', className: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
};

const ITEM_STATUS: Record<InventoryCountItemStatus, { label: string; className: string }> = {
  nao_contado: { label: 'Não contado', className: 'bg-slate-100 text-slate-600' },
  confere: { label: 'Confere', className: 'bg-emerald-50 text-emerald-700' },
  aguardando_aprovacao: { label: 'Aprovação pendente', className: 'bg-amber-50 text-amber-800' },
  aprovado: { label: 'Ajuste aprovado', className: 'bg-blue-50 text-blue-700' },
  recusado: { label: 'Ajuste recusado', className: 'bg-rose-50 text-rose-700' },
};

function asNumber(value: string) {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function quantity(value: number | null | undefined) {
  return Number(value ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

function dateTime(value: string | null | undefined) {
  if (!value) return '—';
  return format(new Date(value), "dd/MM/yy 'às' HH:mm", { locale: ptBR });
}

function logDescription(action: string) {
  const labels: Record<string, string> = {
    inventario_iniciado: 'Iniciou a sessão de inventário',
    contagem_enviada: 'Enviou a contagem para aprovação',
    ajuste_aprovado: 'Aprovou o ajuste de estoque',
    ajuste_recusado: 'Recusou o ajuste de estoque',
  };
  return labels[action] ?? action;
}

export default function Inventario() {
  const { isAdmin, hasPermission } = usePermissions();
  const canCreate = hasPermission('inventario', 'create');
  const canEdit = hasPermission('inventario', 'edit');
  const [sessions, setSessions] = useState<InventorySessionSummary[]>([]);
  const [activeSession, setActiveSession] = useState<InventorySession | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [query, setQuery] = useState('');
  const [onlyDivergences, setOnlyDivergences] = useState(false);
  const [physicalValues, setPhysicalValues] = useState<Record<string, string>>({});
  const [physicalPiecesValues, setPhysicalPiecesValues] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  const refreshSessions = async () => {
    setLoading(true);
    try {
      setSessions(await loadInventorySessions());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível carregar os inventários.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshSessions();
  }, []);

  const openSession = async (id: string) => {
    setWorking(true);
    try {
      const session = await loadInventorySession(id);
      setActiveSession(session);
      setPhysicalValues(Object.fromEntries(session.items.map((item) => [item.id, item.counted_quantity == null ? '' : String(item.counted_quantity)])));
      setPhysicalPiecesValues(Object.fromEntries(session.items.map((item) => [item.id, item.counted_pieces == null ? '' : String(item.counted_pieces)])));
      setNotes(Object.fromEntries(session.items.map((item) => [item.id, item.notes ?? ''])));
      setQuery('');
      setOnlyDivergences(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível abrir o inventário.');
    } finally {
      setWorking(false);
    }
  };

  const startSession = async () => {
    setWorking(true);
    try {
      const session = await createInventorySession();
      setActiveSession(session);
      setPhysicalValues({});
      setPhysicalPiecesValues({});
      setNotes({});
      await refreshSessions();
      toast.success('Inventário iniciado. Informe as quantidades físicas.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível iniciar o inventário.');
    } finally {
      setWorking(false);
    }
  };

  const buildPayload = () => {
    if (!activeSession) return [];
    return activeSession.items
      .filter((item) => physicalValues[item.id] !== '')
      .map((item) => ({
        id: item.id,
        countedQuantity: asNumber(physicalValues[item.id]),
        countedPieces: item.tracks_pieces ? asNumber(physicalPiecesValues[item.id]) : undefined,
        notes: notes[item.id],
      }))
      .filter((item): item is { id: string; countedQuantity: number; countedPieces?: number; notes?: string } => item.countedQuantity !== null && (!item.countedPieces || item.countedPieces !== null));
  };

  const saveDraft = async () => {
    if (!activeSession) return;
    const payload = buildPayload();
    if (!payload.length) {
      toast.info('Informe pelo menos uma quantidade para salvar.');
      return;
    }
    setWorking(true);
    try {
      const session = await saveInventoryCounts(activeSession.id, payload);
      setActiveSession(session);
      toast.success('Contagem salva. Você pode continuar depois.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar a contagem.');
    } finally {
      setWorking(false);
    }
  };

  const submit = async () => {
    if (!activeSession) return;
    const invalidValue = activeSession.items.some((item) => {
      const q = asNumber(physicalValues[item.id] ?? '');
      const p = item.tracks_pieces ? asNumber(physicalPiecesValues[item.id] ?? '') : null;
      return q === null || (item.tracks_pieces && p === null);
    });
    if (invalidValue) {
      toast.error('Informe uma quantidade física válida (peso e peças se aplicável) para todos os itens antes de enviar.');
      return;
    }
    setWorking(true);
    try {
      const session = await submitInventorySession(activeSession.id, buildPayload());
      setActiveSession(session);
      await refreshSessions();
      const pending = session.items.filter((item) => item.status === 'aguardando_aprovacao').length;
      toast.success(pending ? `${pending} ajuste(s) enviado(s) para aprovação.` : 'Contagem concluída sem divergências.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível enviar a contagem.');
    } finally {
      setWorking(false);
    }
  };

  const reviewItem = async (item: InventoryCountItem, decision: 'approve' | 'reject') => {
    if (!activeSession) return;
    setWorking(true);
    try {
      const note = reviewNotes[item.id];
      const result = decision === 'approve'
        ? await approveInventoryCountItem(activeSession.id, item.id, note)
        : await rejectInventoryCountItem(activeSession.id, item.id, note);
      setActiveSession(decision === 'approve' ? result.session : result);
      await refreshSessions();
      toast.success(decision === 'approve' ? 'Ajuste aprovado e saldo atualizado.' : 'Ajuste recusado. O saldo não foi alterado.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível concluir a análise.');
    } finally {
      setWorking(false);
    }
  };

  const visibleItems = useMemo(() => {
    if (!activeSession) return [];
    const normalized = query.trim().toLocaleLowerCase('pt-BR');
    return activeSession.items.filter((item) => {
      const matchesSearch = !normalized || [item.product_name, item.product_code, item.lot_code, item.lot_type]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase('pt-BR').includes(normalized));
      const hasDifference = activeSession.status === 'em_contagem'
        ? (() => {
          const value = asNumber(physicalValues[item.id] ?? '');
          const diffQuantity = value !== null && value !== item.system_quantity;
          if (item.tracks_pieces) {
            const pieces = asNumber(physicalPiecesValues[item.id] ?? '');
            return diffQuantity || (pieces !== null && pieces !== (item.system_pieces ?? 0));
          }
          return diffQuantity;
        })()
        : Number(item.difference_quantity) !== 0 || (item.tracks_pieces && Number(item.difference_pieces) !== 0);
      return matchesSearch && (!onlyDivergences || hasDifference);
    });
  }, [activeSession, onlyDivergences, physicalValues, query]);

  const counted = activeSession?.items.filter((item) => asNumber(physicalValues[item.id] ?? '') !== null && (!item.tracks_pieces || asNumber(physicalPiecesValues[item.id] ?? '') !== null)).length ?? 0;
  const discrepancies = activeSession?.items.filter((item) => {
    if (activeSession.status === 'em_contagem') {
      const q = asNumber(physicalValues[item.id] ?? '');
      const p = item.tracks_pieces ? asNumber(physicalPiecesValues[item.id] ?? '') : null;
      return (q !== null && q !== undefined && Number(q) !== Number(item.system_quantity)) ||
             (item.tracks_pieces && p !== null && p !== undefined && Number(p) !== Number(item.system_pieces ?? 0));
    } else {
      return (item.counted_quantity !== null && item.counted_quantity !== undefined && Number(item.counted_quantity) !== Number(item.system_quantity)) ||
             (item.tracks_pieces && item.counted_pieces !== null && item.counted_pieces !== undefined && Number(item.counted_pieces) !== Number(item.system_pieces ?? 0));
    }
  }).length ?? 0;

  if (activeSession) {
    const editable = activeSession.status === 'em_contagem' && (canCreate || canEdit);
    const sessionStatus = STATUS[activeSession.status];
    return (
      <div className="mx-auto max-w-6xl space-y-4 pb-24 sm:space-y-6">
        <div className="flex items-start gap-3">
          <button onClick={() => { setActiveSession(null); void refreshSessions(); }} className="mt-0.5 rounded-xl p-2 text-gray-600 hover:bg-gray-100" aria-label="Voltar para inventários">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-bold text-gray-900 sm:text-2xl">{activeSession.title}</h1>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${sessionStatus.className}`}>{sessionStatus.label}</span>
            </div>
            <p className="mt-1 text-sm text-gray-500">Iniciado por {activeSession.created_by_name} · {dateTime(activeSession.started_at)}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <Stat label="Itens" value={activeSession.items.length} />
          <Stat label={editable ? 'Contados' : 'Divergências'} value={editable ? counted : discrepancies} tone={editable ? 'blue' : discrepancies ? 'amber' : 'green'} />
          <Stat label={editable ? 'Diferenças' : 'Pendentes'} value={editable ? discrepancies : activeSession.items.filter((i) => i.status === 'aguardando_aprovacao').length} tone={discrepancies ? 'amber' : 'green'} />
        </div>

        {editable && (
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900 sm:p-4">
            <strong>Como contar:</strong> confira o lote no físico e informe a quantidade encontrada. Divergências só alterarão o estoque após a aprovação do administrador.
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative block flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar produto ou lote" className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-3 text-sm outline-none ring-blue-500 focus:ring-2" />
          </label>
          <button onClick={() => setOnlyDivergences((value) => !value)} className={`h-11 rounded-xl border px-4 text-sm font-medium ${onlyDivergences ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-gray-200 bg-white text-gray-600'}`}>
            {onlyDivergences ? 'Mostrando divergências' : 'Filtrar divergências'}
          </button>
        </div>

        <div className="space-y-3">
          {visibleItems.map((item) => (
            <InventoryItemCard
              key={item.id}
              item={item}
              editable={editable}
              physicalValue={physicalValues[item.id] ?? ''}
              physicalPiecesValue={physicalPiecesValues[item.id] ?? ''}
              note={notes[item.id] ?? ''}
              reviewNote={reviewNotes[item.id] ?? ''}
              showReview={isAdmin && item.status === 'aguardando_aprovacao'}
              disabled={working}
              onPhysicalChange={(value) => setPhysicalValues((current) => ({ ...current, [item.id]: value }))}
              onPhysicalPiecesChange={(value) => setPhysicalPiecesValues((current) => ({ ...current, [item.id]: value }))}
              onNoteChange={(value) => setNotes((current) => ({ ...current, [item.id]: value }))}
              onReviewNoteChange={(value) => setReviewNotes((current) => ({ ...current, [item.id]: value }))}
              onApprove={() => void reviewItem(item, 'approve')}
              onReject={() => void reviewItem(item, 'reject')}
            />
          ))}
          {!visibleItems.length && <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-500">Nenhum item encontrado com esse filtro.</div>}
        </div>

        {isAdmin && activeSession.logs.length > 0 && (
          <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
            <div className="mb-4 flex items-center gap-2"><History className="h-5 w-5 text-blue-600" /><h2 className="font-bold text-gray-900">Rastreio da operação</h2></div>
            <div className="space-y-4">
              {activeSession.logs.map((log) => (
                <div key={log.id} className="flex gap-3 text-sm">
                  <div className="mt-1 h-2.5 w-2.5 flex-none rounded-full bg-blue-500" />
                  <div><p className="font-medium text-gray-800">{log.actor_name} · {logDescription(log.action)}</p><p className="text-xs text-gray-500">{dateTime(log.created_at)}</p></div>
                </div>
              ))}
            </div>
          </section>
        )}

        {editable && (
          <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-gray-200 bg-white/95 p-3 backdrop-blur md:left-64">
            <div className="mx-auto flex max-w-6xl gap-2">
              <button onClick={() => void saveDraft()} disabled={working} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700 disabled:opacity-50"><ClipboardCheck className="h-4 w-4" />Salvar</button>
              <button onClick={() => void submit()} disabled={working} className="flex h-12 flex-[1.35] items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-semibold text-white shadow-sm disabled:opacity-50"><Send className="h-4 w-4" />{working ? 'Enviando...' : 'Enviar para aprovação'}</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const pending = sessions.reduce((total, session) => total + session.pending_items, 0);
  return (
    <div className="mx-auto max-w-6xl space-y-5 sm:space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white"><PackageCheck className="h-6 w-6" /></div>
          <h1 className="text-2xl font-bold text-gray-900">Inventário</h1>
          <p className="mt-1 text-sm text-gray-600">Conte o físico, compare com o sistema e envie divergências para validação.</p>
        </div>
        {canCreate && <button onClick={() => void startSession()} disabled={working} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"><Plus className="h-4 w-4" />Novo inventário</button>}
      </div>

      {isAdmin && pending > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950"><Clock3 className="mt-0.5 h-5 w-5 flex-none text-amber-700" /><div><p className="font-semibold">{pending} ajuste(s) aguardando sua aprovação</p><p className="mt-0.5 text-sm text-amber-800">Abra uma sessão pendente para revisar as quantidades e registrar sua decisão.</p></div></div>
      )}

      <section className="rounded-2xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 p-4 sm:p-5"><div><h2 className="font-bold text-gray-900">Sessões de inventário</h2><p className="text-sm text-gray-500">Seu histórico de contagens e ajustes</p></div><button onClick={() => void refreshSessions()} className="text-sm font-medium text-blue-600 hover:text-blue-700">Atualizar</button></div>
        {loading ? <div className="flex items-center justify-center gap-2 p-10 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" />Carregando inventários...</div> : sessions.length ? (
          <div className="divide-y divide-gray-100">
            {sessions.map((session) => {
              const status = STATUS[session.status];
              return <button key={session.id} onClick={() => void openSession(session.id)} disabled={working} className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-gray-50 sm:p-5">
                <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-slate-100 text-slate-600"><FileSearch className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate font-semibold text-gray-900">{session.title}</p><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${status.className}`}>{status.label}</span></div><p className="mt-1 text-xs text-gray-500">{session.created_by_name} · {dateTime(session.started_at)} · {session.total_items} itens</p></div>
                {session.pending_items > 0 && <span className="rounded-lg bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800">{session.pending_items} pend.</span>}
              </button>;
            })}
          </div>
        ) : <div className="p-10 text-center"><ClipboardCheck className="mx-auto mb-3 h-8 w-8 text-gray-300" /><p className="font-medium text-gray-700">Nenhum inventário iniciado</p><p className="mt-1 text-sm text-gray-500">Comece uma contagem para comparar o estoque físico ao sistema.</p></div>}
      </section>
    </div>
  );
}

function Stat({ label, value, tone = 'slate' }: { label: string; value: number; tone?: 'slate' | 'blue' | 'amber' | 'green' }) {
  const colors = { slate: 'border-gray-200 bg-white', blue: 'border-blue-100 bg-blue-50', amber: 'border-amber-100 bg-amber-50', green: 'border-emerald-100 bg-emerald-50' };
  return <div className={`rounded-2xl border p-3 text-center sm:p-4 ${colors[tone]}`}><p className="text-lg font-bold text-gray-900 sm:text-xl">{value}</p><p className="mt-0.5 text-[11px] font-medium text-gray-500 sm:text-xs">{label}</p></div>;
}

function InventoryItemCard({ item, editable, physicalValue, physicalPiecesValue, note, reviewNote, showReview, disabled, onPhysicalChange, onPhysicalPiecesChange, onNoteChange, onReviewNoteChange, onApprove, onReject }: {
  item: InventoryCountItem;
  editable: boolean;
  physicalValue: string;
  physicalPiecesValue?: string;
  note: string;
  reviewNote: string;
  showReview: boolean;
  disabled: boolean;
  onPhysicalChange: (value: string) => void;
  onPhysicalPiecesChange?: (value: string) => void;
  onNoteChange: (value: string) => void;
  onReviewNoteChange: (value: string) => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const shownPhysical = editable ? asNumber(physicalValue) : item.counted_quantity;
  const difference = shownPhysical === null || shownPhysical === undefined ? null : Number(shownPhysical) - Number(item.system_quantity);
  const shownPieces = editable ? (physicalPiecesValue ? asNumber(physicalPiecesValue) : null) : item.counted_pieces;
  const differencePieces = !item.tracks_pieces || shownPieces === null || shownPieces === undefined ? null : Number(shownPieces) - Number(item.system_pieces ?? 0);
  const hasDifference = (difference !== null && difference !== 0) || (item.tracks_pieces && differencePieces !== null && differencePieces !== 0);
  const status = ITEM_STATUS[item.status];
  return <article className={`rounded-2xl border bg-white p-4 shadow-sm ${hasDifference ? 'border-amber-200' : 'border-gray-200'}`}>
    <div className="flex gap-3">
      <div className={`flex h-10 w-10 flex-none items-center justify-center rounded-xl ${item.lot_type === 'Insumo' ? 'bg-violet-50 text-violet-700' : 'bg-blue-50 text-blue-700'}`}><PackageCheck className="h-5 w-5" /></div>
      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="truncate font-semibold text-gray-900">{item.product_name}</p><p className="mt-0.5 text-xs text-gray-500">{item.lot_type} · Lote {item.lot_code}{item.product_code ? ` · ${item.product_code}` : ''}</p></div>{!editable && <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${status.className}`}>{status.label}</span>}</div>
        <div className={`mt-4 grid gap-2 sm:max-w-md ${item.tracks_pieces ? 'grid-cols-2' : 'grid-cols-2'}`}>
          <div className="rounded-xl bg-slate-50 p-2.5 space-y-2">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Sistema</p>
              <p className="mt-1 font-bold text-gray-900">{quantity(item.system_quantity)} <span className="text-xs font-medium text-gray-500">{item.unit_symbol ?? 'un.'}</span></p>
            </div>
            {item.tracks_pieces && (
              <div className="pt-2 border-t border-gray-200">
                <p className="font-bold text-gray-900">{quantity(item.system_pieces)} <span className="text-xs font-medium text-gray-500">peças</span></p>
              </div>
            )}
          </div>
          <div className={`rounded-xl p-2.5 space-y-2 ${editable ? 'border border-blue-200 bg-blue-50' : hasDifference ? 'bg-amber-50' : 'bg-emerald-50'}`}>
            <div>
              <p className={`text-[11px] font-medium uppercase tracking-wide ${editable ? 'text-blue-700' : hasDifference ? 'text-amber-700' : 'text-emerald-700'}`}>Físico</p>
              {editable ? <input aria-label={`Quantidade física de ${item.product_name}`} inputMode="decimal" value={physicalValue} onChange={(event) => onPhysicalChange(event.target.value)} placeholder="0" className="mt-1 w-full bg-transparent font-bold text-gray-900 outline-none placeholder:text-blue-300" /> : <p className="mt-1 font-bold text-gray-900">{item.counted_quantity == null ? '—' : quantity(item.counted_quantity)} {item.counted_quantity != null && <span className="text-xs font-medium text-gray-500">{item.unit_symbol ?? 'un.'}</span>}</p>}
            </div>
            {item.tracks_pieces && (
              <div className={`pt-2 border-t ${editable ? 'border-blue-200' : hasDifference ? 'border-amber-200' : 'border-emerald-200'}`}>
                {editable ? <input aria-label={`Peças físicas de ${item.product_name}`} inputMode="numeric" value={physicalPiecesValue} onChange={(event) => onPhysicalPiecesChange && onPhysicalPiecesChange(event.target.value)} placeholder="0 peças" className="w-full bg-transparent font-bold text-gray-900 outline-none placeholder:text-blue-300" /> : <p className="font-bold text-gray-900">{item.counted_pieces == null ? '—' : quantity(item.counted_pieces)} {item.counted_pieces != null && <span className="text-xs font-medium text-gray-500">peças</span>}</p>}
              </div>
            )}
          </div>
        </div>
        {(difference !== null || differencePieces !== null) && <p className={`mt-3 text-sm font-medium ${hasDifference ? 'text-amber-800' : 'text-emerald-700'}`}>{hasDifference ? `Diferença: ${difference !== null && difference !== 0 ? (difference > 0 ? '+' : '') + quantity(difference) + ' ' + (item.unit_symbol ?? 'un.') : ''} ${differencePieces !== null && differencePieces !== 0 ? (differencePieces > 0 ? '+' : '') + quantity(differencePieces) + ' peças' : ''}` : <><Check className="mr-1 inline h-4 w-4" />Quantidade e peças conferem</>}</p>}
        {editable && <input value={note} onChange={(event) => onNoteChange(event.target.value)} placeholder="Observação (opcional)" className="mt-3 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none ring-blue-500 focus:ring-2" />}
        {!editable && item.review_note && <p className="mt-3 rounded-lg bg-slate-50 p-2 text-xs text-gray-600">{item.status === 'recusado' ? 'Motivo da recusa' : 'Observação do administrador'}: {item.review_note}</p>}
      </div>
    </div>
    {showReview && <div className="mt-4 border-t border-gray-100 pt-3"><input value={reviewNote} onChange={(event) => onReviewNoteChange(event.target.value)} placeholder="Observação da decisão (opcional)" className="mb-2 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none ring-blue-500 focus:ring-2" /><div className="flex gap-2"><button disabled={disabled} onClick={onReject} className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-rose-200 text-sm font-semibold text-rose-700 disabled:opacity-50"><X className="h-4 w-4" />Recusar</button><button disabled={disabled} onClick={onApprove} className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 text-sm font-semibold text-white disabled:opacity-50"><ShieldCheck className="h-4 w-4" />Aprovar ajuste</button></div></div>}
  </article>;
}
