import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { differenceInDays, format, startOfDay } from 'date-fns';
import { AlertTriangle, Award, DollarSign, Loader2, PackageSearch, Search, TrendingUp, Trash2, Pencil, X, ShieldCheck } from 'lucide-react';
import type { AnaliseLaboral, EstoqueProduto, LoteLeite, PrecificacaoLeite } from '../data/mockData';
import { useCadastros } from '../context/CadastrosContext';
import {
 loadFinishedProductLots,
 loadMilkAnalyses,
 loadMilkLotDetail,
 loadMilkLots,
 loadMilkPricings,
 loadSupplyLots,
 deleteSupplyLot,
 deleteFinishedProductLot,
 adjustSupplyLotStock,
 createManualProductExit,
 loadExpiredLotDisposals,
 createExpiredLotDisposal,
 reviewExpiredLotDisposal,
 type MilkLotDetail,
 type SupplyLotInventoryItem,
 type ExpiredLotDisposal,
} from '../services/operationsApi';
import { usePermissions } from '../context/PermissionsContext';
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';

type SummaryDetail =
 | { kind: 'supply'; itemId: string }
 | { kind: 'product'; productId: string };

function getErrorMessage(error: unknown) {
 if (error instanceof Error) {
 return error.message;
 }

 return 'Nao foi possivel carregar os dados de estoque.';
}

