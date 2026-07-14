import { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import type { ContaFinanceira } from '../../data/mockData';
import type { FinancialEntryRecord } from '../../services/operationsApi';

interface NovaReceitaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (payload: Omit<ContaFinanceira, 'id' | 'statusCalculado'>) => Promise<void>;
  initialData?: FinancialEntryRecord | null;
}

export default function NovaReceitaModal({ isOpen, onClose, onSave, initialData }: NovaReceitaModalProps) {
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [dataVencimento, setDataVencimento] = useState('');
  const [categoria, setCategoria] = useState('Vendas');
  const [status, setStatus] = useState<'Aberto' | 'Pago'>('Aberto');
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (initialData) {
      setDescricao(initialData.descricao);
      setValor(initialData.valor.toString());
      setDataVencimento(new Date(initialData.dataVencimento).toISOString().split('T')[0]);
      setCategoria(initialData.categoria);
      setStatus((initialData.status === 'Pago' || initialData.statusCalculado === 'Pago') ? 'Pago' : 'Aberto');
    } else {
      setDescricao('');
      setValor('');
      setDataVencimento('');
      setCategoria('Vendas');
      setStatus('Aberto');
    }
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!descricao || !valor || !dataVencimento) return;

    setIsSubmitting(true);
    try {
      await onSave({
        tipo: 'Receber',
        descricao,
        valor: parseFloat(valor.replace(',', '.')),
        dataVencimento: new Date(dataVencimento + 'T12:00:00'),
        categoria,
        status,
      });
      
      // Reset form
      setDescricao('');
      setValor('');
      setDataVencimento('');
      setStatus('Aberto');
      onClose();
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">{initialData ? 'Editar Receita' : 'Nova Receita'}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-4 flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
            <input
              type="text"
              required
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="Ex: Venda Supermercado Bom Preço"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valor (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="0.00"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data de Vencimento</label>
              <input
                type="date"
                required
                value={dataVencimento}
                onChange={(e) => setDataVencimento(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                <option value="Vendas">Vendas</option>
                <option value="Rendimentos">Rendimentos</option>
                <option value="Outros">Outros</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Situação Inicial</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as 'Aberto' | 'Pago')}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                <option value="Aberto">Em Aberto</option>
                <option value="Pago">Pago</option>
              </select>
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2 border-t border-gray-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 focus:outline-none disabled:bg-green-400"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Salvar Receita
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
