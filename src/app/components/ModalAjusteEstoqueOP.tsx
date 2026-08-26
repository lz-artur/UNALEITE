import React, { useState, useEffect } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { adjustProductionOrder } from '../services/operationsApi';
import type { OrdemProducao, EstoqueProduto } from '../data/mockData';
import { useCadastros } from '../context/CadastrosContext';

interface ModalAjusteEstoqueOPProps {
  isOpen: boolean;
  onClose: () => void;
  order: OrdemProducao;
  finishedProductLots: EstoqueProduto[];
  onSuccess: () => Promise<void>;
}

export function ModalAjusteEstoqueOP({
  isOpen,
  onClose,
  order,
  finishedProductLots,
  onSuccess,
}: ModalAjusteEstoqueOPProps) {
  const { getFinishedProductById } = useCadastros();
  
  const [adjustments, setAdjustments] = useState<Array<{
    finishedProductLotId: string;
    productName: string;
    oldQuantity: number;
    newQuantity: string;
    lotCode: string;
    availableQuantity: number;
    diff: number;
  }>>([]);
  
  const [reason, setReason] = useState('Maturação');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && order) {
      // Find all lots associated with this order
      const orderLots = finishedProductLots.filter(l => l.ordemProducaoId === order.id);
      
      const initialAdjustments = orderLots.map(l => {
        const product = getFinishedProductById(l.produtoId);
        return {
          finishedProductLotId: l.id,
          productName: product?.name || 'Produto Desconhecido',
          oldQuantity: l.quantidade, // quantityProduced
          newQuantity: String(l.quantidade),
          lotCode: l.lote,
          availableQuantity: l.disponivel,
          diff: 0,
        };
      });

      setAdjustments(initialAdjustments);
      setReason('Maturação');
      setNotes('');
      setError(null);
    }
  }, [isOpen, order, finishedProductLots, getFinishedProductById]);

  if (!isOpen) return null;

  const handleQuantityChange = (index: number, value: string) => {
    const newAdjustments = [...adjustments];
    newAdjustments[index].newQuantity = value;
    
    const newVal = Number(value);
    const oldVal = newAdjustments[index].oldQuantity;
    newAdjustments[index].diff = isNaN(newVal) ? 0 : newVal - oldVal;
    
    setAdjustments(newAdjustments);
  };

  const handleSave = async () => {
    setError(null);

    // Validations
    if (!reason) {
      setError('O motivo é obrigatório.');
      return;
    }
    if (!notes) {
      setError('A justificativa é obrigatória.');
      return;
    }

    const payloadAdjustments = [];

    for (const adj of adjustments) {
      const newVal = Number(adj.newQuantity);
      if (isNaN(newVal) || newVal < 0) {
        setError(`Quantidade inválida para o produto ${adj.productName}`);
        return;
      }
      
      const newAvailable = adj.availableQuantity + adj.diff;
      if (newAvailable < 0) {
        setError(`A quantidade informada para o lote ${adj.lotCode} deixaria o estoque disponível negativo (${newAvailable}).`);
        return;
      }

      if (adj.diff !== 0) {
        payloadAdjustments.push({
          finishedProductLotId: adj.finishedProductLotId,
          newQuantity: newVal,
        });
      }
    }

    if (payloadAdjustments.length === 0) {
      setError('Nenhuma alteração de quantidade foi feita.');
      return;
    }

    setIsSubmitting(true);
    try {
      await adjustProductionOrder(order.id, {
        adjustments: payloadAdjustments,
        reason,
        notes,
      });
      await onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao ajustar estoque da OP.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-3xl rounded-xl bg-white shadow-xl">
        <div className="border-b border-gray-200 p-6 flex justify-between items-center">
          <div>
            <h3 className="text-xl font-bold text-gray-900">Ajuste de Estoque da OP</h3>
            <p className="mt-1 text-sm text-gray-600">{order.numero}</p>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex items-start gap-2">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="rounded-lg bg-blue-50 border border-blue-100 p-4 text-sm text-blue-800">
            Esta ação permite ajustar a quantidade efetivamente produzida desta OP.
            O sistema calculará a diferença e atualizará o estoque disponível do respectivo lote.
            <br className="my-1"/>
            <strong>Atenção:</strong> Se o lote já teve saídas/vendas, a nova quantidade não pode resultar em estoque negativo.
          </div>

          <div className="space-y-4">
            <h4 className="font-semibold text-gray-900 border-b pb-2">Produtos Gerados pela OP</h4>
            
            {adjustments.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhum lote de produto acabado encontrado para esta OP.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">Produto / Lote</th>
                      <th className="px-4 py-2 text-right font-medium">Qtd Produzida Anterior</th>
                      <th className="px-4 py-2 text-right font-medium">Estoque Disponível</th>
                      <th className="px-4 py-2 text-right font-medium">Nova Qtd Produzida *</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {adjustments.map((adj, idx) => (
                      <tr key={adj.finishedProductLotId}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{adj.productName}</div>
                          <div className="text-xs text-gray-500">{adj.lotCode}</div>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-500">
                          {adj.oldQuantity}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={adj.availableQuantity + adj.diff < 0 ? 'text-red-600 font-medium' : 'text-gray-500'}>
                            {adj.availableQuantity} {adj.diff !== 0 && `(→ ${adj.availableQuantity + adj.diff})`}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={adj.newQuantity}
                            onChange={(e) => handleQuantityChange(idx, e.target.value)}
                            className={`w-28 rounded-lg border px-3 py-2 text-right focus:outline-none focus:ring-2 ${
                              adj.availableQuantity + adj.diff < 0 
                                ? 'border-red-500 focus:ring-red-500' 
                                : 'border-gray-300 focus:ring-blue-500'
                            }`}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="space-y-4 pt-4 border-t border-gray-200">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Motivo do Ajuste *</label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="Maturação">Maturação (Perda de peso/secagem)</option>
                <option value="Outros">Outros (Correção de erro, etc)</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Justificativa Detalhada *</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Descreva o motivo do ajuste..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 h-24 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 p-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 hover:bg-gray-200 font-medium"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={isSubmitting || adjustments.length === 0}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed font-medium"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Salvar Ajuste
          </button>
        </div>
      </div>
    </div>
  );
}
