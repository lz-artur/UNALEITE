import { useEffect, useState } from 'react';
import { ExternalLink, Loader2, X } from 'lucide-react';
import { format } from 'date-fns';
import { loadFinancialEntry, type FinancialEntryRecord } from '../../services/operationsApi';

export default function LancamentoFinanceiroDialog({ entryId, onClose }: { entryId: string | null; onClose: () => void }) {
  const [entry, setEntry] = useState<FinancialEntryRecord | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!entryId) return;
    setLoading(true);
    setEntry(null);
    loadFinancialEntry(entryId).then(setEntry).catch(() => undefined).finally(() => setLoading(false));
  }, [entryId]);

  if (!entryId) return null;
  const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 p-5">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Lançamento financeiro</h2>
            <p className="text-sm text-gray-500">Detalhes que compõem a movimentação</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button>
        </div>
        {loading ? <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div> : entry ? (
          <div className="space-y-5 p-5 text-sm">
            <div>
              <p className="font-semibold text-gray-900">{entry.descricao}</p>
              <p className="mt-1 text-gray-500">{entry.tipo} · {entry.categoria || 'Sem categoria'}</p>
            </div>
            <div className="grid grid-cols-2 gap-4 rounded-xl bg-gray-50 p-4">
              <div><p className="text-xs text-gray-500">Valor</p><p className="font-semibold">{money(entry.valor)}</p></div>
              <div><p className="text-xs text-gray-500">Situação</p><p className="font-semibold">{entry.statusCalculado || entry.status}</p></div>
              <div><p className="text-xs text-gray-500">Vencimento</p><p>{format(entry.dataVencimento, 'dd/MM/yyyy')}</p></div>
              <div><p className="text-xs text-gray-500">Saldo em aberto</p><p>{money(entry.saldoReceber)}</p></div>
            </div>
            {entry.recebimentos.length > 0 && <div>
              <p className="mb-2 font-medium text-gray-800">Baixas registradas</p>
              <div className="space-y-2">
                {entry.recebimentos.map(receipt => <div key={receipt.id} className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
                  <div><p>{format(receipt.dataPagamento, 'dd/MM/yyyy')} · {receipt.formaPagamento}</p><p className="text-xs text-gray-500">{receipt.observacoes || 'Sem observação'}</p></div>
                  <span className="font-medium text-green-700">{money(receipt.valor)}</span>
                </div>)}
              </div>
            </div>}
            {entry.anexoUrl && <a className="inline-flex items-center gap-2 text-blue-600 hover:underline" href={entry.anexoUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />Abrir comprovante</a>}
          </div>
        ) : <p className="p-6 text-sm text-red-600">Não foi possível carregar o lançamento.</p>}
      </div>
    </div>
  );
}
