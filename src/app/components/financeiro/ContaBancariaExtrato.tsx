import React, { useState, useEffect } from 'react';
import { ArrowLeft, ExternalLink, SlidersHorizontal } from 'lucide-react';
import { createBankAccountBalanceAdjustment, getBankAccountStatement } from '../../services/operationsApi';
import type { BankAccountRecord } from '../../services/operationsApi';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface ContaBancariaExtratoProps {
  conta: BankAccountRecord;
  onBack: () => void;
  onOpenEntry: (id: string) => void;
}

export default function ContaBancariaExtrato({ conta, onBack, onOpenEntry }: ContaBancariaExtratoProps) {
  const [entries, setEntries] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);

  useEffect(() => {
    fetchStatement();
  }, [startDate, endDate]);

  const fetchStatement = async () => {
    try {
      setIsLoading(true);
      const data = await getBankAccountStatement(conta.id, startDate, endDate);
      setEntries(data || []);
    } catch (error) {
      toast.error('Erro ao carregar extrato');
    } finally {
      setIsLoading(false);
    }
  };

  const entriesWithBalance = entries.map(entry => ({ ...entry, isCredit: entry.entry_type === 'Receber' || entry.entry_type === 'Entrada' }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Extrato: {conta.name}</h1>
          <p className="text-gray-500">
            {conta.bank_name} {conta.agency ? `Ag: ${conta.agency}` : ''} {conta.account_number ? `Cc: ${conta.account_number}` : ''}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div className="flex items-center gap-2">
            <div>
              <label className="mb-1 text-xs text-gray-500">Data Inicial</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 text-xs text-gray-500">Data Final</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex items-end gap-3 text-right">
            <button onClick={() => setAdjustmentOpen(true)} className="mb-1 inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"><SlidersHorizontal className="h-4 w-4" />Ajustar saldo</button>
            <div>
            <p className="text-sm font-medium text-gray-500">Saldo Atual da Conta</p>
            <p className={`text-xl font-bold ${conta.current_balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              R$ {(conta.current_balance || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-gray-500">Carregando extrato...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-6 py-4 font-medium">Data</th>
                  <th className="px-6 py-4 font-medium">Descrição</th>
                  <th className="px-6 py-4 font-medium">Categoria</th>
                  <th className="px-6 py-4 font-medium text-right">Valor</th>
                  <th className="px-6 py-4 font-medium text-center">Comprovante</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {entriesWithBalance.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-gray-500">
                      Nenhuma movimentação no período selecionado.
                    </td>
                  </tr>
                ) : (
                  entriesWithBalance.map((entry) => (
                    <tr key={entry.id} onClick={() => onOpenEntry(entry.financial_entry_id)} className="cursor-pointer transition-colors hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        {format(new Date(entry.effective_date), 'dd/MM/yyyy')}
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-medium text-gray-900">{entry.description}</p>
                        <span className="text-xs text-green-600">Efetivado</span>
                      </td>
                      <td className="px-6 py-4 text-gray-600">
                        {entry.category}
                      </td>
                      <td className={`px-6 py-4 text-right font-medium whitespace-nowrap ${entry.isCredit ? 'text-green-600' : 'text-red-600'}`}>
                        {entry.isCredit ? '+ ' : '- '}
                        R$ {Number(entry.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {entry.attachment_url && (
                          <a 
                            href={entry.attachment_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center text-blue-600 hover:text-blue-800"
                            title="Ver Anexo"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {adjustmentOpen && <BalanceAdjustmentModal conta={conta} onClose={() => setAdjustmentOpen(false)} onSaved={() => { setAdjustmentOpen(false); void fetchStatement(); toast.success('Ajuste de saldo registrado no extrato.'); }} />}
    </div>
  );
}

function BalanceAdjustmentModal({ conta, onClose, onSaved }: { conta: BankAccountRecord; onClose: () => void; onSaved: () => void }) {
  const formatCurrencyInput = (value: number) => value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const parseCurrencyInput = (value: string) => Number(value.replace(/\./g, '').replace(',', '.')) || 0;
  const [targetBalance, setTargetBalance] = useState(formatCurrencyInput(conta.current_balance || 0));
  const [justification, setJustification] = useState('');
  const [managerApproval, setManagerApproval] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try { await createBankAccountBalanceAdjustment(conta.id, { targetBalance: parseCurrencyInput(targetBalance), justification, managerApproval }); onSaved(); } catch { /* mensagem é exibida pela API */ } finally { setSaving(false); }
  };
  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"><form onSubmit={submit} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"><h2 className="text-lg font-semibold text-gray-900">Ajuste de saldo</h2><p className="mt-1 text-sm text-gray-500">Use somente após conferência. O ajuste gera uma movimentação auditável no extrato.</p><div className="mt-5 space-y-4"><label className="block text-sm font-medium text-gray-700">Saldo conferido (R$)<input required type="text" inputMode="decimal" value={targetBalance} onChange={e => { const cents = e.target.value.replace(/\D/g, ''); setTargetBalance(formatCurrencyInput(Number(cents || 0) / 100)); }} className="mt-1 w-full rounded-lg border border-gray-300 p-2.5" /></label><label className="block text-sm font-medium text-gray-700">Justificativa <span className="text-red-500">*</span><textarea required value={justification} onChange={e => setJustification(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 p-2.5" rows={3} placeholder="Descreva a divergência e a conferência realizada" /></label><label className="block text-sm font-medium text-gray-700">Autorização do gestor <span className="text-red-500">*</span><input required value={managerApproval} onChange={e => setManagerApproval(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 p-2.5" placeholder="Nome ou referência da aprovação" /></label></div><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Cancelar</button><button disabled={saving} className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">{saving ? 'Registrando...' : 'Registrar ajuste'}</button></div></form></div>;
}
