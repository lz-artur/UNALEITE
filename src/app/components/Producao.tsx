import { useEffect, useMemo, useState } from 'react';
import { Factory, Loader2, Plus, TrendingDown, TrendingUp, Trash2, MoreHorizontal, Edit2, Check } from 'lucide-react';
import type { LoteLeite, OrdemProducao } from '../data/mockData';
import { useCadastros } from '../context/CadastrosContext';
import {
 completeProductionOrder,
 createProductionOrder,
 updateProductionOrder,
 loadMilkLots,
 loadProductionOrders,
 deleteProductionOrder,
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

const emptyCreateForm = {
 milkLotId: '',
 productId: '',
 litersToUse: '',
 actualQuantityProduced: '',
};

const emptyCompleteForm = {
 actualQuantityProduced: '',
};

function getErrorMessage(error: unknown) {
 if (error instanceof Error) {
 return error.message;
 }

 return 'Nao foi possivel concluir a operacao.';
}

export default function Producao() {
 const [showCreateModal, setShowCreateModal] = useState(false);
 const [selectedOrder, setSelectedOrder] = useState<OrdemProducao | null>(null);
 const [ordensProducao, setOrdensProducao] = useState<OrdemProducao[]>([]);
 const [lotes, setLotes] = useState<LoteLeite[]>([]);
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
 const [viewOrder, setViewOrder] = useState<OrdemProducao | null>(null);
 const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
 const [editingOrder, setEditingOrder] = useState<OrdemProducao | null>(null);
 const { finishedProducts, getFinishedProductById, getUnitSymbol, getSupplyItemById } = useCadastros();

 const loadData = async () => {
 setLoading(true);
 setErrorMessage(null);

 try {
 const [orders, nextLotes] = await Promise.all([loadProductionOrders(), loadMilkLots()]);
 setOrdensProducao(orders);
 setLotes(nextLotes);
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

 const activeProducts = useMemo(
 () => finishedProducts.filter((product) => product.active),
 [finishedProducts],
 );

 const selectedLot = lotes.find((lote) => lote.id === formState.milkLotId);
 const selectedProduct = getFinishedProductById(formState.productId);
 const finishedOrders = ordensProducao.filter((op) => op.status === 'Finalizada');
 const averageYield =
 finishedOrders.length > 0
 ? finishedOrders.reduce((sum, op) => sum + (op.rendimentoReal || 0), 0) / finishedOrders.length
 : 0;

 const handleSave = async () => {
 const litersToUse = Number(formState.litersToUse);

 if (!formState.milkLotId || !formState.productId || litersToUse <= 0) {
 setSubmitError('Preencha lote, produto e litros planejados.');
 return;
 }

 if (!editingOrder && selectedLot && litersToUse > (selectedLot.volumeDisponivel ?? 0)) {
 setSubmitError('O lote selecionado nao possui volume disponivel suficiente.');
 return;
 }

 setSaving(true);
 setSubmitError(null);

 try {
 if (editingOrder) {
   await updateProductionOrder(editingOrder.id, {
     milkLotId: formState.milkLotId,
     productId: formState.productId,
     litersToUse,
     actualQuantityProduced: formState.actualQuantityProduced ? Number(formState.actualQuantityProduced) : undefined,
   });
 } else {
   await createProductionOrder({
     milkLotId: formState.milkLotId,
     productId: formState.productId,
     litersToUse,
   });
 }
 setShowCreateModal(false);
 setEditingOrder(null);
 setFormState(emptyCreateForm);
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

 if (actualQuantityProduced <= 0) {
 setSubmitError('Informe a quantidade produzida para finalizar a OP.');
 return;
 }

 setCompleting(true);
 setSubmitError(null);

 try {
 await completeProductionOrder({
 orderId: selectedOrder.id,
 actualQuantityProduced,
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

 const handleDelete = async () => {
 if (!itemToDelete) return;
 setIsDeleting(true);
 try {
 await deleteProductionOrder(itemToDelete);
 await loadData();
 setDeleteConfirmOpen(false);
 setItemToDelete(null);
 } catch (error) {
 setErrorMessage(getErrorMessage(error));
 } finally {
 setIsDeleting(false);
 }
 };

 const closeCreateModal = () => {
 if (saving) {
 return;
 }

 setShowCreateModal(false);
 setEditingOrder(null);
 setFormState(emptyCreateForm);
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
 <td className="px-6 py-4">{produto?.name || '-'}</td>
 <td className="px-6 py-4 text-sm">{lote?.codigo || '-'}</td>
 <td className="px-6 py-4">
 {op.litrosUtilizados.toLocaleString('pt-BR')} L
 </td>
 <td className="px-6 py-4">
 {op.quantidadeProduzida != null
 ? `${op.quantidadeProduzida} ${getUnitSymbol(produto?.unitId)}`
 : '-'}
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
              });
              setShowCreateModal(true);
              setOpenDropdownId(null);
            }}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
          >
            <Edit2 className="w-4 h-4 text-blue-500" /> Editar
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setItemToDelete(op.id);
              setDeleteConfirmOpen(true);
              setOpenDropdownId(null);
            }}
            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100 flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" /> Excluir
          </button>
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
 <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
 <div>
 <label className="mb-1 block text-sm font-medium text-gray-700">Lote de leite *</label>
 <select
 value={formState.milkLotId}
 onChange={(event) =>
 setFormState((current) => ({ ...current, milkLotId: event.target.value }))
 }
 className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
 >
 <option value="">Selecione...</option>
 {lotesAprovados.map((lote) => (
 <option key={lote.id} value={lote.id}>
 {lote.codigo} - {(lote.volumeDisponivel ?? 0).toLocaleString('pt-BR')} L disponiveis
 </option>
 ))}
 </select>
 </div>
 <div>
 <label className="mb-1 block text-sm font-medium text-gray-700">Produto *</label>
 <select
 value={formState.productId}
 onChange={(event) =>
 setFormState((current) => ({ ...current, productId: event.target.value }))
 }
 className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
 >
 <option value="">Selecione...</option>
 {activeProducts.map((produto) => (
 <option key={produto.id} value={produto.id}>
 {produto.name}
 </option>
 ))}
 </select>
 </div>
 </div>

 <div>
 <label className="mb-1 block text-sm font-medium text-gray-700">
 Litros planejados *
 </label>
 <input
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

 {selectedLot || selectedProduct ? (
 <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
 {selectedLot ? (
 <p>Volume disponivel do lote: {(selectedLot.volumeDisponivel ?? 0).toLocaleString('pt-BR')} L</p>
 ) : null}
 {selectedProduct ? (
 <p>Rendimento teorico do produto: {selectedProduct.theoreticalYield.toFixed(2)}</p>
 ) : null}
 <p className="mt-2 text-blue-700">
 A finalizacao da OP vai consumir o leite, aplicar FEFO dos insumos e gerar lote acabado.
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
 <InfoRow label="Litros planejados" value={`${selectedOrder.litrosUtilizados.toLocaleString('pt-BR')} L`} />
 <InfoRow
 label="Produto"
 value={getFinishedProductById(selectedOrder.produtoId)?.name || '-'}
 />
 </div>

 <div>
 <label className="mb-1 block text-sm font-medium text-gray-700">
 Quantidade produzida *
 </label>
 <input
 type="number"
 min="0"
 step="0.01"
 value={completeForm.actualQuantityProduced}
 onChange={(event) =>
 setCompleteForm({ actualQuantityProduced: event.target.value })
 }
 placeholder="0"
 className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
 />
 <p className="mt-2 text-xs text-gray-500">
 Se nenhum consumo manual for informado, o backend aplica FEFO automaticamente nos insumos da ficha tecnica.
 </p>
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
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Excluir Ordem de Produção</AlertDialogTitle>
        <AlertDialogDescription>
          Tem certeza que deseja excluir esta ordem de produção? Esta ação não pode ser desfeita.
          Isso restaurará os volumes de leite cru e insumos utilizados.
          A exclusão não será permitida se o lote do produto acabado já tiver sido parcialmente ou totalmente vendido.
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
                <InfoRow label="Data de Início" value={new Date(viewOrder.dataInicio).toLocaleString('pt-BR')} />
                {viewOrder.dataFinalizacao && (
                  <InfoRow label="Data de Finalização" value={new Date(viewOrder.dataFinalizacao).toLocaleString('pt-BR')} />
                )}
                <InfoRow label="Produto" value={getFinishedProductById(viewOrder.produtoId)?.name || '-'} />
                <InfoRow 
                  label="Lote de Leite" 
                  value={lotes.find((l) => l.id === viewOrder.loteLeiteId)?.codigo || '-'} 
                />
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="font-semibold text-gray-900 border-b pb-2">Produção e Rendimento</h4>
              <div className="space-y-3 text-sm">
                <InfoRow label="Litros Utilizados" value={`${viewOrder.litrosUtilizados.toLocaleString('pt-BR')} L`} />
                <InfoRow 
                  label="Quantidade Produzida" 
                  value={
                    viewOrder.quantidadeProduzida != null
                      ? `${viewOrder.quantidadeProduzida} ${getUnitSymbol(getFinishedProductById(viewOrder.produtoId)?.unitId)}`
                      : '-'
                  } 
                />
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
