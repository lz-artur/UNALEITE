import { useEffect, useState } from 'react';
import { ArrowLeft, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import { loadFinancialPosition, type BankStatementMovement, type FinancialPositionEntry, type FinancialPositionRecord } from '../../services/operationsApi';
import { format } from 'date-fns';
import { toast } from 'sonner';

type Detail = { title: string; subtitle: string; movements: Array<BankStatementMovement | FinancialPositionEntry> };

export default function PosicaoFinanceira({ onBack, onOpenEntry }: { onBack: () => void; onOpenEntry: (id: string) => void }) {
  const [positions, setPositions] = useState<FinancialPositionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Detail | null>(null);
  const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const refresh = async () => {
    setLoading(true);
    try { setPositions(await loadFinancialPosition()); } catch { toast.error('Não foi possível carregar a posição financeira.'); } finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); }, []);

  const openDetail = (title: string, subtitle: string, movements: Detail['movements']) => setDetail({ title, subtitle, movements });
  const dateOf = (item: BankStatementMovement | FinancialPositionEntry) => 'effective_date' in item ? item.effective_date : item.due_date;

  return <div className="space-y-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex gap-3">
        <button onClick={onBack} className="mt-1 rounded-lg p-2 text-gray-400 hover:bg-gray-100"><ArrowLeft className="h-5 w-5" /></button>
        <div><h1 className="text-2xl font-bold text-gray-900">Posição Financeira</h1><p className="text-gray-500">Saldo efetivado e projeções dos lançamentos vinculados a cada conta.</p></div>
      </div>
      <button onClick={() => void refresh()} className="inline-flex items-center gap-2 self-start rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"><RefreshCw className="h-4 w-4" />Atualizar</button>
    </div>
    <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">O saldo atual considera apenas movimentações efetivadas. Entradas e saídas previstas só compõem o saldo projetado.</div>
    <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
      <table className="min-w-[920px] w-full text-left text-sm"><thead className="bg-gray-50 text-gray-600"><tr><th className="px-6 py-4 font-medium">Conta</th><th className="px-6 py-4 text-right font-medium">Saldo atual</th><th className="px-6 py-4 text-right font-medium">Entradas previstas</th><th className="px-6 py-4 text-right font-medium">Saídas previstas</th><th className="px-6 py-4 text-right font-medium">Saldo projetado</th></tr></thead>
        <tbody className="divide-y divide-gray-100">{loading ? <tr><td colSpan={5} className="p-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-blue-600" /></td></tr> : positions.length === 0 ? <tr><td colSpan={5} className="p-10 text-center text-gray-500">Nenhuma conta bancária encontrada.</td></tr> : positions.map(position => <tr key={position.account.id} className="hover:bg-gray-50"><td className="px-6 py-4"><p className="font-medium text-gray-900">{position.account.name}</p><p className="text-xs text-gray-500">{position.account.bank_name || 'Banco não informado'}</p></td><AmountButton value={position.current_balance} onClick={() => openDetail('Saldo atual', position.account.name, position.details.current)} tone={position.current_balance >= 0 ? 'neutral' : 'red'} /><AmountButton value={position.expected_inflows} onClick={() => openDetail('Entradas previstas', position.account.name, position.details.inflows)} tone="green" /><AmountButton value={-position.expected_outflows} displayValue={position.expected_outflows} onClick={() => openDetail('Saídas previstas', position.account.name, position.details.outflows)} tone="red" /><AmountButton value={position.projected_balance} onClick={() => openDetail('Saldo projetado', position.account.name, [...position.details.current, ...position.details.inflows, ...position.details.outflows])} tone={position.projected_balance >= 0 ? 'green' : 'red'} /></tr>)}</tbody>
      </table>
    </div>
    {detail && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"><div className="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-xl"><div className="flex items-center justify-between border-b border-gray-100 p-5"><div><h2 className="font-semibold text-gray-900">{detail.title}</h2><p className="text-sm text-gray-500">{detail.subtitle}</p></div><button onClick={() => setDetail(null)} className="text-sm text-gray-500 hover:text-gray-800">Fechar</button></div><div className="max-h-[62vh] overflow-y-auto p-3">{detail.movements.length === 0 ? <p className="p-6 text-center text-sm text-gray-500">Nenhum lançamento considerado.</p> : detail.movements.map((item, index) => <button key={`${item.financial_entry_id}-${index}`} onClick={() => onOpenEntry(item.financial_entry_id)} className="flex w-full items-center justify-between gap-4 rounded-lg p-3 text-left hover:bg-gray-50"><div><p className="font-medium text-gray-900">{item.description}</p><p className="text-xs text-gray-500">{format(new Date(dateOf(item)), 'dd/MM/yyyy')} · {'entry_type' in item ? item.entry_type : ''}</p></div><div className="flex items-center gap-3"><span className={(item.entry_type === 'Receber' || item.entry_type === 'Entrada') ? 'font-medium text-green-700' : 'font-medium text-red-700'}>{money(item.amount)}</span><ChevronRight className="h-4 w-4 text-gray-400" /></div></button>)}</div></div></div>}
  </div>;
}

function AmountButton({ value, displayValue, onClick, tone }: { value: number; displayValue?: number; onClick: () => void; tone: 'neutral' | 'green' | 'red' }) {
  const color = tone === 'green' ? 'text-green-700' : tone === 'red' ? 'text-red-700' : 'text-gray-900';
  return <td className="px-6 py-4 text-right"><button onClick={onClick} className={`rounded-md px-2 py-1 font-semibold ${color} hover:bg-gray-100 hover:underline`}>{(displayValue ?? value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</button></td>;
}
