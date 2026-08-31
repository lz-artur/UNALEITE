import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { format } from 'date-fns';
import { CheckCircle, Loader2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { useCadastros } from '../../context/CadastrosContext';
import type { CreateFinancialReceiptPayload, FinancialEntryRecord } from '../../services/operationsApi';

interface RecebimentoModalProps {
  isOpen: boolean;
  entry: FinancialEntryRecord;
  onClose: () => void;
  onConfirm: (payload: CreateFinancialReceiptPayload, file?: File) => Promise<void>;
}

const FALLBACK_PAYMENT_METHODS = ['Pix', 'Dinheiro', 'Transferência Bancária', 'Boleto'];

function currency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function RecebimentoModal({ isOpen, entry, onClose, onConfirm }: RecebimentoModalProps) {
  const { bankAccounts, paymentMethods } = useCadastros();
  const [valor, setValor] = useState('');
  const [dataPagamento, setDataPagamento] = useState('');
  const [formaPagamento, setFormaPagamento] = useState('');
  const [contaBancariaId, setContaBancariaId] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [file, setFile] = useState<File>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const saldo = entry.saldoReceber;
  const formas = useMemo(() => {
    const activeMethods = paymentMethods.filter((method) => method.active).map((method) => method.name);
    return activeMethods.length > 0 ? activeMethods : FALLBACK_PAYMENT_METHODS;
  }, [paymentMethods]);

  useEffect(() => {
    if (!isOpen) return;
    setValor(saldo.toFixed(2));
    setDataPagamento(format(new Date(), 'yyyy-MM-dd'));
    setFormaPagamento('');
    setContaBancariaId('');
    setObservacoes('');
    setFile(undefined);
  }, [entry.id, isOpen, saldo]);

  if (!isOpen) return null;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const parsedValue = Number(valor.replace(',', '.'));

    if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
      toast.error('Informe um valor de recebimento maior que zero.');
      return;
    }
    if (parsedValue > saldo + 0.0001) {
      toast.error(`O valor não pode ultrapassar o saldo de ${currency(saldo)}.`);
      return;
    }
    if (!formaPagamento) {
      toast.error('Selecione a forma de recebimento.');
      return;
    }
    if (!dataPagamento) {
      toast.error('Informe a data do recebimento.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onConfirm({
        valor: parsedValue,
        dataPagamento,
        formaPagamento,
        contaBancariaId: contaBancariaId || undefined,
        observacoes: observacoes.trim() || undefined,
      }, file);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="w-full max-w-lg overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 p-5">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <h2 className="text-lg font-semibold text-gray-800">Registrar recebimento</h2>
          </div>
          <button type="button" onClick={onClose} disabled={isSubmitting} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex max-h-[80vh] flex-col gap-4 overflow-y-auto p-5">
          <div className="rounded-md border border-blue-100 bg-blue-50 p-3 text-sm">
            <div className="font-medium text-gray-800">{entry.descricao}</div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-gray-600">
              <div><span className="block">Total</span><strong>{currency(entry.valor)}</strong></div>
              <div><span className="block">Já recebido</span><strong className="text-green-700">{currency(entry.valorRecebido)}</strong></div>
              <div><span className="block">Saldo</span><strong className="text-blue-700">{currency(saldo)}</strong></div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Valor recebido (R$) <span className="text-red-500">*</span></label>
              <input
                type="number"
                min="0.01"
                max={saldo}
                step="0.01"
                required
                value={valor}
                onChange={(event) => setValor(event.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Data do recebimento <span className="text-red-500">*</span></label>
              <input
                type="date"
                required
                value={dataPagamento}
                onChange={(event) => setDataPagamento(event.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Forma de recebimento <span className="text-red-500">*</span></label>
              <select
                required
                value={formaPagamento}
                onChange={(event) => setFormaPagamento(event.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Selecione...</option>
                {formas.map((forma) => <option key={forma} value={forma}>{forma}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Conta de destino</label>
              <select
                value={contaBancariaId}
                onChange={(event) => setContaBancariaId(event.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Sem conta / caixa</option>
                {bankAccounts.filter((account) => account.active).map((account) => (
                  <option key={account.id} value={account.id}>{account.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Observações</label>
            <textarea
              rows={2}
              value={observacoes}
              onChange={(event) => setObservacoes(event.target.value)}
              className="w-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Informações adicionais deste recebimento"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Comprovante (opcional)</label>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600 hover:bg-gray-100">
              <Upload className="h-5 w-5 text-gray-400" />
              <span className="max-w-[340px] truncate">{file?.name || 'Selecionar PDF ou imagem'}</span>
              <input type="file" accept=".pdf,image/*" className="hidden" onChange={(event) => setFile(event.target.files?.[0])} />
            </label>
          </div>

          {Number(valor || 0) > 0 && Number(valor || 0) < saldo && (
            <p className="rounded-md bg-amber-50 p-3 text-xs text-amber-800">
              Após este recebimento, o lançamento continuará parcialmente aberto com saldo de {currency(Math.max(0, saldo - Number(valor)))}.
            </p>
          )}

          <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
            <button type="button" onClick={onClose} disabled={isSubmitting} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              Cancelar
            </button>
            <button type="submit" disabled={isSubmitting} className="flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:bg-green-400">
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar recebimento
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
