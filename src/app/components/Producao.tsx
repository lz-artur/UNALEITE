import { useEffect, useMemo, useState } from 'react';
import { Factory, Loader2, Plus, TrendingDown, TrendingUp, XCircle, MoreHorizontal, Edit2, Check, History, Trash2, AlertTriangle } from 'lucide-react';
import type { EstoqueProduto, LoteLeite, OrdemProducao } from '../data/mockData';
import { useCadastros } from '../context/CadastrosContext';
import {
 completeProductionOrder,
 createProductionOrder,
 updateProductionOrder,
 loadMilkLots,
 loadProductionOrders,
 cancelProductionOrder,
 loadProductionOrderCancellationPreview,
 type ProductionOrderCancellationPreview,
 loadProductionOrderEvents,
 type ProductionEvent,
 loadSupplyLots,
 loadFinishedProductLots,
 type SupplyLotInventoryItem,
} from '../services/operationsApi';
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
import { ModalAjusteEstoqueOP } from './ModalAjusteEstoqueOP';

const emptyCreateForm = {
 milkLotId: '',
 productId: '',
 litersToUse: '',
 actualQuantityProduced: '',
 supplyConsumptions: [] as { supplyItemId: string; quantity: string }[],
 finishedProductConsumptions: [] as { finishedProductId: string; finishedProductLotId: string; source: 'Disponivel' | 'Devolucao'; quantity: string; pieces: string }[],
};

const emptyCompleteForm = {
  actualQuantityProduced: '',
  actualPiecesProduced: '',
  actualCommercialUnitsProduced: '',
  generatedCoProducts: [] as { id: string; productId: string; quantity: string }[],
};

function getErrorMessage(error: unknown) {
 if (error instanceof Error) {
 return error.message;
 }

 return 'Nao foi possivel concluir a operacao.';
}

const eventFieldLabels: Record<string, string> = {
  availableVolumeLiters: 'Saldo disponível',
  litersReserved: 'Leite reservado',
  actualQuantityProduced: 'Quantidade produzida',
  milkLotId: 'Lote de leite',
  status: 'Status da OP',
  milkState: 'Situação do leite',
  orderStatus: 'Status da OP',
  liters: 'Litros',
};

function formatEventValue(key: string, value: unknown) {
  if (value == null) return '—';
  if (typeof value === 'number' && ['availableVolumeLiters', 'litersReserved', 'liters'].includes(key)) {
    return `${value.toLocaleString('pt-BR')} L`;
  }
  return String(value);
}