export default function LotesEstoqueDetalhado() {
 const [selectedTab, setSelectedTab] = useState<'resumo' | 'leite' | 'insumos' | 'produtos'>('resumo');
 const [stockSearch, setStockSearch] = useState('');
 const [selectedLoteId, setSelectedLoteId] = useState<string | null>(null);
 const [lotes, setLotes] = useState<LoteLeite[]>([]);
 const [estoquesProdutos, setEstoquesProdutos] = useState<EstoqueProduto[]>([]);
 const [analises, setAnalises] = useState<AnaliseLaboral[]>([]);
 const [precificacoes, setPrecificacoes] = useState<PrecificacaoLeite[]>([]);
 const [supplyLots, setSupplyLots] = useState<SupplyLotInventoryItem[]>([]);
 const [selectedLoteDetail, setSelectedLoteDetail] = useState<MilkLotDetail | null>(null);
 const [loading, setLoading] = useState(true);
 const [detailLoading, setDetailLoading] = useState(false);
 const [errorMessage, setErrorMessage] = useState<string | null>(null);
 const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
 const [itemToDelete, setItemToDelete] = useState<string | null>(null);
 const [deleteType, setDeleteType] = useState<'supply' | 'product' | null>(null);
 const [isDeleting, setIsDeleting] = useState(false);
 const [editingLotId, setEditingLotId] = useState<string | null>(null);
 const [editLotQuantity, setEditLotQuantity] = useState<string>('');
 const [isEditingLot, setIsEditingLot] = useState(false);
 const [exitModalOpen, setExitModalOpen] = useState(false);
 const [exitLotId, setExitLotId] = useState<string | null>(null);
 const [exitQuantity, setExitQuantity] = useState('');
 const [exitPieces, setExitPieces] = useState('');
 const [exitReason, setExitReason] = useState('Doação');
 const [exitNotes, setExitNotes] = useState('');
 const [isExiting, setIsExiting] = useState(false);
 const [disposals, setDisposals] = useState<ExpiredLotDisposal[]>([]);
 const [disposalLot, setDisposalLot] = useState<{ id: string; type: 'Insumo' | 'Produto Acabado'; name: string; code: string; quantity: number; unit: string } | null>(null);
 const [disposalQuantity, setDisposalQuantity] = useState('');
 const [disposalDestination, setDisposalDestination] = useState<'repasse_custo' | 'doacao_dre'>('repasse_custo');
 const [disposalJustification, setDisposalJustification] = useState('');
 const [disposalNotes, setDisposalNotes] = useState('');
 const [isSubmittingDisposal, setIsSubmittingDisposal] = useState(false);
 const [reviewingDisposalId, setReviewingDisposalId] = useState<string | null>(null);
 const [summaryDetail, setSummaryDetail] = useState<SummaryDetail | null>(null);
 const { hasPermission } = usePermissions();
 const canApproveDisposals = hasPermission('inventario', 'authorize');
 const {
 producers,
 supplyItems,
 getProducerById,
 getSupplierById,
 getSupplyItemById,
 getFinishedProductById,
 getUnitSymbol,
 } = useCadastros();

 const loadData = async () => {
 setLoading(true);
 setErrorMessage(null);

 try {
 const [nextLotes, nextEstoquesProdutos, nextAnalises, nextPrecificacoes, nextSupplyLots, nextDisposals] =
 await Promise.all([
 loadMilkLots(),
 loadFinishedProductLots(),
 loadMilkAnalyses(),
 loadMilkPricings(),
 loadSupplyLots(),
 loadExpiredLotDisposals(),
 ]);

 setLotes(nextLotes);
 setEstoquesProdutos(nextEstoquesProdutos);
 setAnalises(nextAnalises);
 setPrecificacoes(nextPrecificacoes);
 setSupplyLots(nextSupplyLots);
 setDisposals(nextDisposals);
 } catch (error) {
 setErrorMessage(getErrorMessage(error));
 } finally {
 setLoading(false);
 }
 };

 useEffect(() => {
 void loadData();
 }, []);

 useEffect(() => {
 if (!selectedLoteId) {
 setSelectedLoteDetail(null);
 return;
 }

 let active = true;
 setDetailLoading(true);

 void loadMilkLotDetail(selectedLoteId)
 .then((detail) => {
 if (active) {
 setSelectedLoteDetail(detail);
 }
 })
 .catch((error) => {
 if (active) {
 setSelectedLoteDetail(null);
 setErrorMessage(getErrorMessage(error));
 }
 })
 .finally(() => {
 if (active) {
 setDetailLoading(false);
 }
 });

 return () => {
 active = false;
 };
 }, [selectedLoteId]);

 const handleDelete = async () => {
    if (!itemToDelete || !deleteType) return;
    setIsDeleting(true);
    setErrorMessage(null);

    try {
      if (deleteType === 'supply') {
        await deleteSupplyLot(itemToDelete);
        setSupplyLots((current) => current.filter((l) => l.id !== itemToDelete));
      } else if (deleteType === 'product') {
        await deleteFinishedProductLot(itemToDelete);
        setEstoquesProdutos((current) => current.filter((l) => l.id !== itemToDelete));
      }
      setDeleteConfirmOpen(false);
      setItemToDelete(null);
    } catch (error) {
      setDeleteConfirmOpen(false);
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsDeleting(false);
    }
  };

  const openDisposal = (lot: { id: string; type: 'Insumo' | 'Produto Acabado'; name: string; code: string; quantity: number; unit: string }) => {
    setDisposalLot(lot); setDisposalQuantity(String(lot.quantity)); setDisposalDestination('repasse_custo'); setDisposalJustification(''); setDisposalNotes('');
  };
  const submitDisposal = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!disposalLot || !disposalJustification.trim() || Number(disposalQuantity) <= 0) return;
    setIsSubmittingDisposal(true); setErrorMessage(null);
    try {
      await createExpiredLotDisposal({ lotType: disposalLot.type, lotId: disposalLot.id, quantity: Number(disposalQuantity), destination: disposalDestination, justification: disposalJustification, notes: disposalNotes || undefined });
      setDisposalLot(null); await loadData();
    } catch (error) { setErrorMessage(getErrorMessage(error)); }
    finally { setIsSubmittingDisposal(false); }
  };
  const reviewDisposal = async (id: string, decision: 'aprovada' | 'recusada') => {
    const note = decision === 'recusada' ? window.prompt('Informe o motivo da recusa (opcional):') || undefined : undefined;
    setReviewingDisposalId(id); setErrorMessage(null);
    try { await reviewExpiredLotDisposal(id, { decision, reviewNote: note }); await loadData(); }
    catch (error) { setErrorMessage(getErrorMessage(error)); }
    finally { setReviewingDisposalId(null); }
  };

  const handleEditLotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLotId || !editLotQuantity) return;
    
    setIsEditingLot(true);
    setErrorMessage(null);

    const lotToEdit = supplyLots.find(l => l.id === editingLotId);
    if (!lotToEdit) return;

    try {
      const newQuantity = Number(editLotQuantity);
      await adjustSupplyLotStock(editingLotId, newQuantity, lotToEdit.availableQuantity, lotToEdit.receivedQuantity);
      setEditingLotId(null);
      setEditLotQuantity('');
      await loadData();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsEditingLot(false);
    }
  };

  const handleExitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exitLotId || !exitQuantity) return;

    setIsExiting(true);
    setErrorMessage(null);

    try {
      await createManualProductExit({
        finishedProductLotId: exitLotId,
        quantity: Number(exitQuantity),
        pieces: exitPieces ? Number(exitPieces) : undefined,
        reason: exitReason,
        notes: exitNotes,
      });

      setExitModalOpen(false);
      setExitLotId(null);
      setExitQuantity('');
      setExitPieces('');
      setExitReason('Doação');
      setExitNotes('');
      await loadData();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsExiting(false);
    }
  };

 const getAnaliseByLoteId = (loteId: string) => analises.find((analise) => analise.loteId === loteId);
 const getPrecificacaoByLoteId = (loteId: string) =>
 precificacoes.find((precificacao) => precificacao.loteId === loteId);

 const selectedLote = selectedLoteDetail?.lot || lotes.find((lote) => lote.id === selectedLoteId) || null;
 const selectedAnalise =
 selectedLoteDetail?.analysis || (selectedLote ? getAnaliseByLoteId(selectedLote.id) : null);
 const selectedPrecificacao =
 selectedLoteDetail?.pricing || (selectedLote ? getPrecificacaoByLoteId(selectedLote.id) : null);

 const supplyItemSummaries = useMemo(() => {
 return supplyItems.map((item) => {
 const lotRows = supplyLots.filter((lot) => lot.supplyItemId === item.id);
 const totalAvailableFromLots = lotRows.reduce((sum, lot) => sum + lot.availableQuantity, 0);
 const currentStock = lotRows.length > 0 ? totalAvailableFromLots : item.currentStock;

 return {
 item,
 currentStock,
 };
 });
 }, [supplyItems, supplyLots]);

 const finishedProductSummaries = useMemo(() => {
 const summaries = new Map<string, {
 productId: string;
 productName: string;
 unitSymbol: string;
 availableQuantity: number;
 producedQuantity: number;
 returnedQuantity: number;
 lotsCount: number;
 nextExpiration?: Date;
 }>();

 estoquesProdutos.forEach((lot) => {
 const product = getFinishedProductById(lot.produtoId);
 const current = summaries.get(lot.produtoId) || {
 productId: lot.produtoId,
 productName: product?.name || 'Produto não identificado',
 unitSymbol: getUnitSymbol(product?.unitId),
 availableQuantity: 0,
 producedQuantity: 0,
 returnedQuantity: 0,
 lotsCount: 0,
 };
 const shouldUpdateExpiration = lot.disponivel > 0 &&
 (!current.nextExpiration || lot.dataValidade < current.nextExpiration);

 summaries.set(lot.produtoId, {
 ...current,
 availableQuantity: current.availableQuantity + lot.disponivel,
 producedQuantity: current.producedQuantity + lot.quantidade,
 returnedQuantity: current.returnedQuantity + (lot.devolvido || 0),
 lotsCount: current.lotsCount + 1,
 nextExpiration: shouldUpdateExpiration ? lot.dataValidade : current.nextExpiration,
 });
 });

 return Array.from(summaries.values()).sort((a, b) => a.productName.localeCompare(b.productName, 'pt-BR'));
 }, [estoquesProdutos, getFinishedProductById, getUnitSymbol]);

 const normalizedStockSearch = stockSearch.trim().toLocaleLowerCase('pt-BR');
 const filteredSupplyItemSummaries = useMemo(
 () => supplyItemSummaries.filter(({ item }) =>
 !normalizedStockSearch || item.name.toLocaleLowerCase('pt-BR').includes(normalizedStockSearch) ||
 item.code.toLocaleLowerCase('pt-BR').includes(normalizedStockSearch),
 ),
 [supplyItemSummaries, normalizedStockSearch],
 );
 const filteredFinishedProductSummaries = useMemo(
 () => finishedProductSummaries.filter((item) =>
 !normalizedStockSearch || item.productName.toLocaleLowerCase('pt-BR').includes(normalizedStockSearch),
 ),
 [finishedProductSummaries, normalizedStockSearch],
 );

 const insumosAbaixoMinimo = useMemo(
 () =>
 supplyItemSummaries.filter(({ item, currentStock }) => currentStock < item.minimumStock),
 [supplyItemSummaries],
 );
 const supplyLotsWithBalance = supplyLots.filter((lot) => lot.availableQuantity > 0).length;
 const finishedProductLotsWithBalance = estoquesProdutos.filter((lot) => lot.disponivel > 0).length;
 const selectedSupplyItem = summaryDetail?.kind === 'supply'
 ? supplyItems.find((item) => item.id === summaryDetail.itemId)
 : undefined;
 const selectedProduct = summaryDetail?.kind === 'product'
 ? getFinishedProductById(summaryDetail.productId)
 : undefined;
 const selectedSupplyLots = selectedSupplyItem
 ? supplyLots.filter((lot) => lot.supplyItemId === selectedSupplyItem.id)
 .sort((a, b) => (a.expirationDate?.getTime() ?? Infinity) - (b.expirationDate?.getTime() ?? Infinity))
 : [];
 const selectedProductLots = selectedProduct
 ? estoquesProdutos.filter((lot) => lot.produtoId === selectedProduct.id)
 .sort((a, b) => a.dataValidade.getTime() - b.dataValidade.getTime())
 : [];
 const selectedSupplyAvailableQuantity = selectedSupplyItem
 ? selectedSupplyLots.length > 0
 ? selectedSupplyLots.reduce((sum, lot) => sum + lot.availableQuantity, 0)
 : selectedSupplyItem.currentStock
 : 0;
 const selectedProductSellableQuantity = selectedProductLots
 .filter((lot) => lot.disponivel > 0 && lot.dataValidade >= startOfDay(new Date()))
 .reduce((sum, lot) => sum + lot.disponivel, 0);

 const lotesComAnalise = lotes.filter((lote) => lote.analiseId);
 const mediaGordura =
 lotesComAnalise.length > 0
 ? lotesComAnalise.reduce((sum, lote) => sum + (getAnaliseByLoteId(lote.id)?.gordura || 0), 0) /
 lotesComAnalise.length
 : 0;
 const mediaProteina =
 lotesComAnalise.length > 0
 ? lotesComAnalise.reduce((sum, lote) => sum + (getAnaliseByLoteId(lote.id)?.proteina || 0), 0) /
 lotesComAnalise.length
 : 0;
 const lotesComCusto = lotes.filter((lote) => lote.custoLitro != null);
 const custoMedioLitro =
 lotesComCusto.length > 0
 ? lotesComCusto.reduce((sum, lote) => sum + (lote.custoLitro || 0), 0) / lotesComCusto.length
 : 0;

 const rankingProdutores = producers
 .map((producer) => {
 const producerLotes = lotes.filter((lote) => lote.produtorId === producer.id && lote.analiseId);
 const producerAnalyses = producerLotes
 .map((lote) => getAnaliseByLoteId(lote.id))
 .filter(Boolean) as AnaliseLaboral[];
 const producerPricings = producerLotes
 .map((lote) => getPrecificacaoByLoteId(lote.id))
 .filter(Boolean) as PrecificacaoLeite[];
 const totalVolume = producerLotes.reduce((sum, lote) => sum + lote.volumeLitros, 0);
 const averageFat =
 producerAnalyses.length > 0
 ? producerAnalyses.reduce((sum, analysis) => sum + (analysis.gordura || 0), 0) /
 producerAnalyses.length
 : 0;
 const averageProtein =
 producerAnalyses.length > 0
 ? producerAnalyses.reduce((sum, analysis) => sum + (analysis.proteina || 0), 0) /
 producerAnalyses.length
 : 0;
 const averagePrice =
 producerPricings.length > 0
 ? producerPricings.reduce((sum, row) => sum + row.precoFinal, 0) / producerPricings.length
 : 0;
 const totalValue = producerPricings.reduce((sum, row) => sum + row.valorTotal, 0);

 return {
 producer,
 totalVolume,
 averageFat,
 averageProtein,
 averagePrice,
 totalValue,
 score: averageFat * 0.5 + averageProtein * 0.5,
 };
 })
 .filter((item) => item.totalVolume > 0)
 .sort((a, b) => b.score - a.score);

  const sortedLotes = useMemo(() => {
    return [...lotes].sort((a, b) => {
      const getTimestamp = (codigo: string) => {
        const parts = codigo.split('-');
        return parts.length >= 3 ? parseInt(parts[2], 10) : 0;
      };
      return getTimestamp(b.codigo) - getTimestamp(a.codigo);
    });
  }, [lotes]);

 return (
 <div className="space-y-6">
 <div className="flex items-start justify-between gap-4">
 <div>
 <h2 className="text-2xl font-bold text-gray-900">Lotes e estoque</h2>
 <p className="text-gray-600">Rastreabilidade de leite cru, insumos e produtos acabados</p>
 </div>
 <button
 onClick={() => void loadData()}
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

 <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
 <div className="flex border-b border-gray-200">
 {[
 { key: 'resumo', label: 'Resumo do estoque' },
 { key: 'leite', label: 'Lotes de leite cru' },
 { key: 'insumos', label: 'Lotes de insumos' },
 { key: 'produtos', label: 'Produtos acabados' },
 ].map((tab) => (
 <button
 key={tab.key}
 onClick={() => setSelectedTab(tab.key as typeof selectedTab)}
 className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
 selectedTab === tab.key
 ? 'border-b-2 border-blue-600 bg-blue-50 text-blue-700'
 : 'text-gray-600 hover:bg-gray-50'
 }`}
 >
 {tab.label}
 </button>
 ))}
 </div>

 {!loading && disposals.filter((item) => item.status === 'aguardando_aprovacao').length > 0 ? (
 <section className="overflow-hidden rounded-xl border border-amber-200 bg-white">
 <div className="flex items-center gap-3 border-b border-amber-100 bg-amber-50 p-4"><ShieldCheck className="h-5 w-5 text-amber-700" /><div><h3 className="font-bold text-amber-950">Autorizações de baixa por vencimento</h3><p className="text-sm text-amber-800">O estoque só será baixado depois da aprovação.</p></div></div>
 <div className="divide-y divide-gray-100">{disposals.filter((item) => item.status === 'aguardando_aprovacao').map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm"><div><p className="font-semibold text-gray-900">{item.item_name} · lote {item.lot_code}</p><p className="text-gray-600">{Number(item.quantity).toLocaleString('pt-BR')} {item.unit_symbol} · {item.destination === 'doacao_dre' ? 'Doação no DRE' : 'Repasse pelo custo'} · R$ {Number(item.total_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p><p className="mt-1 text-xs text-gray-500">Solicitado por {item.requested_by_name}: {item.justification}</p></div>{canApproveDisposals ? <div className="flex gap-2"><button disabled={reviewingDisposalId === item.id} onClick={() => void reviewDisposal(item.id, 'recusada')} className="rounded-lg border border-red-200 px-3 py-2 font-medium text-red-700">Recusar</button><button disabled={reviewingDisposalId === item.id} onClick={() => void reviewDisposal(item.id, 'aprovada')} className="rounded-lg bg-emerald-600 px-3 py-2 font-medium text-white">Aprovar baixa</button></div> : <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">Aguardando aprovação</span>}</div>)}</div>
 </section>
 ) : null}
 </div>

 {!loading && selectedTab === 'resumo' ? (
 <div className="space-y-6">
 <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
 <MetricCard
 title="Insumos cadastrados"
 value={String(supplyItemSummaries.length)}
 subtitle={`${supplyLotsWithBalance} lotes com saldo`}
 icon={<PackageSearch className="h-6 w-6 text-blue-600" />}
 />
 <MetricCard
 title="Abaixo do mínimo"
 value={String(insumosAbaixoMinimo.length)}
 subtitle={insumosAbaixoMinimo.length === 1 ? 'item requer atenção' : 'itens requerem atenção'}
 icon={<AlertTriangle className="h-6 w-6 text-amber-600" />}
 />
 <MetricCard
 title="Produtos acabados"
 value={String(finishedProductSummaries.length)}
 subtitle={`${finishedProductLotsWithBalance} lotes com saldo`}
 icon={<TrendingUp className="h-6 w-6 text-emerald-600" />}
 />
 <MetricCard
 title="Lotes em estoque"
 value={String(supplyLotsWithBalance + finishedProductLotsWithBalance)}
 subtitle="insumos e produtos acabados"
 />
 </div>

 <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
 <p className="font-semibold">Saldo consolidado por item</p>
 <p className="mt-1 text-blue-800">Cada linha reúne automaticamente o saldo disponível de todos os lotes daquele insumo ou produto. Use as abas de lotes para conferir a composição e a rastreabilidade.</p>
 </div>

 <div className="relative max-w-xl">
 <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
 <input
 value={stockSearch}
 onChange={(event) => setStockSearch(event.target.value)}
 placeholder="Buscar insumo ou produto..."
 className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
 />
 </div>

 <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
 <div className="flex items-center justify-between gap-4 border-b border-gray-200 p-4">
 <div>
 <h3 className="font-bold text-gray-900">Insumos — saldo total</h3>
 <p className="text-sm text-gray-500">Soma dos saldos disponíveis em todos os lotes</p>
 </div>
 <button onClick={() => setSelectedTab('insumos')} className="text-sm font-medium text-blue-600 hover:text-blue-800">Ver lotes</button>
 </div>
 {filteredSupplyItemSummaries.length === 0 ? (
 <div className="p-8 text-center text-sm text-gray-600">Nenhum insumo encontrado.</div>
 ) : (
 <div className="overflow-x-auto">
 <table className="w-full">
 <thead className="bg-gray-50">
 <tr>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Insumo</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Saldo total</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Estoque mínimo</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Lotes</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-gray-200">
 {filteredSupplyItemSummaries.map(({ item, currentStock }) => {
 const unitSymbol = getUnitSymbol(item.unitId);
 const lotCount = supplyLots.filter((lot) => lot.supplyItemId === item.id && lot.availableQuantity > 0).length;
 const belowMinimum = currentStock < item.minimumStock;
 return (
 <tr key={item.id} className="cursor-pointer hover:bg-blue-50" onClick={() => setSummaryDetail({ kind: 'supply', itemId: item.id })} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSummaryDetail({ kind: 'supply', itemId: item.id }); } }} tabIndex={0} role="button" aria-label={`Ver resumo e lotes de ${item.name}`}>
 <td className="px-6 py-4"><div className="font-medium text-gray-900">{item.name}</div><div className="text-xs text-gray-500">{item.code} · Clique para ver os lotes</div></td>
 <td className={`px-6 py-4 font-semibold ${belowMinimum ? 'text-red-600' : 'text-gray-900'}`}>{currentStock.toLocaleString('pt-BR')} {unitSymbol}</td>
 <td className="px-6 py-4 text-sm text-gray-600">{item.minimumStock.toLocaleString('pt-BR')} {unitSymbol}</td>
 <td className="px-6 py-4 text-sm text-gray-700">{lotCount} {lotCount === 1 ? 'lote' : 'lotes'}</td>
 <td className="px-6 py-4">{belowMinimum ? <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-800">Abaixo do mínimo</span> : <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">Normal</span>}</td>
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>
 )}
 </div>

 <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
 <div className="flex items-center justify-between gap-4 border-b border-gray-200 p-4">
 <div>
 <h3 className="font-bold text-gray-900">Produtos acabados — saldo total</h3>
 <p className="text-sm text-gray-500">Soma dos saldos disponíveis em todos os lotes</p>
 </div>
 <button onClick={() => setSelectedTab('produtos')} className="text-sm font-medium text-blue-600 hover:text-blue-800">Ver lotes</button>
 </div>
 {filteredFinishedProductSummaries.length === 0 ? (
 <div className="p-8 text-center text-sm text-gray-600">Nenhum produto acabado encontrado.</div>
 ) : (
 <div className="overflow-x-auto">
 <table className="w-full">
 <thead className="bg-gray-50">
 <tr>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Produto</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Saldo total</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Lotes</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Próxima validade</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Devolvidos</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-gray-200">
 {filteredFinishedProductSummaries.map((item) => {
 const daysToExpire = item.nextExpiration ? differenceInDays(item.nextExpiration, new Date()) : null;
 return (
 <tr key={item.productId} className="cursor-pointer hover:bg-blue-50" onClick={() => setSummaryDetail({ kind: 'product', productId: item.productId })} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSummaryDetail({ kind: 'product', productId: item.productId }); } }} tabIndex={0} role="button" aria-label={`Ver resumo e lotes de ${item.productName}`}>
 <td className="px-6 py-4 font-medium text-gray-900"><div>{item.productName}</div><div className="mt-0.5 text-xs font-normal text-blue-600">Clique para ver os lotes</div></td>
 <td className="px-6 py-4 font-semibold text-green-700">{item.availableQuantity.toLocaleString('pt-BR')} {item.unitSymbol}</td>
 <td className="px-6 py-4 text-sm text-gray-700">{item.lotsCount} {item.lotsCount === 1 ? 'lote' : 'lotes'}</td>
 <td className="px-6 py-4 text-sm">{item.nextExpiration ? <span className={daysToExpire !== null && daysToExpire < 7 ? 'font-medium text-amber-700' : 'text-gray-700'}>{format(item.nextExpiration, 'dd/MM/yyyy')}{daysToExpire !== null && daysToExpire < 7 ? ` (${daysToExpire}d)` : ''}</span> : <span className="text-gray-500">Sem saldo</span>}</td>
 <td className="px-6 py-4 text-sm text-gray-700">{item.returnedQuantity.toLocaleString('pt-BR')} {item.unitSymbol}</td>
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>
 )}
 </div>
 </div>
 ) : null}

 {insumosAbaixoMinimo.length > 0 ? (
 <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-6">
 <div className="flex items-start gap-3">
 <AlertTriangle className="mt-0.5 h-5 w-5 text-yellow-600" />
 <div className="flex-1">
 <h3 className="mb-2 font-bold text-yellow-900">Alerta de estoque minimo</h3>
 <div className="space-y-1">
 {insumosAbaixoMinimo.map(({ item, currentStock }) => (
 <p key={item.id} className="text-sm text-yellow-800">
 - {item.name}: {currentStock.toLocaleString('pt-BR')} {getUnitSymbol(item.unitId)}
 {' '} (minimo: {item.minimumStock.toLocaleString('pt-BR')} {getUnitSymbol(item.unitId)})
 </p>
 ))}
 </div>
 </div>
 </div>
 </div>
 ) : null}

 {loading ? (
 <div className="flex items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white p-10 text-sm text-gray-600">
 <Loader2 className="h-5 w-5 animate-spin" />
 Carregando rastreabilidade...
 </div>
 ) : null}

 {!loading && selectedTab === 'leite' ? (
 <div className="space-y-6">
 <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
 <MetricCard title="Gordura media" value={`${mediaGordura.toFixed(2)}%`} subtitle="Lotes com analise" />
 <MetricCard title="Proteina media" value={`${mediaProteina.toFixed(2)}%`} subtitle="Lotes com analise" />
 <MetricCard
 title="Custo medio por litro"
 value={`R$ ${custoMedioLitro.toFixed(2)}`}
 subtitle="Base de custo industrial"
 icon={<DollarSign className="h-6 w-6 text-blue-600" />}
 />
 </div>

 <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
 <div className="border-b border-gray-200 p-4">
 <h3 className="font-bold text-gray-900">Lotes de leite com qualidade e precificacao</h3>
 </div>
 {sortedLotes.length === 0 ? (
 <div className="p-8 text-center text-sm text-gray-600">Nenhum lote de leite encontrado.</div>
 ) : (
 <div className="overflow-x-auto">
 <table className="w-full">
 <thead className="bg-gray-50">
 <tr>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Lote</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Produtor</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Volume</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Gordura</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Proteina</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Custo/L</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Acoes</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-gray-200">
 {sortedLotes.map((lote) => {
 const producer = getProducerById(lote.produtorId);
 const analysis = getAnaliseByLoteId(lote.id);

 return (
 <tr key={lote.id} className="hover:bg-gray-50">
 <td className="px-6 py-4 font-medium">{lote.codigo}</td>
 <td className="px-6 py-4 text-sm">{producer?.name || '-'}</td>
 <td className="px-6 py-4 text-sm">
 <div className="font-medium">{lote.volumeLitros.toLocaleString('pt-BR')} L</div>
 <div className="text-xs text-gray-500">
 Disp: {(lote.volumeDisponivel || 0).toLocaleString('pt-BR')} L
 </div>
 </td>
 <td className="px-6 py-4">
 {analysis?.gordura != null ? `${analysis.gordura.toFixed(1)}%` : '-'}
 </td>
 <td className="px-6 py-4">
 {analysis?.proteina != null ? `${analysis.proteina.toFixed(1)}%` : '-'}
 </td>
 <td className="px-6 py-4 font-medium">
 {lote.custoLitro != null ? `R$ ${lote.custoLitro.toFixed(2)}` : '-'}
 </td>
 <td className="px-6 py-4">
 <LoteStatusBadge status={lote.status} />
 </td>
 <td className="px-6 py-4">
 <button
 onClick={() => setSelectedLoteId(lote.id)}
 className="text-sm font-medium text-blue-600 hover:text-blue-800"
 >
 Ver detalhes
 </button>
 </td>
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>
 )}
 </div>

 <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
 <div className="border-b border-gray-200 p-4">
 <h3 className="font-bold text-gray-900">Ranking de produtores por qualidade</h3>
 </div>
 {rankingProdutores.length === 0 ? (
 <div className="p-8 text-center text-sm text-gray-600">Ainda nao ha ranking com base em analises reais.</div>
 ) : (
 <div className="overflow-x-auto">
 <table className="w-full">
 <thead className="bg-gray-50">
 <tr>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Ranking</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Produtor</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Volume</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Gordura</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Proteina</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Preco medio</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Total pago</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-gray-200">
 {rankingProdutores.map((row, index) => (
 <tr key={row.producer.id} className="hover:bg-gray-50">
 <td className="px-6 py-4">
 <div className="flex items-center gap-2">
 {index === 0 ? <Award className="h-5 w-5 text-yellow-500" /> : null}
 <span className="font-bold">{index + 1}o</span>
 </div>
 </td>
 <td className="px-6 py-4 font-medium">{row.producer.name}</td>
 <td className="px-6 py-4">{row.totalVolume.toLocaleString('pt-BR')} L</td>
 <td className="px-6 py-4">{row.averageFat.toFixed(2)}%</td>
 <td className="px-6 py-4">{row.averageProtein.toFixed(2)}%</td>
 <td className="px-6 py-4">R$ {row.averagePrice.toFixed(2)}</td>
 <td className="px-6 py-4 font-medium text-green-600">
 R$ {row.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 )}
 </div>
 </div>
 ) : null}

 {!loading && selectedTab === 'insumos' ? (
 <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
 <div className="border-b border-gray-200 p-4">
 <h3 className="font-bold text-gray-900">Lotes de insumos</h3>
 </div>
 {supplyLots.length === 0 ? (
 <div className="p-8 text-center text-sm text-gray-600">Nenhum lote de insumo encontrado.</div>
 ) : (
 <div className="overflow-x-auto">
 <table className="w-full">
 <thead className="bg-gray-50">
 <tr>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Insumo</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Lote interno</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Fornecedor</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Origem</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Disponivel</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Validade</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
 <th className="px-6 py-3 text-right text-xs font-medium uppercase text-gray-500">Ações</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-gray-200">
 {supplyLots.map((lot) => {
 const supplyItem = getSupplyItemById(lot.supplyItemId);
 const supplierName = lot.supplierName || getSupplierById(lot.supplierId)?.name || '-';
 const unitSymbol = getUnitSymbol(lot.unitId || supplyItem?.unitId);
 const minimumStock = lot.minimumStock ?? supplyItem?.minimumStock ?? 0;
 const expired = Boolean(lot.expirationDate && lot.expirationDate < new Date());

 return (
 <tr key={lot.id} className="hover:bg-gray-50">
 <td className="px-6 py-4 font-medium">{lot.supplyItemName || supplyItem?.name || '-'}</td>
 <td className="px-6 py-4 text-sm">{lot.internalLotCode}</td>
 <td className="px-6 py-4 text-sm">{supplierName}</td>
 <td className="px-6 py-4 text-sm">{lot.purchaseNumber || 'Entrada direta'}</td>
 <td className="px-6 py-4">
 <div className="font-medium">
 {lot.availableQuantity.toLocaleString('pt-BR')} {unitSymbol}
 </div>
 <div className="text-xs text-gray-500">
 Minimo do item: {minimumStock.toLocaleString('pt-BR')} {unitSymbol}
 </div>
 </td>
 <td className="px-6 py-4 text-sm">
 {lot.expirationDate ? format(lot.expirationDate, 'dd/MM/yyyy') : '-'}
 </td>
 <td className="px-6 py-4">
 <SupplyLotStatusBadge status={lot.status} />
 </td>
 <td className="px-6 py-4 text-right flex justify-end gap-2">
    {expired && lot.availableQuantity > 0 ? <button onClick={() => openDisposal({ id: lot.id, type: 'Insumo', name: lot.supplyItemName || supplyItem?.name || 'Insumo', code: lot.internalLotCode, quantity: lot.availableQuantity, unit: unitSymbol })} className="text-sm font-medium text-amber-700 hover:text-amber-900">Baixa vencido</button> : null}
    <button
      onClick={() => {
        setEditingLotId(lot.id);
        setEditLotQuantity(String(lot.availableQuantity));
      }}
      className="text-blue-600 hover:text-blue-900"
      title="Ajustar saldo"
    >
      <Pencil className="h-5 w-5" />
    </button>
    <button
      onClick={() => {
        setItemToDelete(lot.id);
        setDeleteType('supply');
        setDeleteConfirmOpen(true);
      }}
      className="text-red-600 hover:text-red-900"
      title="Excluir lote"
    >
      <Trash2 className="h-5 w-5" />
    </button>
  </td>
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>
 )}
 </div>
 ) : null}

 {!loading && selectedTab === 'produtos' ? (
 <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
 <div className="border-b border-gray-200 p-4">
 <h3 className="font-bold text-gray-900">Estoque de produtos acabados</h3>
 </div>
 {estoquesProdutos.length === 0 ? (
 <div className="p-8 text-center text-sm text-gray-600">Nenhum lote de produto acabado encontrado.</div>
 ) : (
 <div className="overflow-x-auto">
 <table className="w-full">
 <thead className="bg-gray-50">
 <tr>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Produto</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Lote</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Produzido</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Disponivel</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Devolvidos</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Validade</th>
 <th className="px-6 py-3 text-right text-xs font-medium uppercase text-gray-500">Ações</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-gray-200">
 {estoquesProdutos.map((stock) => {
 const product = getFinishedProductById(stock.produtoId);
 const daysToExpire = differenceInDays(stock.dataValidade, new Date());
 const expired = stock.dataValidade < new Date();

 return (
 <tr key={stock.id} className="hover:bg-gray-50">
 <td className="px-6 py-4 font-medium">{product?.name || '-'}</td>
 <td className="px-6 py-4 text-sm">{stock.lote}</td>
 <td className="px-6 py-4">
 {stock.quantidade} {getUnitSymbol(product?.unitId)}{stock.quantidadePecas != null ? <span className="block text-xs text-gray-500">{stock.quantidadePecas} peças</span> : null}
 </td>
 <td className="px-6 py-4 font-medium text-green-600">
 {stock.disponivel} {getUnitSymbol(product?.unitId)}{stock.disponivelPecas != null ? <span className="block text-xs text-green-700">{stock.disponivelPecas} peças</span> : null}
 </td>
 <td className="px-6 py-4 font-medium text-red-600">
 {stock.devolvido || 0} {getUnitSymbol(product?.unitId)}
 </td>
 <td className="px-6 py-4">
 <span
 className={`text-sm ${
 daysToExpire < 3
 ? 'font-medium text-red-600'
 : daysToExpire < 7
 ? 'text-yellow-600'
 : ''
 }`}
 >
 {format(stock.dataValidade, 'dd/MM/yyyy')}
 {daysToExpire < 7 ? ` (${daysToExpire}d)` : ''}
 </span>
 </td>
 <td className="px-6 py-4 text-right flex justify-end gap-2">
    {expired && stock.disponivel > 0 ? <button onClick={() => openDisposal({ id: stock.id, type: 'Produto Acabado', name: product?.name || 'Produto acabado', code: stock.lote, quantity: stock.disponivel, unit: getUnitSymbol(product?.unitId) })} className="text-sm font-medium text-amber-700 hover:text-amber-900">Baixa vencido</button> : null}
    <button
      onClick={() => {
        setExitLotId(stock.id);
        setExitQuantity(String(stock.disponivel));
        setExitModalOpen(true);
      }}
      className="text-orange-600 hover:text-orange-900 font-medium text-sm"
      title="Registrar saída manual"
    >
      Saída
    </button>
    <button
      onClick={() => {
        setItemToDelete(stock.id);
        setDeleteType('product');
        setDeleteConfirmOpen(true);
      }}
      className="text-red-600 hover:text-red-900"
      title="Excluir lote"
    >
      <Trash2 className="h-5 w-5" />
    </button>
  </td>
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>
 )}
 </div>
 ) : null}

 {selectedLote ? (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
 <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white">
 <div className="flex items-start justify-between border-b border-gray-200 p-6">
 <div>
 <h3 className="text-xl font-bold text-gray-900">Detalhes do lote {selectedLote.codigo}</h3>
 <p className="text-sm text-gray-600">
 Produtor: {getProducerById(selectedLote.produtorId)?.name || '-'}
 </p>
 </div>
 <button
 onClick={() => setSelectedLoteId(null)}
 className="text-gray-500 hover:text-gray-900"
 >
 Fechar
 </button>
 </div>

 {detailLoading ? (
 <div className="flex items-center justify-center gap-3 p-10 text-sm text-gray-600">
 <Loader2 className="h-5 w-5 animate-spin" />
 Carregando detalhe do lote...
 </div>
 ) : (
 <div className="space-y-6 p-6">
 <SectionBlock title="Entrada do lote">
 <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
 <InfoPair label="Volume total" value={`${selectedLote.volumeLitros.toLocaleString('pt-BR')} L`} />
 <InfoPair
 label="Volume disponivel"
 value={`${(selectedLote.volumeDisponivel || 0).toLocaleString('pt-BR')} L`}
 />
 <InfoPair label="Temperatura" value={`${selectedLote.temperatura.toFixed(1)} C`} />
 <InfoPair
 label="Recebimento"
 value={format(selectedLote.dataHoraRecebimento, 'dd/MM/yyyy HH:mm')}
 />
 <InfoPair label="Status atual" value={selectedLote.status} />
 <InfoPair label="Motivo de bloqueio" value={selectedLote.motivoBloqueio || '-'} />
 </div>
 </SectionBlock>

 {selectedAnalise ? (
 <SectionBlock title="Analise de qualidade">
 <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
 <MetricTile label="Gordura" value={`${selectedAnalise.gordura?.toFixed(2) || '-'}%`} />
 <MetricTile label="Proteina" value={`${selectedAnalise.proteina?.toFixed(2) || '-'}%`} />
 <MetricTile label="Acidez" value={`${selectedAnalise.acidez} D`} />
 <MetricTile label="CBT" value={selectedAnalise.cbt?.toLocaleString('pt-BR') || '-'} />
 <MetricTile label="CCS" value={selectedAnalise.ccs?.toLocaleString('pt-BR') || '-'} />
 <MetricTile label="Crioscopia" value={`${selectedAnalise.crioscopia} H`} />
 </div>
 </SectionBlock>
 ) : null}

 {selectedPrecificacao ? (
 <SectionBlock title="Precificacao aplicada">
 <div className="space-y-2 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm">
 <PriceLine label="Preco base" value={`R$ ${selectedPrecificacao.precoBase.toFixed(2)}/L`} />
 <PriceLine label="Bonus gordura" value={`R$ ${selectedPrecificacao.bonusGordura.toFixed(2)}/L`} positive />
 <PriceLine label="Bonus proteina" value={`R$ ${selectedPrecificacao.bonusProteina.toFixed(2)}/L`} positive />
 <PriceLine
 label="Penalizacao acidez"
 value={`R$ ${selectedPrecificacao.penalizacaoAcidez.toFixed(2)}/L`}
 negative={selectedPrecificacao.penalizacaoAcidez < 0}
 />
 <PriceLine
 label="Penalizacao CBT"
 value={`R$ ${selectedPrecificacao.penalizacaoCBT.toFixed(2)}/L`}
 negative={selectedPrecificacao.penalizacaoCBT < 0}
 />
 <PriceLine
 label="Penalizacao CCS"
 value={`R$ ${selectedPrecificacao.penalizacaoCCS.toFixed(2)}/L`}
 negative={selectedPrecificacao.penalizacaoCCS < 0}
 />
 <div className="flex justify-between border-t border-blue-200 pt-2 font-semibold">
 <span>Preco final</span>
 <span>R$ {selectedPrecificacao.precoFinal.toFixed(2)}/L</span>
 </div>
 <div className="flex justify-between font-bold text-green-700">
 <span>Valor total do lote</span>
 <span>
 R$ {selectedPrecificacao.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
 </span>
 </div>
 </div>
 </SectionBlock>
 ) : null}

 <SectionBlock title="Bloqueios e eventos">
 {selectedLoteDetail?.blockEvents?.length ? (
 <div className="space-y-2">
 {selectedLoteDetail.blockEvents.map((event) => (
 <div key={event.id} className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm">
 <p className="font-medium text-red-800">{event.reasonSnapshot || 'Bloqueio registrado'}</p>
 <p className="text-red-700">{event.notes || 'Sem observacoes adicionais.'}</p>
 <p className="mt-1 text-xs text-red-600">
 {event.createdAt ? format(event.createdAt, 'dd/MM/yyyy HH:mm') : '-'}
 </p>
 </div>
 ))}
 </div>
 ) : (
 <p className="text-sm text-gray-600">Nenhum evento de bloqueio registrado.</p>
 )}
 </SectionBlock>

 <SectionBlock title="Consumo e producao vinculados">
 {selectedLoteDetail?.productionOrders?.length ? (
 <div className="space-y-3">
 {selectedLoteDetail.productionOrders.map((order) => {
 const product = getFinishedProductById(order.produtoId);
 const consumption = selectedLoteDetail.milkConsumptions.find(
 (item) => item.productionOrderId === order.id,
 );
 const generatedLots = selectedLoteDetail.finishedProductLots.filter(
 (item) => item.ordemProducaoId === order.id,
 );

 return (
 <div key={order.id} className="rounded-xl border border-gray-200 p-4">
 <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
 <InfoPair label="OP" value={order.numero} />
 <InfoPair label="Produto" value={product?.name || '-'} />
 <InfoPair
 label="Leite consumido"
 value={`${consumption?.litersConsumed.toLocaleString('pt-BR') || order.litrosUtilizados.toLocaleString('pt-BR')} L`}
 />
 <InfoPair label="Status" value={order.status} />
 </div>
 {generatedLots.length > 0 ? (
 <div className="mt-3 rounded-lg bg-gray-50 p-3 text-sm">
 <p className="mb-2 font-medium text-gray-900">Lotes acabados gerados</p>
 <div className="space-y-1">
 {generatedLots.map((lot) => (
 <p key={lot.id} className="text-gray-700">
 - {lot.lote}: {lot.quantidade} {getUnitSymbol(product?.unitId)} produzidos,{' '}
 {lot.disponivel} disponiveis
 </p>
 ))}
 </div>
 </div>
 ) : null}
 </div>
 );
 })}
 </div>
 ) : (
 <p className="text-sm text-gray-600">Esse lote ainda nao foi consumido em producao.</p>
 )}
 </SectionBlock>
 </div>
 )}
 </div>
 </div>
 ) : null}

      <Dialog open={summaryDetail !== null} onOpenChange={(open) => { if (!open) setSummaryDetail(null); }}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] sm:max-w-6xl overflow-y-auto p-0">
          {selectedSupplyItem ? <>
            <DialogHeader className="border-b border-gray-100 px-6 py-5 pr-12">
              <DialogTitle>{selectedSupplyItem.name}</DialogTitle>
              <DialogDescription>Resumo do insumo e os lotes que compõem seu saldo.</DialogDescription>
            </DialogHeader>
            <div className="space-y-5 p-6">
              <div className="grid gap-3 sm:grid-cols-3">
                <SummaryMetric label="Saldo total" value={`${selectedSupplyAvailableQuantity.toLocaleString('pt-BR')} ${getUnitSymbol(selectedSupplyItem.unitId)}`} />
                <SummaryMetric label="Estoque mínimo" value={`${selectedSupplyItem.minimumStock.toLocaleString('pt-BR')} ${getUnitSymbol(selectedSupplyItem.unitId)}`} />
                <SummaryMetric label="Lotes cadastrados" value={String(selectedSupplyLots.length)} />
              </div>
              <LotCompositionTable>
                <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500"><tr><th className="px-4 py-3">Lote</th><th className="px-4 py-3">Disponível</th><th className="px-4 py-3">Validade</th><th className="px-4 py-3">Status</th></tr></thead>
                <tbody className="divide-y divide-gray-100">{selectedSupplyLots.map((lot) => {
                  const expired = Boolean(lot.expirationDate && lot.expirationDate < startOfDay(new Date()));
                  return <tr key={lot.id}><td className="px-4 py-3 font-medium text-gray-900">{lot.internalLotCode}</td><td className="px-4 py-3">{lot.availableQuantity.toLocaleString('pt-BR')} {getUnitSymbol(lot.unitId || selectedSupplyItem.unitId)}</td><td className={`px-4 py-3 ${expired ? 'font-medium text-red-600' : ''}`}>{lot.expirationDate ? format(lot.expirationDate, 'dd/MM/yyyy') : 'Não informada'}</td><td className="px-4 py-3">{expired ? <StatusBadge tone="red" label="Vencido" /> : <SupplyLotStatusBadge status={lot.status} />}</td></tr>;
                })}{!selectedSupplyLots.length && <tr><td className="px-4 py-8 text-center text-gray-500" colSpan={4}>Nenhum lote cadastrado para este insumo.</td></tr>}</tbody>
              </LotCompositionTable>
            </div>
          </> : selectedProduct ? <>
            <DialogHeader className="border-b border-gray-100 px-6 py-5 pr-12">
              <DialogTitle>{selectedProduct.name}</DialogTitle>
              <DialogDescription>Resumo do produto e rastreabilidade dos lotes. Somente lotes dentro da validade ficam disponíveis ao vendedor externo.</DialogDescription>
            </DialogHeader>
            <div className="space-y-5 p-6">
              <div className="grid gap-3 sm:grid-cols-3">
                <SummaryMetric label="Saldo total" value={`${selectedProductLots.reduce((sum, lot) => sum + lot.disponivel, 0).toLocaleString('pt-BR')} ${getUnitSymbol(selectedProduct.unitId)}`} />
                <SummaryMetric label="Disponível para venda" value={`${selectedProductSellableQuantity.toLocaleString('pt-BR')} ${getUnitSymbol(selectedProduct.unitId)}`} emphasis={selectedProductSellableQuantity > 0 ? 'green' : 'red'} />
                <SummaryMetric label="Lotes cadastrados" value={String(selectedProductLots.length)} />
              </div>
              <LotCompositionTable>
                <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500"><tr><th className="px-4 py-3">Lote</th><th className="px-4 py-3">Produzido</th><th className="px-4 py-3">Saldo</th><th className="px-4 py-3">Validade</th><th className="px-4 py-3">Situação</th></tr></thead>
                <tbody className="divide-y divide-gray-100">{selectedProductLots.map((lot) => {
                  const expired = lot.dataValidade < startOfDay(new Date());
                  const sellable = lot.disponivel > 0 && !expired;
                  return <tr key={lot.id}><td className="px-4 py-3 font-medium text-gray-900">{lot.lote}</td><td className="px-4 py-3">{lot.quantidade.toLocaleString('pt-BR')} {getUnitSymbol(selectedProduct.unitId)}</td><td className="px-4 py-3 font-medium">{lot.disponivel.toLocaleString('pt-BR')} {getUnitSymbol(selectedProduct.unitId)}</td><td className={`px-4 py-3 ${expired ? 'font-medium text-red-600' : ''}`}>{format(lot.dataValidade, 'dd/MM/yyyy')}</td><td className="px-4 py-3">{expired ? <StatusBadge tone="red" label="Vencido" /> : sellable ? <StatusBadge tone="green" label="Disponível para venda" /> : <StatusBadge tone="gray" label="Sem saldo" />}</td></tr>;
                })}{!selectedProductLots.length && <tr><td className="px-4 py-8 text-center text-gray-500" colSpan={5}>Nenhum lote cadastrado para este produto.</td></tr>}</tbody>
              </LotCompositionTable>
            </div>
          </> : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Lote</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este lote de {deleteType === 'supply' ? 'insumo' : 'produto acabado'}? Esta ação não pode ser desfeita.
              A exclusão não será permitida se o lote tiver sido parcial ou totalmente utilizado/vendido.
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

      {editingLotId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-900">Ajustar Saldo do Lote</h3>
              <button
                onClick={() => setEditingLotId(null)}
                className="text-gray-500 hover:text-gray-900"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            
            <form onSubmit={handleEditLotSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Nova Quantidade Disponível
                </label>
                <input
                  type="number"
                  step="0.001"
                  required
                  value={editLotQuantity}
                  onChange={(e) => setEditLotQuantity(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="0.00"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setEditingLotId(null)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isEditingLot}
                  className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {isEditingLot ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {exitModalOpen && exitLotId && (() => {
        const selectedExitLot = estoquesProdutos.find(l => l.id === exitLotId);
        const requiresPieces = selectedExitLot && selectedExitLot.disponivelPecas != null;
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">Registrar Saída Manual</h3>
              <button
                onClick={() => setExitModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <form onSubmit={handleExitSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Quantidade</label>
                  <input
                    type="number"
                    required
                    step="0.0001"
                    min="0.0001"
                    value={exitQuantity}
                    onChange={(e) => setExitQuantity(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="0.00"
                  />
                </div>
                {requiresPieces && (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Peças *</label>
                    <input
                      type="number"
                      required
                      step="1"
                      min="1"
                      value={exitPieces}
                      onChange={(e) => setExitPieces(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="0"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Motivo</label>
                <select
                  required
                  value={exitReason}
                  onChange={(e) => setExitReason(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="Doação">Doação</option>
                  <option value="Vencimento">Vencimento</option>
                  <option value="Degustação">Degustação</option>
                  <option value="Descarte">Descarte</option>
                  <option value="Outros">Outros</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Observações (opcional)</label>
                <textarea
                  value={exitNotes}
                  onChange={(e) => setExitNotes(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  rows={3}
                  placeholder="Ex: Produto doado para instituição X"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setExitModalOpen(false)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isExiting}
                  className="flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
                >
                  {isExiting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Registrar Saída
                </button>
              </div>
            </form>
          </div>
        </div>
        );
      })()}

      {disposalLot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div><h3 className="text-lg font-bold text-gray-900">Solicitar baixa de lote vencido</h3><p className="mt-1 text-sm text-gray-600">{disposalLot.name} · lote {disposalLot.code}</p></div>
              <button onClick={() => setDisposalLot(null)} className="text-gray-400 hover:text-gray-700"><X className="h-5 w-5" /></button>
            </div>
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">A baixa fica pendente de autorização. O estoque e o lançamento financeiro só serão gerados após a aprovação.</div>
            <form onSubmit={submitDisposal} className="space-y-4">
              <label className="block text-sm font-medium text-gray-700">Quantidade disponível: {disposalLot.quantity.toLocaleString('pt-BR')} {disposalLot.unit}
                <input type="number" required min="0.0001" max={disposalLot.quantity} step="0.0001" value={disposalQuantity} onChange={(event) => setDisposalQuantity(event.target.value)} className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2" />
              </label>
              <fieldset><legend className="text-sm font-medium text-gray-700">Destinação após a aprovação</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">
                <label className={`cursor-pointer rounded-xl border p-3 text-sm ${disposalDestination === 'repasse_custo' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}><input className="mr-2" type="radio" checked={disposalDestination === 'repasse_custo'} onChange={() => setDisposalDestination('repasse_custo')} />Repasse/venda pelo custo</label>
                <label className={`cursor-pointer rounded-xl border p-3 text-sm ${disposalDestination === 'doacao_dre' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}><input className="mr-2" type="radio" checked={disposalDestination === 'doacao_dre'} onChange={() => setDisposalDestination('doacao_dre')} />Doação no DRE</label>
              </div></fieldset>
              <label className="block text-sm font-medium text-gray-700">Justificativa da baixa<textarea required value={disposalJustification} onChange={(event) => setDisposalJustification(event.target.value)} rows={3} className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2" placeholder="Ex.: produto vencido sem condição de comercialização regular" /></label>
              <label className="block text-sm font-medium text-gray-700">Observações (opcional)<input value={disposalNotes} onChange={(event) => setDisposalNotes(event.target.value)} className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
              <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={() => setDisposalLot(null)} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">Cancelar</button><button type="submit" disabled={isSubmittingDisposal || !disposalJustification.trim()} className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{isSubmittingDisposal ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Solicitar autorização</button></div>
            </form>
          </div>
        </div>
      )}
 </div>
 );
}

function MetricCard({
 title,
 value,
 subtitle,
 icon,
}: {
 title: string;
 value: string;
 subtitle: string;
 icon?: ReactNode;
}) {
 return (
 <div className="rounded-xl border border-gray-200 bg-white p-6">
 <div className="flex items-start justify-between">
 <div>
 <p className="mb-1 text-sm text-gray-600">{title}</p>
 <p className="text-2xl font-bold text-gray-900">{value}</p>
 <p className="mt-1 text-xs text-gray-500">{subtitle}</p>
 </div>
 <div className="rounded-lg bg-blue-50 p-3">
 {icon || <TrendingUp className="h-6 w-6 text-blue-600" />}
 </div>
 </div>
 </div>
 );
}

function LoteStatusBadge({ status }: { status: string }) {
 const classes =
 status === 'Aprovado' || status === 'Parcialmente Utilizado'
 ? 'bg-green-100 text-green-800'
 : status === 'Aguardando Análise' || status === 'Aguardando Analise'
 ? 'bg-yellow-100 text-yellow-800'
 : 'bg-red-100 text-red-800';

 return <span className={`rounded-full px-2 py-1 text-xs font-medium ${classes}`}>{status}</span>;
}

function SupplyLotStatusBadge({ status }: { status: string }) {
 const classes =
 status === 'Disponivel'
 ? 'bg-green-100 text-green-800'
 : status === 'Parcialmente Utilizado'
 ? 'bg-yellow-100 text-yellow-800'
 : status === 'Vencido' || status === 'Bloqueado'
 ? 'bg-red-100 text-red-800'
 : 'bg-gray-100 text-gray-800';

 return <span className={`rounded-full px-2 py-1 text-xs font-medium ${classes}`}>{status}</span>;
}

function SectionBlock({
 title,
 children,
}: {
 title: string;
 children: ReactNode;
}) {
 return (
 <div>
 <h4 className="mb-3 font-bold text-gray-900">{title}</h4>
 {children}
 </div>
 );
}

function InfoPair({ label, value }: { label: string; value: string }) {
 return (
 <div>
 <span className="text-gray-600">{label}</span>
 <p className="font-medium text-gray-900">{value}</p>
 </div>
 );
}

function MetricTile({ label, value }: { label: string; value: string }) {
 return (
 <div className="rounded-lg bg-gray-50 p-3">
 <p className="mb-1 text-xs text-gray-600">{label}</p>
 <p className="text-lg font-bold text-gray-900">{value}</p>
 </div>
 );
}

function SummaryMetric({ label, value, emphasis }: { label: string; value: string; emphasis?: 'green' | 'red' }) {
 return (
 <div className="rounded-lg bg-gray-50 p-4">
 <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
 <p className={`mt-1 text-xl font-bold ${emphasis === 'green' ? 'text-green-700' : emphasis === 'red' ? 'text-red-700' : 'text-gray-900'}`}>{value}</p>
 </div>
 );
}

function LotCompositionTable({ children }: { children: ReactNode }) {
 return <div className="overflow-x-auto rounded-lg border border-gray-200"><table className="w-full min-w-[640px] text-sm">{children}</table></div>;
}

function StatusBadge({ tone, label }: { tone: 'green' | 'red' | 'gray'; label: string }) {
 const classes = tone === 'green' ? 'bg-green-100 text-green-800' : tone === 'red' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-700';
 return <span className={`rounded-full px-2 py-1 text-xs font-medium ${classes}`}>{label}</span>;
}

function PriceLine({
 label,
 value,
 positive,
 negative,
}: {
 label: string;
 value: string;
 positive?: boolean;
 negative?: boolean;
}) {
 return (
 <div
 className={`flex justify-between ${
 positive ? 'text-green-700' : negative ? 'text-red-700' : 'text-gray-700'
 }`}
 >
 <span>{label}</span>
 <span className="font-medium">{value}</span>
 </div>
 );
}
