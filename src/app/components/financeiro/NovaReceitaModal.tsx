import { useState, useEffect } from 'react';
import { X, Loader2, Plus, Trash2, Upload } from 'lucide-react';
import type { ContaFinanceira } from '../../data/mockData';
import { type FinancialEntryRecord, uploadFinancialAttachment } from '../../services/operationsApi';
import { toast } from 'sonner';
import { useCadastros } from '../../context/CadastrosContext';

interface Parcela {
  id: string;
  dataVencimento: string;
  valor: string;
}

interface NovaReceitaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (payloads: Omit<ContaFinanceira, 'id' | 'statusCalculado'>[]) => Promise<void>;
  initialData?: FinancialEntryRecord | null;
}

export default function NovaReceitaModal({ isOpen, onClose, onSave, initialData }: NovaReceitaModalProps) {
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [dataVencimento, setDataVencimento] = useState('');
  const [categoria, setCategoria] = useState('');
  const [status, setStatus] = useState<'Aberto' | 'Pago'>('Aberto');
  
  const [centroCusto, setCentroCusto] = useState('');
  const [subcategoriaContabil, setSubcategoriaContabil] = useState('');
  const [formaPagamento, setFormaPagamento] = useState('');
  const [tipoPagamento, setTipoPagamento] = useState('');
  const [tipoCusto, setTipoCusto] = useState<'Fixo' | 'Variável' | ''>('');
  
  const [isParcelado, setIsParcelado] = useState(false);
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  
  const [file, setFile] = useState<File | null>(null);
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setDescricao('');
    setValor('');
    setDataVencimento('');
    setCategoria('');
    setStatus('Aberto');
    setCentroCusto('');
    setSubcategoriaContabil('');
    setFormaPagamento('');
    setTipoPagamento('');
    setTipoCusto('');
    setIsParcelado(false);
    setParcelas([{ id: crypto.randomUUID(), dataVencimento: '', valor: '' }]);
    setFile(null);
  };

  useEffect(() => {
    if (initialData) {
      setDescricao(initialData.descricao);
      setValor(initialData.valor.toString());
      setDataVencimento(new Date(initialData.dataVencimento).toISOString().split('T')[0]);
      setCategoria(initialData.accountingCategoryId || initialData.categoria);
      setStatus((initialData.status === 'Pago' || initialData.statusCalculado === 'Pago') ? 'Pago' : 'Aberto');
      setCentroCusto(initialData.costCenterId || initialData.centroCusto || '');
      setSubcategoriaContabil(initialData.accountingSubcategoryId || initialData.subcategoriaContabil || '');
      setFormaPagamento(initialData.formaPagamento || '');
      setTipoPagamento(initialData.tipoPagamento || '');
      setTipoCusto(initialData.tipoCusto || '');
      setIsParcelado(false);
      setParcelas([]);
      setFile(null);
    } else {
      resetForm();
    }
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleAddParcela = () => {
    setParcelas([...parcelas, { id: crypto.randomUUID(), dataVencimento: '', valor: '' }]);
  };

  const handleRemoveParcela = (id: string) => {
    setParcelas(parcelas.filter(p => p.id !== id));
  };

  const updateParcela = (id: string, field: keyof Parcela, value: string) => {
    setParcelas(parcelas.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!descricao) return;
    
    if (status === 'Pago' && !file && !initialData?.anexoUrl) {
      toast.error('O comprovante é obrigatório para registrar uma conta como Paga.');
      return;
    }

    if (!isParcelado && (!valor || !dataVencimento)) {
      toast.error('Preencha valor e vencimento.');
      return;
    }

    if (isParcelado && parcelas.some(p => !p.valor || !p.dataVencimento)) {
      toast.error('Preencha todos os campos das parcelas.');
      return;
    }

    setIsSubmitting(true);
    try {
      let anexoUrl = initialData?.anexoUrl;
      if (file) {
        anexoUrl = await uploadFinancialAttachment(file);
      }

      const basePayload: Omit<ContaFinanceira, 'id' | 'statusCalculado' | 'valor' | 'dataVencimento'> = {
        tipo: 'Receber',
        descricao,
        categoria: accountingCategories.find(c => c.id === categoria)?.name || categoria,
        accountingCategoryId: categoria,
        status,
        centroCusto: costCenters.find(c => c.id === centroCusto)?.name || centroCusto,
        costCenterId: centroCusto,
        subcategoriaContabil: accountingSubcategories.find(s => s.id === subcategoriaContabil)?.name || subcategoriaContabil,
        accountingSubcategoryId: subcategoriaContabil,
        formaPagamento,
        tipoPagamento,
        tipoCusto: tipoCusto || undefined,
        anexoUrl,
      };

      let payloads: Omit<ContaFinanceira, 'id' | 'statusCalculado'>[] = [];

      if (isParcelado && !initialData) {
        const groupId = crypto.randomUUID();
        payloads = parcelas.map((p, index) => ({
          ...basePayload,
          valor: parseFloat(p.valor.replace(',', '.')),
          dataVencimento: new Date(p.dataVencimento + 'T12:00:00'),
          installmentGroupId: groupId,
          installmentNumber: index + 1,
          descricao: `${descricao} (Parcela ${index + 1}/${parcelas.length})`,
        }));
      } else {
        payloads = [{
          ...basePayload,
          valor: parseFloat(valor.replace(',', '.')),
          dataVencimento: new Date(dataVencimento + 'T12:00:00'),
        }];
      }

      await onSave(payloads);
      resetForm();
      onClose();
    } catch (error) {
      console.error(error);
      toast.error('Erro ao salvar receita.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const { costCenters, accountingCategories, accountingSubcategories } = useCadastros();

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl my-8">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">{initialData ? 'Editar Receita' : 'Nova Receita'}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-4 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
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
          
          {!initialData && (
            <div className="flex items-center gap-2 mb-2">
              <input 
                type="checkbox" 
                id="isParcelado" 
                checked={isParcelado} 
                onChange={(e) => setIsParcelado(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="isParcelado" className="text-sm font-medium text-gray-700 cursor-pointer">
                Lançamento parcelado
              </label>
            </div>
          )}
          
          {isParcelado && !initialData ? (
            <div className="border border-gray-200 rounded-md p-3 bg-gray-50 flex flex-col gap-3">
              <h3 className="text-sm font-medium text-gray-700">Parcelas</h3>
              {parcelas.map((parcela, index) => (
                <div key={parcela.id} className="flex items-end gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Valor (R$) P. {index + 1}</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={parcela.valor}
                      onChange={(e) => updateParcela(parcela.id, 'valor', e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Vencimento P. {index + 1}</label>
                    <input
                      type="date"
                      required
                      value={parcela.dataVencimento}
                      onChange={(e) => updateParcela(parcela.id, 'dataVencimento', e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white"
                    />
                  </div>
                  {parcelas.length > 1 && (
                    <button 
                      type="button" 
                      onClick={() => handleRemoveParcela(parcela.id)}
                      className="mb-1 p-2 text-red-500 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              <button 
                type="button" 
                onClick={handleAddParcela}
                className="self-start mt-2 flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                <Plus className="w-4 h-4" /> Adicionar parcela
              </button>
            </div>
          ) : (
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
          )}
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Categoria Contábil</label>
              <select
                value={categoria}
                required
                onChange={(e) => {
                  setCategoria(e.target.value);
                  setSubcategoriaContabil('');
                }}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white"
              >
                <option value="">Selecione...</option>
                {accountingCategories.filter(c => c.active && c.entryType === 'Receber').map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Subcategoria Contábil</label>
              <select
                value={subcategoriaContabil}
                onChange={(e) => setSubcategoriaContabil(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white"
                disabled={!categoria}
                title={!categoria ? 'Selecione uma Categoria Contábil primeiro' : ''}
              >
                <option value="">{!categoria ? 'Selecione a categoria...' : 'Selecione...'}</option>
                {accountingSubcategories.filter(s => s.active && s.categoryId === categoria).map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Centro de Custo</label>
              <select
                value={centroCusto}
                onChange={(e) => setCentroCusto(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white"
              >
                <option value="">Selecione...</option>
                {costCenters.filter(c => c.active).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Situação Inicial</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as 'Aberto' | 'Pago')}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                <option value="Aberto">Em Aberto / Previsto</option>
                <option value="Pago">Pago / Baixado</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Forma de Recebimento</label>
              <select
                value={formaPagamento}
                onChange={(e) => setFormaPagamento(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Selecione...</option>
                <option value="Pix">Pix</option>
                <option value="Boleto">Boleto</option>
                <option value="Transferência">Transferência</option>
                <option value="Dinheiro">Dinheiro</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Recebimento</label>
              <select
                value={tipoPagamento}
                onChange={(e) => setTipoPagamento(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Selecione...</option>
                <option value="À vista">À vista</option>
                <option value="A prazo">A prazo</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Custo Fixo/Variável</label>
              <select
                value={tipoCusto}
                onChange={(e) => setTipoCusto(e.target.value as 'Fixo' | 'Variável' | '')}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Selecione...</option>
                <option value="Fixo">Fixo</option>
                <option value="Variável">Variável</option>
              </select>
            </div>
          </div>


          <div className="mt-2 border-t border-gray-100 pt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Comprovante {status === 'Pago' ? <span className="text-red-500">* (Obrigatório para Baixa)</span> : ''}</label>
            <div className="flex items-center gap-3">
              <label className="cursor-pointer flex items-center justify-center gap-2 bg-gray-50 border border-gray-300 rounded-md px-4 py-2 hover:bg-gray-100 transition-colors text-sm font-medium text-gray-700">
                <Upload className="w-4 h-4" /> Selecionar arquivo
                <input 
                  type="file" 
                  className="hidden" 
                  accept=".pdf,image/*"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setFile(e.target.files[0]);
                    }
                  }}
                />
              </label>
              {file && <span className="text-sm text-gray-600 truncate max-w-[200px]">{file.name}</span>}
              {!file && initialData?.anexoUrl && (
                <a href={initialData.anexoUrl} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline">
                  Ver anexo atual
                </a>
              )}
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