export default function Producao() {
 const [showCreateModal, setShowCreateModal] = useState(false);
 const [selectedOrder, setSelectedOrder] = useState<OrdemProducao | null>(null);
 const [ordensProducao, setOrdensProducao] = useState<OrdemProducao[]>([]);
 const [lotes, setLotes] = useState<LoteLeite[]>([]);
 const [supplyLots, setSupplyLots] = useState<SupplyLotInventoryItem[]>([]);
 const [finishedProductLots, setFinishedProductLots] = useState<EstoqueProduto[]>([]);
 const [formState, setFormState] = useState(emptyCreateForm);
 const [completeForm, setCompleteForm] = useState(emptyCompleteForm);
 const [loading, setLoading] = useState(true);
 const [errorMessage, setErrorMessage] = useState<string | null>(null);
 const [submitError, setSubmitError] = useState<string | null>(null);
 const [saving, setSaving] = useState(false);
 const [completing, setCompleting] = useState(false);
 const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
 const [itemToDelete, setItemToDelete] = useState<string | null>(null);
 const [isDeleting, setIsDeleting] = useState(false);
 const [cancelReason, setCancelReason] = useState('');
 const [cancellationPreview, setCancellationPreview] = useState<ProductionOrderCancellationPreview | null>(null);
 const [loadingPreview, setLoadingPreview] = useState(false);
 const [selectedOpForCancel, setSelectedOpForCancel] = useState<OrdemProducao | null>(null);
 const [historyOrder, setHistoryOrder] = useState<OrdemProducao | null>(null);
 const [historyEvents, setHistoryEvents] = useState<ProductionEvent[]>([]);
 const [historyLoading, setHistoryLoading] = useState(false);
 const [historyError, setHistoryError] = useState<string | null>(null);
 const [viewOrder, setViewOrder] = useState<OrdemProducao | null>(null);
 const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
 const [editingOrder, setEditingOrder] = useState<OrdemProducao | null>(null);
 const [ajusteModalOpen, setAjusteModalOpen] = useState(false);
 const [orderToAdjust, setOrderToAdjust] = useState<OrdemProducao | null>(null);
 const [supplySearchTerms, setSupplySearchTerms] = useState<Record<number, string>>({});
 const [openSupplySearch, setOpenSupplySearch] = useState<number | null>(null);
 const [finishedProductSearchTerms, setFinishedProductSearchTerms] = useState<Record<number, string>>({});
 const [openFinishedProductSearch, setOpenFinishedProductSearch] = useState<number | null>(null);
 const { finishedProducts, getFinishedProductById, getUnitSymbol, getSupplyItemById } = useCadastros();

 const loadData = async () => {
 setLoading(true);
 setErrorMessage(null);

 try {
 const [orders, nextLotes, fetchedSupplyLots, fetchedFinishedLots] = await Promise.all([loadProductionOrders(), loadMilkLots(), loadSupplyLots(), loadFinishedProductLots()]);
 setOrdensProducao(orders);
 setLotes(nextLotes);
 setSupplyLots(fetchedSupplyLots);
 setFinishedProductLots(fetchedFinishedLots);
 } catch (error) {
 setErrorMessage(getErrorMessage(error));
 } finally {
 setLoading(false);
 }
 };

 useEffect(() => {
 void loadData();
 }, []);

 const lotesAprovados = useMemo(
 () =>
 lotes.filter(
 (lote) =>
 ['Aprovado', 'Parcialmente Utilizado'].includes(lote.status) &&
 (lote.volumeDisponivel ?? 0) > 0,
 ),
 [lotes],
 );

 // A OP finalizada pode ter consumido todo o lote. Nesse caso ele deixa de
 // estar disponível para novas OPs, mas ainda precisa aparecer como o lote
 // registrado quando a ordem é aberta para edição.
 const lotesParaFormulario = useMemo(() => {
 const loteSelecionado = lotes.find((lote) => lote.id === formState.milkLotId);

 if (!loteSelecionado || lotesAprovados.some((lote) => lote.id === loteSelecionado.id)) {
 return lotesAprovados;
 }

 return [loteSelecionado, ...lotesAprovados];
 }, [formState.milkLotId, lotes, lotesAprovados]);

 const activeProducts = useMemo(
 () => finishedProducts.filter((product) => product.active),
 [finishedProducts],
 );

 const availableSupplyItems = useMemo(() => {
   const grouped = new Map<string, { id: string; name: string; availableQuantity: number; unit: string }>();

   const orderConsumptions = new Map<string, number>();
   if (editingOrder?.insumos) {
     editingOrder.insumos.forEach(item => {
       if (item.insumoId) {
         orderConsumptions.set(item.insumoId, (orderConsumptions.get(item.insumoId) || 0) + item.quantidade);
       }
     });
   }

   supplyLots
     .forEach((lot) => {
       const current = grouped.get(lot.supplyItemId);
       const item = getSupplyItemById(lot.supplyItemId);
       grouped.set(lot.supplyItemId, {
         id: lot.supplyItemId,
         name: lot.supplyItemName || item?.name || 'Insumo sem nome',
         availableQuantity: (current?.availableQuantity ?? 0) + lot.availableQuantity,
         unit: getUnitSymbol(lot.unitId || item?.unitId),
       });
     });

   orderConsumptions.forEach((qty, supplyItemId) => {
     const current = grouped.get(supplyItemId);
     if (current) {
       current.availableQuantity += qty;
     } else {
       const item = getSupplyItemById(supplyItemId);
       if (item) {
         grouped.set(supplyItemId, {
           id: supplyItemId,
           name: item.name,
           availableQuantity: qty,
           unit: getUnitSymbol(item.unitId),
         });
       }
     }
   });

   return Array.from(grouped.values())
     .filter(item => item.availableQuantity > 0)
     .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
 }, [getSupplyItemById, getUnitSymbol, supplyLots, editingOrder]);

 const availableFinishedProducts = useMemo(() => {
   const grouped = new Map<string, { id: string; name: string; availableQuantity: number; unit: string }>();

   const orderConsumptions = new Map<string, number>();
   if (editingOrder?.produtosAcabadosConsumidos) {
     editingOrder.produtosAcabadosConsumidos.forEach(item => {
       if (item.origem !== 'Devolucao' && item.produtoId) {
         orderConsumptions.set(item.produtoId, (orderConsumptions.get(item.produtoId) || 0) + item.quantidade);
       }
     });
   }

   finishedProductLots
     .forEach((lot) => {
       const current = grouped.get(lot.produtoId);
       const product = getFinishedProductById(lot.produtoId);
       grouped.set(lot.produtoId, {
         id: lot.produtoId,
         name: product?.name || 'Produto acabado sem nome',
         availableQuantity: (current?.availableQuantity ?? 0) + lot.disponivel,
         unit: getUnitSymbol(product?.unitId),
       });
     });

   orderConsumptions.forEach((qty, productId) => {
     const current = grouped.get(productId);
     if (current) {
       current.availableQuantity += qty;
     } else {
       const product = getFinishedProductById(productId);
       if (product) {
         grouped.set(productId, {
           id: productId,
           name: product.name,
           availableQuantity: qty,
           unit: getUnitSymbol(product.unitId),
         });
       }
     }
   });

   return Array.from(grouped.values())
     .filter(item => item.availableQuantity > 0)
     .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
 }, [finishedProductLots, getFinishedProductById, getUnitSymbol, editingOrder]);

 const returnedFinishedProducts = useMemo(() => {
   const grouped = new Map<string, { id: string; name: string; availableQuantity: number; unit: string }>();
   
   const orderConsumptions = new Map<string, number>();
   if (editingOrder?.produtosAcabadosConsumidos) {
     editingOrder.produtosAcabadosConsumidos.forEach(item => {
       if (item.origem === 'Devolucao' && item.produtoId) {
         orderConsumptions.set(item.produtoId, (orderConsumptions.get(item.produtoId) || 0) + item.quantidade);
       }
     });
   }

   finishedProductLots
     .forEach((lot) => {
       const current = grouped.get(lot.produtoId);
       const product = getFinishedProductById(lot.produtoId);
       grouped.set(lot.produtoId, {
         id: lot.produtoId,
         name: product?.name || 'Produto acabado sem nome',
         availableQuantity: (current?.availableQuantity ?? 0) + (lot.devolvido ?? 0),
         unit: getUnitSymbol(product?.unitId),
       });
     });

   orderConsumptions.forEach((qty, productId) => {
     const current = grouped.get(productId);
     if (current) {
       current.availableQuantity += qty;
     } else {
       const product = getFinishedProductById(productId);
       if (product) {
         grouped.set(productId, {
           id: productId,
           name: product.name,
           availableQuantity: qty,
           unit: getUnitSymbol(product.unitId),
         });
       }
     }
   });

   return Array.from(grouped.values())
     .filter(item => item.availableQuantity > 0)
     .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
 }, [finishedProductLots, getFinishedProductById, getUnitSymbol, editingOrder]);

 const selectedLot = lotes.find((lote) => lote.id === formState.milkLotId);
 const selectedProduct = getFinishedProductById(formState.productId);
 const finishedOrders = ordensProducao.filter((op) => op.status === 'Finalizada');
 const averageYield =
 finishedOrders.length > 0
 ? finishedOrders.reduce((sum, op) => sum + (op.rendimentoReal || 0), 0) / finishedOrders.length
 : 0;

 const handleSave = async () => {
 const isSecondary = selectedProduct?.productionType === 'Secundario';
 const litersToUse = isSecondary ? 0 : Number(formState.litersToUse);

 if (!formState.productId) {
 setSubmitError('Selecione o produto a ser fabricado.');
 return;
 }

 if (!isSecondary) {
 if (!formState.milkLotId || litersToUse <= 0) {
 setSubmitError('Preencha lote de leite, produto e litros planejados.');
 return;
 }
 if (!editingOrder && selectedLot && litersToUse > (selectedLot.volumeDisponivel ?? 0)) {
 setSubmitError('O lote selecionado não possui volume disponível suficiente.');
 return;
 }
 } else {
 const hasSupplies = formState.supplyConsumptions.some((c) => c.supplyItemId && Number(c.quantity) > 0);
 const hasFinished = formState.finishedProductConsumptions.some((c) => c.finishedProductId && c.finishedProductLotId && Number(c.quantity) > 0);
 if (!hasSupplies && !hasFinished) {
 setSubmitError('Para produção secundária, informe ao menos um coproduto ou insumo a ser consumido.');
 return;
 }
 }

 setSaving(true);
 setSubmitError(null);

 try {
 const payloadSupplyConsumptions = formState.supplyConsumptions
   .filter(c => c.supplyItemId && Number(c.quantity) > 0)
   .map(c => ({ supplyItemId: c.supplyItemId, quantity: Number(c.quantity) }));

 const payloadFinishedProductConsumptions = formState.finishedProductConsumptions
   .filter(c => c.finishedProductId && c.finishedProductLotId && Number(c.quantity) > 0)
   .map(c => ({ finishedProductId: c.finishedProductId, finishedProductLotId: c.finishedProductLotId, source: c.source, quantity: Number(c.quantity), pieces: c.pieces ? Number(c.pieces) : undefined }));

 if (editingOrder) {
   await updateProductionOrder(editingOrder.id, {
     milkLotId: isSecondary ? undefined : formState.milkLotId,
     productId: formState.productId,
     litersToUse: isSecondary ? 0 : litersToUse,
     actualQuantityProduced: formState.actualQuantityProduced ? Number(formState.actualQuantityProduced) : undefined,
     supplyConsumptions: payloadSupplyConsumptions,
     finishedProductConsumptions: payloadFinishedProductConsumptions,
   });
 } else {
   await createProductionOrder({
     milkLotId: isSecondary ? undefined : formState.milkLotId,
     productId: formState.productId,
     litersToUse: isSecondary ? 0 : litersToUse,
     productionType: isSecondary ? 'Secundario' : 'Primario',
     commercialPresentation: selectedProduct?.commercialPresentation,
     packageSize: selectedProduct?.packageSize || undefined,
     supplyConsumptions: payloadSupplyConsumptions.length ? payloadSupplyConsumptions : undefined,
     finishedProductConsumptions: payloadFinishedProductConsumptions.length ? payloadFinishedProductConsumptions : undefined,
   });
 }
 setShowCreateModal(false);
 setEditingOrder(null);
 setFormState(emptyCreateForm);
 setSupplySearchTerms({});
 setOpenSupplySearch(null);
 setFinishedProductSearchTerms({});
 setOpenFinishedProductSearch(null);
 await loadData();
 } catch (error) {
 setSubmitError(getErrorMessage(error));
 } finally {
 setSaving(false);
 }
 };

 const handleComplete = async () => {
 if (!selectedOrder) {
 return;
 }

 const actualQuantityProduced = Number(completeForm.actualQuantityProduced);
 const prod = getFinishedProductById(selectedOrder.produtoId);
 const tracksPieces = prod?.tracksPieces === true;
 const actualPiecesProduced = Number(completeForm.actualPiecesProduced);
 const actualCommercialUnitsProduced = completeForm.actualCommercialUnitsProduced
   ? Number(completeForm.actualCommercialUnitsProduced)
   : undefined;

 if (actualQuantityProduced <= 0) {
 setSubmitError('Informe a quantidade produzida para finalizar a OP.');
 return;
 }
 if (tracksPieces && (!Number.isInteger(actualPiecesProduced) || actualPiecesProduced <= 0)) {
 setSubmitError('Informe a quantidade de peças produzidas para finalizar a OP.');
 return;
 }

 setCompleting(true);
 setSubmitError(null);

 try {
      const formattedCoProducts = completeForm.generatedCoProducts
        .filter(c => c.productId && c.quantity)
        .map(c => ({
          productId: c.productId,
          quantity: Number(c.quantity)
        }));

      await completeProductionOrder({
        orderId: selectedOrder.id,
        actualQuantityProduced,
        actualPiecesProduced: tracksPieces ? actualPiecesProduced : undefined,
        actualCommercialUnitsProduced: actualCommercialUnitsProduced && actualCommercialUnitsProduced > 0 ? actualCommercialUnitsProduced : undefined,
        commercialPresentation: selectedOrder.apresentacaoComercial || prod?.commercialPresentation,
        packageSize: selectedOrder.tamanhoEmbalagem || prod?.packageSize || undefined,
        generatedCoProducts: formattedCoProducts.length > 0 ? formattedCoProducts : undefined,
      });
 setSelectedOrder(null);
 setCompleteForm(emptyCompleteForm);
 await loadData();
 } catch (error) {
 setSubmitError(getErrorMessage(error));
 } finally {
 setCompleting(false);
 }
 };

 const handleCancel = async () => {
 if (!itemToDelete) return;
 if (cancelReason.trim().length < 3) {
   setErrorMessage('Informe o motivo do cancelamento da OP.');
   return;
 }
 setIsDeleting(true);
 try {
 await cancelProductionOrder(itemToDelete, cancelReason.trim());
 await loadData();
 setDeleteConfirmOpen(false);
 setItemToDelete(null);
 setCancelReason('');
 } catch (error) {
 setErrorMessage(getErrorMessage(error));
 } finally {
 setIsDeleting(false);
 }
 };

 const handleOpenCancelModal = async (op: OrdemProducao) => {
   setItemToDelete(op.id);
   setSelectedOpForCancel(op);
   setCancelReason('');
   setCancellationPreview(null);
   setDeleteConfirmOpen(true);
   setLoadingPreview(true);
   try {
     const preview = await loadProductionOrderCancellationPreview(op.id);
     setCancellationPreview(preview);
   } catch (err) {
     setErrorMessage(getErrorMessage(err));
   } finally {
     setLoadingPreview(false);
   }
 };

 const openHistory = async (order: OrdemProducao) => {
   setHistoryOrder(order);
   setHistoryEvents([]);
   setHistoryError(null);
   setHistoryLoading(true);
   try {
     setHistoryEvents(await loadProductionOrderEvents(order.id));
   } catch (error) {
     setHistoryError(getErrorMessage(error));
   } finally {
     setHistoryLoading(false);
   }
 };

 const closeCreateModal = () => {
 if (saving) {
 return;
 }

 setShowCreateModal(false);
 setEditingOrder(null);
 setFormState(emptyCreateForm);
 setSupplySearchTerms({});
 setOpenSupplySearch(null);
 setFinishedProductSearchTerms({});
 setOpenFinishedProductSearch(null);
 setSubmitError(null);
 };

 const closeCompleteModal = () => {
 if (completing) {
 return;
 }

 setSelectedOrder(null);
 setCompleteForm(emptyCompleteForm);
 setSubmitError(null);
 };

 return (
 <div className="space-y-6">
 <div className="flex items-center justify-between">
 <div>
 <h2 className="text-2xl font-bold text-gray-900">Producao</h2>
 <p className="text-gray-600">Ordens de producao, consumo de leite e rendimento real</p>
 </div>
 <button
 onClick={() => setShowCreateModal(true)}
 className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
 >
 <Plus className="h-5 w-5" />
 Nova OP
 </button>
 </div>

 {errorMessage ? (
 <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
 {errorMessage}
 </div>
 ) : null}

 <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
 <MetricCard
 iconClassName="bg-yellow-50 text-yellow-600"
 icon={<Factory className="h-6 w-6" />}
 title="OPs em andamento"
 value={ordensProducao.filter((op) => op.status === 'Em Andamento').length}
 />
 <MetricCard
 iconClassName="bg-green-50 text-green-600"
 icon={<Factory className="h-6 w-6" />}
 title="OPs finalizadas"
 value={finishedOrders.length}
 />
 <MetricCard
 iconClassName="bg-blue-50 text-blue-600"
 icon={<TrendingUp className="h-6 w-6" />}
 title="Rendimento medio"
 value={averageYield.toFixed(2)}
 />
 </div>

 <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
 <div className="border-b border-gray-200 p-4">
 <div className="flex items-center justify-between gap-4">
 <h3 className="font-bold text-gray-900">Ordens de producao</h3>
 <button
 onClick={() => void loadData()}
 className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
 >
 Atualizar
 </button>
 </div>
 </div>

 {loading ? (
 <div className="flex items-center justify-center gap-3 p-10 text-sm text-gray-600">
 <Loader2 className="h-5 w-5 animate-spin" />
 Carregando ordens de producao...
 </div>
 ) : ordensProducao.length === 0 ? (
 <div className="p-10 text-center text-sm text-gray-600">
 Nenhuma ordem de producao encontrada.
 </div>
 ) : (
 <div className="overflow-x-auto min-h-[300px]">
 <table className="w-full">
 <thead className="bg-gray-50">
 <tr>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Numero</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Tipo</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Produto</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Lote de leite</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Litros</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Produzido</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Rendimento</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Acoes</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-gray-200">
 {ordensProducao.map((op, index) => {
 const isLastItems = index >= ordensProducao.length - 2 && ordensProducao.length > 2;
 const produto = getFinishedProductById(op.produtoId);
 const lote = lotes.find((entry) => entry.id === op.loteLeiteId);
 const rendimentoDiferenca =
 op.rendimentoReal && produto
 ? ((op.rendimentoReal - produto.theoreticalYield) / produto.theoreticalYield) * 100
 : 0;

 return (
 <tr 
  key={op.id} 
  className="hover:bg-gray-50 cursor-pointer"
  onClick={() => setViewOrder(op)}
 >
 <td className="px-6 py-4 font-medium">{op.numero}</td>
 <td className="px-6 py-4">
 <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${op.tipoProducao === 'Secundario' ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-blue-50 text-blue-700 border border-blue-200'}`}>
 {op.tipoProducao === 'Secundario' ? 'Secundário' : 'Primário'}
 </span>
 </td>
 <td className="px-6 py-4">
 <span className="font-medium text-gray-900">{produto?.name || '-'}</span>
 {op.apresentacaoComercial || op.tamanhoEmbalagem ? (
 <span className="block text-xs text-gray-500">
 {op.apresentacaoComercial}{op.tamanhoEmbalagem ? ` (${op.tamanhoEmbalagem})` : ''}
 </span>
 ) : null}
 </td>
 <td className="px-6 py-4 text-sm">
 {op.tipoProducao === 'Secundario' ? <span className="text-gray-400 italic">Sem leite</span> : (lote?.codigo || '-')}
 </td>
 <td className="px-6 py-4">
 {op.tipoProducao === 'Secundario' ? <span className="text-gray-400">—</span> : `${(op.litrosUtilizados ?? 0).toLocaleString('pt-BR')} L`}
 </td>
 <td className="px-6 py-4">
 {op.quantidadeProduzida != null ? (
 <div>
 <span className="font-medium text-gray-900">{op.quantidadeProduzida} {getUnitSymbol(produto?.unitId)}</span>
 {op.unidadesComerciaisProduzidas != null && op.unidadesComerciaisProduzidas > 0 ? (
 <span className="block text-xs text-emerald-700 font-medium">
 {op.unidadesComerciaisProduzidas} {op.apresentacaoComercial || 'un'}
 </span>
 ) : null}
 </div>
 ) : '-'}
 </td>
 <td className="px-6 py-4">
 {op.rendimentoReal ? (
 <div className="flex items-center gap-2">
 <span className="font-medium">{op.rendimentoReal.toFixed(2)}</span>
 {rendimentoDiferenca !== 0 ? (
 <span
 className={`flex items-center text-xs ${
 rendimentoDiferenca > 0 ? 'text-green-600' : 'text-red-600'
 }`}
 >
 {rendimentoDiferenca > 0 ? (
 <TrendingUp className="mr-0.5 h-3 w-3" />
 ) : (
 <TrendingDown className="mr-0.5 h-3 w-3" />
 )}
 {Math.abs(rendimentoDiferenca).toFixed(1)}%
 </span>
 ) : null}
 </div>
 ) : (
 '-'
 )}
 </td>
  <td className="px-6 py-4">
  <StatusBadge status={op.status} />
  </td>
  <td className="px-6 py-4 flex items-center justify-end gap-2">
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpenDropdownId(openDropdownId === op.id ? null : op.id);
        }}
        className="p-1 rounded-full hover:bg-gray-200 text-gray-500"
      >
        <MoreHorizontal className="h-5 w-5" />
      </button>
      
      {openDropdownId === op.id && (
        <div className={`absolute right-0 ${isLastItems ? 'bottom-full mb-1' : 'top-full mt-1'} w-44 bg-white rounded-md shadow-lg border border-gray-200 z-50 py-1`}
          onClick={(e) => e.stopPropagation()}
        >
          {op.status === 'Em Andamento' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSelectedOrder(op);
                setCompleteForm(emptyCompleteForm);
                setSubmitError(null);
                setOpenDropdownId(null);
              }}
              className="w-full text-left px-4 py-2 text-sm text-green-700 hover:bg-gray-100 flex items-center gap-2 font-medium"
            >
              <Check className="w-4 h-4 text-green-600" /> Finalizar OP
            </button>
          )}
          <button 
            onClick={(e) => {
              e.stopPropagation();
              setEditingOrder(op);
              setFormState({
                milkLotId: op.loteLeiteId,
                productId: op.produtoId,
                litersToUse: String(op.litrosUtilizados),
                actualQuantityProduced: op.quantidadeProduzida ? String(op.quantidadeProduzida) : '',
                supplyConsumptions: op.insumos
                  .filter(i => i.insumoId)
                  .reduce((consumptions, item) => {
                    const existing = consumptions.find((consumption) => consumption.supplyItemId === item.insumoId);
                    if (existing) {
                      existing.quantity = String(Number(existing.quantity) + item.quantidade);
                    } else {
                      consumptions.push({ supplyItemId: item.insumoId, quantity: String(item.quantidade) });
                    }
                    return consumptions;
                  }, [] as { supplyItemId: string; quantity: string }[]),
                // Each consumption must remain tied to its original lot. Grouping by
                // product here loses that identifier and causes the save payload to
                // omit the consumption entirely.
                finishedProductConsumptions: (op.produtosAcabadosConsumidos || [])
                  .flatMap((item) => {
                    const productId = item.produtoId || finishedProductLots.find((lot) => lot.id === item.finishedProductLotId)?.produtoId;
                    if (!productId || !item.finishedProductLotId) return [];

                    return [{
                      finishedProductId: productId,
                      finishedProductLotId: item.finishedProductLotId,
                      source: item.origem ?? 'Disponivel',
                      quantity: String(item.quantidade),
                      pieces: item.pecas != null ? String(item.pecas) : '',
                    }];
                  }),
              });
              setShowCreateModal(true);
              setFinishedProductSearchTerms({});
              setOpenFinishedProductSearch(null);
              setOpenDropdownId(null);
            }}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
          >
            <Edit2 className="w-4 h-4 text-blue-500" /> Editar
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              void openHistory(op);
              setOpenDropdownId(null);
            }}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
          >
            <History className="w-4 h-4 text-violet-600" /> Ver histórico
          </button>
          {(op.status === 'Em Andamento' || op.status === 'Finalizada') && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                void handleOpenCancelModal(op);
                setOpenDropdownId(null);
              }}
              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100 flex items-center gap-2"
            >
              <XCircle className="w-4 h-4" /> Cancelar OP
            </button>
          )}
          {op.status === 'Finalizada' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setOrderToAdjust(op);
                setAjusteModalOpen(true);
                setOpenDropdownId(null);
              }}
              className="w-full text-left px-4 py-2 text-sm text-blue-700 hover:bg-gray-100 flex items-center gap-2 font-medium"
            >
              <Edit2 className="w-4 h-4 text-blue-600" /> Ajustar Estoque
            </button>
          )}
        </div>
      )}
    </div>
  </td>
  </tr>
 );
 })}
 </tbody>
 </table>
 </div>
 )}
 </div>

 {showCreateModal ? (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
 <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white">
 <div className="border-b border-gray-200 p-6">
 <h3 className="text-xl font-bold text-gray-900">
   {editingOrder ? 'Editar ordem de producao' : 'Nova ordem de producao'}
 </h3>
 </div>
 <div className="space-y-4 p-6">
 <div>
 <label htmlFor="select-produto-fabricar" className="mb-1 block text-sm font-medium text-gray-700">Produto a fabricar *</label>
 <select
 id="select-produto-fabricar"
 value={formState.productId}
 onChange={(event) =>
 setFormState((current) => ({ ...current, productId: event.target.value }))
 }
 className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
 >
 <option value="">Selecione...</option>
 {activeProducts.map((produto) => (
 <option key={produto.id} value={produto.id}>
 {produto.name} {produto.productionType === 'Secundario' ? '(Secundário)' : ''}
 </option>
 ))}
 </select>
 </div>

 {selectedProduct && selectedProduct.productionType === 'Secundario' && (
 <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 flex items-start gap-2">
 <span className="inline-block mt-0.5 px-2 py-0.5 rounded text-xs font-bold bg-amber-200 text-amber-900 uppercase tracking-wide shrink-0">
 Produção Secundária
 </span>
 <div>
 <p className="font-semibold text-amber-950">Fabricação a partir de Derivados / Coprodutos</p>
 <p className="text-xs text-amber-800 mt-0.5">
 Esta ordem <strong>não consome leite cru</strong>. A fabricação consumirá os coprodutos (ex: Creme) e insumos (ex: sal, embalagem) informados nas seções abaixo.
 </p>
 </div>
 </div>
 )}

 {selectedProduct && (selectedProduct.commercialPresentation || selectedProduct.packageSize) ? (
 <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
 <span className="font-medium text-gray-800">Apresentação:</span>
 <span>{selectedProduct.commercialPresentation || 'Padrão'}</span>
 {selectedProduct.packageSize ? (
 <>
 <span className="text-gray-300">|</span>
 <span className="font-medium text-gray-800">Embalagem:</span>
 <span>{selectedProduct.packageSize}</span>
 </>
 ) : null}
 </div>
 ) : null}

 {selectedProduct?.productionType !== 'Secundario' ? (
 <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
 <div>
 <label htmlFor="select-lote-leite" className="mb-1 block text-sm font-medium text-gray-700">Lote de leite *</label>
 <select
 id="select-lote-leite"
 value={formState.milkLotId}
 disabled={editingOrder?.status === 'Finalizada'}
 onChange={(event) =>
 setFormState((current) => ({ ...current, milkLotId: event.target.value }))
 }
 className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
 >
 <option value="">Selecione...</option>
 {lotesParaFormulario.map((lote) => (
 <option key={lote.id} value={lote.id}>
 {lote.codigo} - {(lote.volumeDisponivel ?? 0).toLocaleString('pt-BR')} L disponiveis
 </option>
 ))}
 </select>
 {editingOrder?.status === 'Finalizada' ? (
 <p className="mt-1 text-xs text-gray-500">O lote de leite não pode ser alterado após a finalização da OP.</p>
 ) : null}
 </div>
 <div>
 <label htmlFor="input-litros-planejados" className="mb-1 block text-sm font-medium text-gray-700">
 Litros planejados *
 </label>
 <input
 id="input-litros-planejados"
 type="number"
 min="0"
 step="0.01"
 value={formState.litersToUse}
 onChange={(event) =>
 setFormState((current) => ({ ...current, litersToUse: event.target.value }))
 }
 placeholder="0"
 className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
 />
 </div>
 </div>
 ) : null}

 {editingOrder && editingOrder.status === 'Finalizada' ? (
 <div>
 <label className="mb-1 block text-sm font-medium text-gray-700">
 Quantidade produzida (kg) *
 </label>
 <input
 type="number"
 min="0"
 step="0.01"
 value={formState.actualQuantityProduced}
 onChange={(event) =>
 setFormState((current) => ({ ...current, actualQuantityProduced: event.target.value }))
 }
 placeholder="0"
 className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
 />
 </div>
 ) : null}

 <div className="border-t border-gray-200 pt-4 mt-4">
 <div className="flex justify-between items-center mb-2">
 <h4 className="text-sm font-semibold text-gray-900">Insumos Planejados (Opcional)</h4>
 <button
 type="button"
 onClick={() => setFormState(prev => ({ ...prev, supplyConsumptions: [...prev.supplyConsumptions, { supplyItemId: '', quantity: '' }] }))}
 className="text-sm flex items-center text-blue-600 hover:text-blue-700"
 >
 <Plus className="h-4 w-4 mr-1" /> Adicionar insumo
 </button>
 </div>
 
 <div className="space-y-3">
 {formState.supplyConsumptions.map((consumption, index) => (
 <div key={index} className="flex gap-2 items-start">
 <div className="relative flex-1">
 <input
 type="search"
 value={supplySearchTerms[index] ?? availableSupplyItems.find((item) => item.id === consumption.supplyItemId)?.name ?? ''}
 onFocus={() => setOpenSupplySearch(index)}
 onChange={(event) => {
   const newCons = [...formState.supplyConsumptions];
   newCons[index].supplyItemId = '';
   setFormState((prev) => ({ ...prev, supplyConsumptions: newCons }));
   setSupplySearchTerms((terms) => ({ ...terms, [index]: event.target.value }));
   setOpenSupplySearch(index);
 }}
 placeholder="Busque o insumo por nome..."
 className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
 aria-label="Buscar insumo"
 autoComplete="off"
 />
 {openSupplySearch === index ? (
 <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
 {availableSupplyItems
   .filter((item) => item.name.toLocaleLowerCase('pt-BR').includes((supplySearchTerms[index] ?? '').trim().toLocaleLowerCase('pt-BR')))
   .map((item) => (
     <button
       type="button"
       key={item.id}
       onMouseDown={(event) => event.preventDefault()}
       onClick={() => {
         const newCons = [...formState.supplyConsumptions];
         newCons[index].supplyItemId = item.id;
         setFormState((prev) => ({ ...prev, supplyConsumptions: newCons }));
         setSupplySearchTerms((terms) => ({ ...terms, [index]: item.name }));
         setOpenSupplySearch(null);
       }}
       className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50"
     >
       <span className="block font-medium text-gray-900">{item.name}</span>
       <span className="block text-xs text-gray-500">Saldo total: {item.availableQuantity.toLocaleString('pt-BR')} {item.unit}</span>
     </button>
   ))}
 {availableSupplyItems.filter((item) => item.name.toLocaleLowerCase('pt-BR').includes((supplySearchTerms[index] ?? '').trim().toLocaleLowerCase('pt-BR'))).length === 0 ? (
   <p className="px-3 py-2 text-sm text-gray-500">Nenhum insumo disponível encontrado.</p>
 ) : null}
 </div>
 ) : null}
 </div>
 <div className="w-24">
 <input
 type="number"
 min="0"
 step="0.0001"
 placeholder="Qtd"
 value={consumption.quantity}
 onChange={(e) => {
 const newCons = [...formState.supplyConsumptions];
 newCons[index].quantity = e.target.value;
 setFormState(prev => ({ ...prev, supplyConsumptions: newCons }));
 }}
 className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
 />
 </div>
 <button
 type="button"
 onClick={() => {
 const newCons = [...formState.supplyConsumptions];
 newCons.splice(index, 1);
 setFormState(prev => ({ ...prev, supplyConsumptions: newCons }));
 setSupplySearchTerms((terms) => {
   const nextTerms: Record<number, string> = {};
   Object.entries(terms).forEach(([key, value]) => {
     const currentIndex = Number(key);
     if (currentIndex < index) nextTerms[currentIndex] = value;
     if (currentIndex > index) nextTerms[currentIndex - 1] = value;
   });
   return nextTerms;
 });
 }}
 className="p-2 text-red-500 hover:bg-red-50 rounded-md"
 >
 <Trash2 className="h-4 w-4" />
 </button>
 </div>
 ))}
 {formState.supplyConsumptions.length === 0 && (
 <p className="text-xs text-gray-500 italic">Selecione o insumo e informe somente o total consumido. O sistema baixará os lotes mais antigos primeiro (FIFO).</p>
 )}
 </div>
 </div>

 <div className="border-t border-gray-200 pt-4 mt-4">
 <div className="flex justify-between items-center mb-2">
 <h4 className="text-sm font-semibold text-gray-900">Produtos Acabados Planejados (Ex: Creme)</h4>
 <button
 type="button"
 onClick={() => setFormState(prev => ({ ...prev, finishedProductConsumptions: [...prev.finishedProductConsumptions, { finishedProductId: '', finishedProductLotId: '', source: 'Disponivel', quantity: '', pieces: '' }] }))}
 className="text-sm flex items-center text-blue-600 hover:text-blue-700"
 >
 <Plus className="h-4 w-4 mr-1" /> Adicionar produto acabado
 </button>
 </div>
 
 <div className="space-y-3">
 {formState.finishedProductConsumptions.map((consumption, index) => (
 <div key={index} className="flex gap-2 items-start">
 <select
 value={consumption.source}
 onChange={(event) => {
   const newCons = [...formState.finishedProductConsumptions];
   newCons[index] = { ...newCons[index], source: event.target.value as 'Disponivel' | 'Devolucao', finishedProductId: '', finishedProductLotId: '', pieces: '' };
   setFormState((prev) => ({ ...prev, finishedProductConsumptions: newCons }));
   setFinishedProductSearchTerms((terms) => ({ ...terms, [index]: '' }));
 }}
 className="w-36 rounded-lg border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
 aria-label="Origem do produto acabado"
 >
   <option value="Disponivel">Disponível</option>
   <option value="Devolucao">Devolução</option>
 </select>
 <div className="relative flex-1">
 <input
 type="search"
 value={finishedProductSearchTerms[index] ?? (consumption.source === 'Devolucao' ? returnedFinishedProducts : availableFinishedProducts).find((item) => item.id === consumption.finishedProductId)?.name ?? ''}
 onFocus={() => setOpenFinishedProductSearch(index)}
 onChange={(event) => {
   const newCons = [...formState.finishedProductConsumptions];
   newCons[index].finishedProductId = '';
   setFormState((prev) => ({ ...prev, finishedProductConsumptions: newCons }));
   setFinishedProductSearchTerms((terms) => ({ ...terms, [index]: event.target.value }));
   setOpenFinishedProductSearch(index);
 }}
 placeholder="Busque o produto acabado por nome..."
 className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
 aria-label="Buscar produto acabado"
 autoComplete="off"
 />
 {openFinishedProductSearch === index ? (
 <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
 {(consumption.source === 'Devolucao' ? returnedFinishedProducts : availableFinishedProducts)
   .filter((item) => item.name.toLocaleLowerCase('pt-BR').includes((finishedProductSearchTerms[index] ?? '').trim().toLocaleLowerCase('pt-BR')))
   .map((item) => (
     <button
       type="button"
       key={item.id}
       onMouseDown={(event) => event.preventDefault()}
       onClick={() => {
         const newCons = [...formState.finishedProductConsumptions];
         newCons[index].finishedProductId = item.id; newCons[index].finishedProductLotId = ''; newCons[index].pieces = '';
         setFormState((prev) => ({ ...prev, finishedProductConsumptions: newCons }));
         setFinishedProductSearchTerms((terms) => ({ ...terms, [index]: item.name }));
         setOpenFinishedProductSearch(null);
       }}
       className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50"
     >
       <span className="block font-medium text-gray-900">{item.name}</span>
       <span className="block text-xs text-gray-500">Saldo {consumption.source === 'Devolucao' ? 'devolvido' : 'disponível'}: {item.availableQuantity.toLocaleString('pt-BR')} {item.unit}</span>
     </button>
   ))}
 {(consumption.source === 'Devolucao' ? returnedFinishedProducts : availableFinishedProducts).filter((item) => item.name.toLocaleLowerCase('pt-BR').includes((finishedProductSearchTerms[index] ?? '').trim().toLocaleLowerCase('pt-BR'))).length === 0 ? (
   <p className="px-3 py-2 text-sm text-gray-500">Nenhum produto acabado com saldo {consumption.source === 'Devolucao' ? 'devolvido' : 'disponível'} encontrado.</p>
 ) : null}
 </div>
 ) : null}
 </div>
 {consumption.finishedProductId && <select value={consumption.finishedProductLotId} onChange={(event) => { const newCons=[...formState.finishedProductConsumptions]; newCons[index].finishedProductLotId=event.target.value; setFormState(prev=>({...prev,finishedProductConsumptions:newCons})); }} className="w-44 rounded-lg border border-gray-300 px-2 py-2 text-sm"><option value="">Selecione o lote</option>{finishedProductLots.filter(lot => lot.produtoId === consumption.finishedProductId && (lot.id === consumption.finishedProductLotId || (consumption.source === 'Devolucao' ? (lot.devolvido ?? 0) > 0 : lot.disponivel > 0))).map(lot => <option key={lot.id} value={lot.id}>{lot.lote} · {consumption.source === 'Devolucao' ? lot.devolvido : lot.disponivel} kg</option>)}</select>}
 <div className="w-24">
 <input
 type="number"
 min="0"
 step="0.0001"
 placeholder="Qtd"
 value={consumption.quantity}
 onChange={(e) => {
 const newCons = [...formState.finishedProductConsumptions];
 newCons[index].quantity = e.target.value;
 setFormState(prev => ({ ...prev, finishedProductConsumptions: newCons }));
 }}
 className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
 />
 </div>
 {(() => { const prod = getFinishedProductById(consumption.finishedProductId); return prod?.tracksPieces || prod?.tracksQuantityAndWeight; })() && <div className="w-24"><input type="number" min="1" step="1" placeholder="Peças" value={consumption.pieces} onChange={(e) => { const newCons=[...formState.finishedProductConsumptions]; newCons[index].pieces=e.target.value; setFormState(prev=>({...prev,finishedProductConsumptions:newCons})); }} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" /></div>}
 <button
 type="button"
 onClick={() => {
 const newCons = [...formState.finishedProductConsumptions];
 newCons.splice(index, 1);
 setFormState(prev => ({ ...prev, finishedProductConsumptions: newCons }));
 setFinishedProductSearchTerms((terms) => {
   const nextTerms: Record<number, string> = {};
   Object.entries(terms).forEach(([key, value]) => {
     const currentIndex = Number(key);
     if (currentIndex < index) nextTerms[currentIndex] = value;
     if (currentIndex > index) nextTerms[currentIndex - 1] = value;
   });
   return nextTerms;
 });
 }}
 className="p-2 text-red-500 hover:bg-red-50 rounded-md"
 >
 <Trash2 className="h-4 w-4" />
 </button>
 </div>
 ))}
 </div>
 </div>

 {selectedLot || selectedProduct ? (
 <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 mt-4">
 {selectedLot && selectedProduct?.productionType !== 'Secundario' ? (
 <p>Volume disponivel do lote: {(selectedLot.volumeDisponivel ?? 0).toLocaleString('pt-BR')} L</p>
 ) : null}
 {selectedProduct ? (
 <p>Rendimento teorico do produto: {selectedProduct.theoreticalYield.toFixed(2)}</p>
 ) : null}
 <p className="mt-2 text-blue-700">
 {selectedProduct?.productionType === 'Secundario'
   ? 'A finalização da OP vai consumir os coprodutos e insumos em estoque para gerar o lote acabado.'
   : 'A finalizacao da OP vai consumir o leite e insumos para gerar lote acabado.'}
 </p>
 </div>
 ) : null}

 {submitError ? (
 <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
 {submitError}
 </div>
 ) : null}
 </div>
 <div className="flex justify-end gap-3 border-t border-gray-200 p-6">
 <button
 onClick={closeCreateModal}
 className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
 >
 Cancelar
 </button>
 <button
 onClick={() => void handleSave()}
 disabled={saving}
 className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
 >
 {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
 {editingOrder ? 'Salvar' : 'Criar OP'}
 </button>
 </div>
 </div>
 </div>
 ) : null}

 {selectedOrder ? (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
 <div className="w-full max-w-xl rounded-xl bg-white">
 <div className="border-b border-gray-200 p-6">
 <h3 className="text-xl font-bold text-gray-900">Finalizar ordem de producao</h3>
 <p className="mt-1 text-sm text-gray-600">{selectedOrder.numero}</p>
 </div>
 <div className="space-y-4 p-6">
 <div className="grid grid-cols-2 gap-4 rounded-lg bg-gray-50 p-4 text-sm">
 {selectedOrder.tipoProducao === 'Secundario' ? (
 <InfoRow label="Tipo de Produção" value="Secundário (Derivados)" />
 ) : (
 <InfoRow label="Litros planejados" value={`${(selectedOrder.litrosUtilizados ?? 0).toLocaleString('pt-BR')} L`} />
 )}
 <InfoRow
 label="Produto"
 value={getFinishedProductById(selectedOrder.produtoId)?.name || '-'}
 />
 </div>

 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <div>
 <label htmlFor="input-qtd-produzida" className="mb-1 block text-sm font-medium text-gray-700">
 Quantidade produzida ({getUnitSymbol(getFinishedProductById(selectedOrder.produtoId)?.unitId) || 'kg'}) *
 </label>
 <input
 id="input-qtd-produzida"
 type="number"
 min="0"
 step="0.01"
 value={completeForm.actualQuantityProduced}
 onChange={(event) =>
 setCompleteForm({ ...completeForm, actualQuantityProduced: event.target.value })
 }
 placeholder="0"
 className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
 />
 </div>
 <div>
 <label htmlFor="input-unidades-comerciais" className="mb-1 block text-sm font-medium text-gray-700">
 Unidades comerciais {selectedOrder.apresentacaoComercial || getFinishedProductById(selectedOrder.produtoId)?.commercialPresentation ? `(${selectedOrder.apresentacaoComercial || getFinishedProductById(selectedOrder.produtoId)?.commercialPresentation})` : '(embalagens)'}
 </label>
 <input
 id="input-unidades-comerciais"
 type="number"
 min="0"
 step="1"
 value={completeForm.actualCommercialUnitsProduced}
 onChange={(event) =>
 setCompleteForm({ ...completeForm, actualCommercialUnitsProduced: event.target.value })
 }
 placeholder="Ex: 500"
 className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
 />
 </div>
 </div>

 {(selectedOrder.tamanhoEmbalagem || getFinishedProductById(selectedOrder.produtoId)?.packageSize) ? (
 <p className="text-xs text-gray-500">
 Embalagem padrão cadastrada: <strong className="text-gray-700">{selectedOrder.tamanhoEmbalagem || getFinishedProductById(selectedOrder.produtoId)?.packageSize}</strong>
 </p>
 ) : null}

 {(() => {
   const totalQty = Number(completeForm.actualQuantityProduced);
   const commUnits = Number(completeForm.actualCommercialUnitsProduced);
   const pkgStr = selectedOrder.tamanhoEmbalagem || getFinishedProductById(selectedOrder.produtoId)?.packageSize;
   const prod = getFinishedProductById(selectedOrder.produtoId);
   const unitSymbol = (getUnitSymbol(prod?.unitId) || 'kg').trim();
   const unitLower = unitSymbol.toLowerCase();
   if (totalQty > 0 && commUnits > 0) {
     const isVolume = ['l', 'ml'].includes(unitLower);

     let actualNormalized: number;
     if (isVolume) {
       actualNormalized = unitLower === 'l' ? (totalQty / commUnits) * 1000 : (totalQty / commUnits);
     } else {
       actualNormalized = unitLower === 'g' ? (totalQty / commUnits) : (totalQty / commUnits) * 1000;
     }

     let targetNormalized: number | null = null;
     if (pkgStr) {
       const lower = pkgStr.toLowerCase().trim();
       if (lower.includes('kg')) {
         const num = parseFloat(lower.replace('kg', '').replace(',', '.').trim());
         if (!isNaN(num)) targetNormalized = num * 1000;
       } else if (lower.includes('ml')) {
         const num = parseFloat(lower.replace('ml', '').replace(',', '.').trim());
         if (!isNaN(num)) targetNormalized = num;
       } else if (lower.includes('l')) {
         const num = parseFloat(lower.replace('l', '').replace(',', '.').trim());
         if (!isNaN(num)) targetNormalized = num * 1000;
       } else if (lower.includes('g')) {
         const num = parseFloat(lower.replace('g', '').replace(',', '.').trim());
         if (!isNaN(num)) targetNormalized = num;
       } else {
         const num = parseFloat(lower.replace(',', '.'));
         if (!isNaN(num)) targetNormalized = num <= 5 ? num * 1000 : num;
       }
     }
     const variancePercent = targetNormalized ? ((actualNormalized - targetNormalized) / targetNormalized) * 100 : null;

     const labelTitle = isVolume ? 'Volume médio por unidade:' : 'Peso médio por unidade:';
     let formattedValue: string;
     if (isVolume) {
       formattedValue = actualNormalized >= 1000
         ? `${(actualNormalized / 1000).toFixed(3)} L`
         : `${actualNormalized.toFixed(1)} mL`;
     } else {
       formattedValue = actualNormalized >= 1000
         ? `${(actualNormalized / 1000).toFixed(3)} kg`
         : `${actualNormalized.toFixed(1)} g`;
     }

     return (
       <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 space-y-1">
         <div className="flex justify-between font-medium">
           <span>{labelTitle}</span>
           <span className="font-semibold text-slate-900">
             {formattedValue} / unidade
           </span>
         </div>
         {targetNormalized !== null && variancePercent !== null && (
           <div className="flex justify-between items-center pt-1 border-t border-slate-200">
             <span>Padrão esperado ({pkgStr}):</span>
             <span className={`font-semibold ${Math.abs(variancePercent) > 5 ? 'text-amber-700' : 'text-emerald-700'}`}>
               {variancePercent > 0
                 ? `+${variancePercent.toFixed(1)}% (${isVolume ? 'acima do volume' : 'sobrepeso'})`
                 : `${variancePercent.toFixed(1)}% (variação)`}
             </span>
           </div>
         )}
       </div>
     );
   }
   return null;
 })()}

 <p className="mt-2 text-xs text-gray-500">
 Se nenhum consumo for informado, o sistema calcula a receita pela ficha técnica e aplica FIFO aos insumos automaticamente.
 </p>

 {(() => { const prod = getFinishedProductById(selectedOrder.produtoId); return prod?.tracksPieces === true || prod?.tracksQuantityAndWeight === true; })() ? <div className="mt-4">
 <label className="mb-1 block text-sm font-medium text-gray-700">Peças produzidas *</label>
 <input type="number" min="1" step="1" inputMode="numeric" value={completeForm.actualPiecesProduced} onChange={(event) => setCompleteForm({ ...completeForm, actualPiecesProduced: event.target.value })} placeholder="0" className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500" />
 <p className="mt-1 text-xs text-gray-500">Registre o total de peças correspondente ao peso produzido.</p>
 </div> : null}

 <div className="mt-6 border-t border-gray-200 pt-4">
 <div className="mb-2 flex items-center justify-between">
 <label className="block text-sm font-medium text-gray-700">
 Coprodutos Gerados (Ex: Creme)
 </label>
 <button
 type="button"
 onClick={() =>
 setCompleteForm((prev) => ({
 ...prev,
 generatedCoProducts: [
 ...prev.generatedCoProducts,
 { id: Math.random().toString(36).substring(7), productId: '', quantity: '' },
 ],
 }))
 }
 className="text-sm font-medium text-blue-600 hover:text-blue-800"
 >
 + Adicionar coproduto
 </button>
 </div>
 <div className="space-y-3">
 {completeForm.generatedCoProducts.map((coProduct, index) => (
 <div key={coProduct.id} className="flex gap-3">
 <div className="flex-1">
 <select
 value={coProduct.productId}
 onChange={(e) => {
 const newCoProducts = [...completeForm.generatedCoProducts];
 newCoProducts[index].productId = e.target.value;
 setCompleteForm((prev) => ({ ...prev, generatedCoProducts: newCoProducts }));
 }}
 className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
 >
 <option value="">Selecione um produto...</option>
 {finishedProducts
 .filter((p) => p.active)
 .sort((a, b) => a.name.localeCompare(b.name))
 .map((p) => (
 <option key={p.id} value={p.id}>
 {p.name}
 </option>
 ))}
 </select>
 </div>
 <div className="w-32">
 <input
 type="number"
 step="0.001"
 min="0"
 value={coProduct.quantity}
 onChange={(e) => {
 const newCoProducts = [...completeForm.generatedCoProducts];
 newCoProducts[index].quantity = e.target.value;
 setCompleteForm((prev) => ({ ...prev, generatedCoProducts: newCoProducts }));
 }}
 placeholder="Qtd"
 className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
 />
 </div>
 <button
 type="button"
 onClick={() => {
 const newCoProducts = completeForm.generatedCoProducts.filter((_, i) => i !== index);
 setCompleteForm((prev) => ({ ...prev, generatedCoProducts: newCoProducts }));
 }}
 className="text-red-500 hover:text-red-700 text-sm font-medium"
 >
 Remover
 </button>
 </div>
 ))}
 </div>
 </div>

 {submitError ? (
 <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
 {submitError}
 </div>
 ) : null}
 </div>
 <div className="flex justify-end gap-3 border-t border-gray-200 p-6">
 <button
 onClick={closeCompleteModal}
 className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
 >
 Cancelar
 </button>
 <button
 onClick={() => void handleComplete()}
 disabled={completing}
 className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
 >
 {completing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
 Finalizar OP
 </button>
 </div>
 </div>
 </div>
 ) : null}

  <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
    <AlertDialogContent className="max-w-xl">
      <AlertDialogHeader>
        <AlertDialogTitle className="flex items-center gap-2">
          <XCircle className="w-5 h-5 text-red-600" />
          Cancelar Ordem de Produção {selectedOpForCancel?.numero ? `(${selectedOpForCancel.numero})` : ''}
        </AlertDialogTitle>
        <AlertDialogDescription>
          A OP será cancelada de forma atômica e rastreável. Todas as reservas e consumos elegíveis serão estornados no estoque.
        </AlertDialogDescription>
      </AlertDialogHeader>

      {loadingPreview ? (
        <div className="flex flex-col items-center justify-center py-8 space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <p className="text-sm text-gray-500">Verificando saldos, dependências e efeitos da OP...</p>
        </div>
      ) : cancellationPreview ? (
        <div className="space-y-4">
          {!cancellationPreview.canCancel ? (
            <div className="rounded-lg bg-red-50 p-4 border border-red-200">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-red-900 text-sm">Cancelamento automático bloqueado</p>
                  <p className="text-sm text-red-700 mt-1">{cancellationPreview.blockReason}</p>
                  <p className="text-xs text-red-600 mt-2 font-medium">
                    Orientação: Produtos acabados gerados por esta OP já tiveram movimentações posteriores (vendas, consumo ou saídas). Para manter a integridade fiscal e contábil, desfaça os atendimentos vinculados antes de cancelar a OP.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg bg-amber-50/70 p-3.5 border border-amber-200 space-y-2 text-xs text-amber-900">
              <p className="font-semibold flex items-center gap-1.5 text-amber-950">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                Efeitos que serão revertidos atomicamente:
              </p>
              <ul className="list-disc list-inside space-y-1 pl-1 text-amber-800">
                {cancellationPreview.reversals.milk.length > 0 ? (
                  cancellationPreview.reversals.milk.map((m, idx) => (
                    <li key={idx}>Leite: <strong>+{m.liters.toLocaleString('pt-BR')} L</strong> retornam ao lote <strong>{m.lotCode}</strong></li>
                  ))
                ) : (
                  <li>Nenhum volume de leite a reverter</li>
                )}
                {cancellationPreview.reversals.supplies.map((s, idx) => (
                  <li key={idx}>Insumo: <strong>+{s.quantity.toLocaleString('pt-BR')} {s.unitSymbol}</strong> de {s.supplyName} (lote {s.lotCode})</li>
                ))}
                {cancellationPreview.reversals.reprocessedLots.map((r, idx) => (
                  <li key={idx}>Reprocessamento: <strong>+{r.quantity.toLocaleString('pt-BR')} kg{r.pieces != null ? ` (${r.pieces} peças)` : ''}</strong> ao lote {r.lotCode}</li>
                ))}
                {cancellationPreview.reversals.generatedLotsToVoid.map((g, idx) => (
                  <li key={idx} className="text-rose-800">Lote gerado a anular: <strong>{g.lotCode}</strong> ({g.productName} · {g.quantityProduced.toLocaleString('pt-BR')} kg{g.quantityPieces != null ? ` / ${g.quantityPieces} peças` : ''})</li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Motivo do cancelamento * <span className="text-xs text-gray-500 font-normal">(mínimo 3 caracteres, registrado para auditoria)</span>
            </label>
            <textarea
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              disabled={!cancellationPreview.canCancel}
              rows={3}
              placeholder="Explique obrigatoriamente por que esta ordem de produção está sendo cancelada..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-100 disabled:text-gray-400"
            />
          </div>
        </div>
      ) : null}

      <AlertDialogFooter>
        <AlertDialogCancel disabled={isDeleting}>Fechar</AlertDialogCancel>
        <AlertDialogAction
          disabled={isDeleting || !cancellationPreview?.canCancel || cancelReason.trim().length < 3}
          className="bg-red-600 hover:bg-red-700 focus:ring-red-600 disabled:bg-red-300 disabled:cursor-not-allowed"
          onClick={(e) => {
            e.preventDefault();
            void handleCancel();
          }}
        >
          {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Confirmar Cancelamento da OP
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>

  {historyOrder ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white p-6">
          <div>
            <h3 className="text-xl font-bold text-gray-900">Histórico da produção</h3>
            <p className="mt-1 text-sm text-gray-600">{historyOrder.numero}</p>
          </div>
          <button onClick={() => setHistoryOrder(null)} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>
        <div className="p-6">
          {historyLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin" /> Carregando histórico...
            </div>
          ) : historyError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{historyError}</div>
          ) : historyEvents.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-600">
              Esta OP foi criada antes da implantação do histórico visual e ainda não possui eventos registrados.
            </div>
          ) : (
            <div className="relative space-y-6 before:absolute before:bottom-3 before:left-[7px] before:top-3 before:w-px before:bg-gray-200">
              {historyEvents.map((event) => {
                const changedKeys = Array.from(new Set([
                  ...Object.keys(event.beforeState),
                  ...Object.keys(event.afterState),
                ]));
                return (
                  <div key={event.id} className="relative pl-8">
                    <span className={`absolute left-0 top-1 h-4 w-4 rounded-full border-2 border-white ring-1 ${event.eventType === 'operation_failed' ? 'bg-red-500 ring-red-200' : event.eventType.includes('cancel') || event.eventType.includes('revers') ? 'bg-amber-500 ring-amber-200' : event.eventType === 'balance_reconciled' ? 'bg-violet-500 ring-violet-200' : 'bg-blue-500 ring-blue-200'}`} />
                    <div className="rounded-lg border border-gray-200 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-gray-900">{event.title}</p>
                          <p className="mt-1 text-sm text-gray-600">{event.description}</p>
                        </div>
                        <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600">
                          {event.createdAt.toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-gray-500">Por {event.actorName}</p>
                      {changedKeys.length > 0 ? (
                        <details className="mt-3 text-xs">
                          <summary className="cursor-pointer font-medium text-blue-700">Ver alterações</summary>
                          <div className="mt-2 space-y-1 rounded bg-gray-50 p-3 text-gray-700">
                            {changedKeys.map((key) => (
                              <div key={key} className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                                <span className="truncate text-gray-500">{eventFieldLabels[key] ?? key}</span>
                                <span className="truncate">{formatEventValue(key, event.beforeState[key])}</span>
                                <span className="text-gray-400">→</span>
                                <span className="truncate text-right font-medium">{formatEventValue(key, event.afterState[key])}</span>
                              </div>
                            ))}
                          </div>
                        </details>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  ) : null}

  {viewOrder ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white shadow-xl">
        <div className="border-b border-gray-200 p-6 flex justify-between items-center sticky top-0 bg-white z-10">
          <div>
            <h3 className="text-xl font-bold text-gray-900">Detalhes da Ordem de Produção</h3>
            <p className="mt-1 text-sm text-gray-600">{viewOrder.numero}</p>
          </div>
          <button
            onClick={() => setViewOrder(null)}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>
        <div className="p-6 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h4 className="font-semibold text-gray-900 border-b pb-2">Informações Gerais</h4>
              <div className="space-y-3 text-sm">
                <InfoRow label="Status" value={<StatusBadge status={viewOrder.status} /> as unknown as string} />
                <InfoRow label="Tipo de Produção" value={viewOrder.tipoProducao === 'Secundario' ? 'Secundário (Derivados)' : 'Primário'} />
                <InfoRow label="Data de Início" value={new Date(viewOrder.dataInicio).toLocaleString('pt-BR')} />
                {viewOrder.dataFinalizacao && (
                  <InfoRow label="Data de Finalização" value={new Date(viewOrder.dataFinalizacao).toLocaleString('pt-BR')} />
                )}
                <InfoRow label="Produto" value={getFinishedProductById(viewOrder.produtoId)?.name || '-'} />
                {viewOrder.apresentacaoComercial || viewOrder.tamanhoEmbalagem ? (
                  <InfoRow label="Apresentação" value={`${viewOrder.apresentacaoComercial || ''}${viewOrder.tamanhoEmbalagem ? ` (${viewOrder.tamanhoEmbalagem})` : ''}`} />
                ) : null}
                <InfoRow 
                  label="Lote de Leite" 
                  value={viewOrder.tipoProducao === 'Secundario' ? 'Não aplicável (sem leite cru)' : (lotes.find((l) => l.id === viewOrder.loteLeiteId)?.codigo || '-')} 
                />
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="font-semibold text-gray-900 border-b pb-2">Produção e Rendimento</h4>
              <div className="space-y-3 text-sm">
                <InfoRow label="Litros Utilizados" value={viewOrder.tipoProducao === 'Secundario' ? '—' : `${(viewOrder.litrosUtilizados ?? 0).toLocaleString('pt-BR')} L`} />
                <InfoRow 
                  label="Quantidade Produzida" 
                  value={
                    viewOrder.quantidadeProduzida != null
                      ? `${viewOrder.quantidadeProduzida} ${getUnitSymbol(getFinishedProductById(viewOrder.produtoId)?.unitId)}`
                      : '-'
                  } 
                />
                {viewOrder.unidadesComerciaisProduzidas != null && viewOrder.unidadesComerciaisProduzidas > 0 ? (
                  <InfoRow 
                    label="Unidades Comerciais" 
                    value={`${viewOrder.unidadesComerciaisProduzidas} ${viewOrder.apresentacaoComercial || 'un'}`} 
                  />
                ) : null}
                <InfoRow 
                  label="Rendimento Real" 
                  value={viewOrder.rendimentoReal ? viewOrder.rendimentoReal.toFixed(2) : '-'} 
                />
              </div>
            </div>
          </div>

          {viewOrder.insumos && viewOrder.insumos.length > 0 && (
            <div className="space-y-4">
              <h4 className="font-semibold text-gray-900 border-b pb-2">Insumos e Matérias-primas Utilizados</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">Insumo/Matéria-prima</th>
                      <th className="px-4 py-2 text-right font-medium">Quantidade Utilizada</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {viewOrder.insumos.map((insumo, idx) => {
                      const item = getSupplyItemById(insumo.insumoId);
                      return (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-4 py-3">{item?.name || insumo.insumoId}</td>
                          <td className="px-4 py-3 text-right font-medium">
                            {insumo.quantidade} {getUnitSymbol(item?.unitId)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {viewOrder.produtosAcabadosConsumidos && viewOrder.produtosAcabadosConsumidos.length > 0 && (
            <div className="space-y-4">
              <h4 className="font-semibold text-gray-900 border-b pb-2">Produtos Acabados Utilizados</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">Produto</th>
                      <th className="px-4 py-2 text-left font-medium">Lote de origem</th>
                      <th className="px-4 py-2 text-left font-medium">Origem</th>
                      <th className="px-4 py-2 text-right font-medium">Quantidade utilizada</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {viewOrder.produtosAcabadosConsumidos.map((consumo, idx) => {
                      const produto = consumo.produtoId
                        ? getFinishedProductById(consumo.produtoId)
                        : undefined;
                      const lote = finishedProductLots.find((item) => item.id === consumo.finishedProductLotId);

                      return (
                        <tr key={`${consumo.finishedProductLotId}-${idx}`} className="hover:bg-gray-50">
                          <td className="px-4 py-3">{produto?.name || 'Produto acabado'}</td>
                          <td className="px-4 py-3">{lote?.lote || consumo.finishedProductLotId}</td>
                          <td className="px-4 py-3">
                            <span className={consumo.origem === 'Devolucao' ? 'font-medium text-amber-700' : 'font-medium text-emerald-700'}>
                              {consumo.origem === 'Devolucao' ? 'Devolução' : 'Disponível'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-medium">
                            {consumo.quantidade.toLocaleString('pt-BR')} {getUnitSymbol(produto?.unitId)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {viewOrder.custos && (
            <div className="space-y-4">
              <h4 className="font-semibold text-gray-900 border-b pb-2">Custos da Produção</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="rounded-lg bg-gray-50 p-3">
                  <span className="block text-xs text-gray-500 mb-1">Leite</span>
                  <span className="font-medium">R$ {viewOrder.custos.custoLeite?.toFixed(2) || '0.00'}</span>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <span className="block text-xs text-gray-500 mb-1">Insumos</span>
                  <span className="font-medium">R$ {viewOrder.custos.custoInsumos?.toFixed(2) || '0.00'}</span>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <span className="block text-xs text-gray-500 mb-1">Mão de Obra</span>
                  <span className="font-medium">R$ {viewOrder.custos.custoMaoObra?.toFixed(2) || '0.00'}</span>
                </div>
                <div className="rounded-lg bg-blue-50 border border-blue-100 p-3">
                  <span className="block text-xs text-blue-600 mb-1">Custo Total</span>
                  <span className="font-bold text-blue-700">R$ {viewOrder.custos.custoTotal?.toFixed(2) || '0.00'}</span>
                </div>
              </div>
            </div>
          )}

        </div>
        <div className="border-t border-gray-200 p-6 flex justify-end">
          <button
            onClick={() => setViewOrder(null)}
            className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 hover:bg-gray-200 font-medium"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  ) : null}

  {orderToAdjust && (
    <ModalAjusteEstoqueOP
      isOpen={ajusteModalOpen}
      onClose={() => {
        setAjusteModalOpen(false);
        setOrderToAdjust(null);
      }}
      order={orderToAdjust}
      finishedProductLots={finishedProductLots}
      onSuccess={async () => {
        await loadData();
      }}
    />
  )}
  </div>
 );
}

function MetricCard({
 title,
 value,
 icon,
 iconClassName,
}: {
 title: string;
 value: string | number;
 icon: React.ReactNode;
 iconClassName: string;
}) {
 return (
 <div className="rounded-xl border border-gray-200 bg-white p-6">
 <div className="flex items-center gap-3">
 <div className={`rounded-lg p-3 ${iconClassName}`}>{icon}</div>
 <div>
 <p className="text-sm text-gray-600">{title}</p>
 <p className="text-2xl font-bold text-gray-900">{value}</p>
 </div>
 </div>
 </div>
 );
}

function StatusBadge({ status }: { status: OrdemProducao['status'] }) {
 const className =
 status === 'Finalizada'
 ? 'bg-green-100 text-green-800'
 : status === 'Em Andamento'
 ? 'bg-yellow-100 text-yellow-800'
 : 'bg-gray-100 text-gray-800';

 return <span className={`rounded-full px-2 py-1 text-xs font-medium ${className}`}>{status}</span>;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
 return (
 <div>
 <span className="text-gray-500">{label}</span>
 <p className="font-medium text-gray-900">{value}</p>
 </div>
 );
}
