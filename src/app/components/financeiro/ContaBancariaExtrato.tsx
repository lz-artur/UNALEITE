import React, { useState, useEffect } from 'react';
import { ArrowLeft, Search, Download, ExternalLink } from 'lucide-react';
import { getBankAccountStatement } from '../../services/operationsApi';
import type { BankAccountRecord } from '../../services/operationsApi';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface ContaBancariaExtratoProps {
  conta: BankAccountRecord;
  onBack: () => void;
}

export default function ContaBancariaExtrato({ conta, onBack }: ContaBancariaExtratoProps) {
  const [entries, setEntries] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

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

  // Calcular saldos progressivos
  // Como as entradas vêm ordenadas da mais recente para a mais antiga, precisamos calcular o saldo
  // Sabemos o current_balance. O saldo final da linha N é:
  // Se for a mais recente (index 0), saldo após = current_balance se o filtro não excluir entradas recentes,
  // mas como o extrato pode ser filtrado, a melhor abordagem é calcular o saldo inicial do período 
  // e depois ir somando. Como a API não retorna o saldo inicial do período, faremos uma aproximação local 
  // assumindo que as movimentações listadas são todas as do período, partindo de 0 se não for o extrato completo?
  // Para ser preciso no extrato, precisamos calcular na ordem cronológica (reverse).
  
  const entriesChronological = [...entries].reverse();
  
  // Se não tem filtro, o último saldo é o current_balance
  // Não é tão simples com filtro. Vamos apenas listar o Valor e o Tipo da movimentação para facilitar.
  // E calcular um saldo progressivo relativo ao que está em tela.
  
  let runningBalance = 0;
  const entriesWithBalance = entriesChronological.map(entry => {
    const isCredit = entry.entry_type === 'Receber' || entry.entry_type === 'Entrada';
    const amount = Number(entry.amount);
    
    // As transfers use category name, but let's just rely on entry_type
    runningBalance += (isCredit ? amount : -amount);
    
    return {
      ...entry,
      isCredit,
      runningBalance
    };
  }).reverse(); // Volta para mais recente primeiro

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
          <div className="text-right">
            <p className="text-sm font-medium text-gray-500">Saldo Atual da Conta</p>
            <p className={`text-xl font-bold ${conta.current_balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              R$ {(conta.current_balance || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
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
                    <tr key={entry.id} className="transition-colors hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        {format(new Date(entry.due_date), 'dd/MM/yyyy')}
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-medium text-gray-900">{entry.description}</p>
                        {entry.status === 'Cancelado' && (
                          <span className="text-xs text-red-500">Cancelado</span>
                        )}
                        {entry.status === 'Aberto' && (
                          <span className="text-xs text-orange-500">Pendente (Agendado)</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-gray-600">
                        {entry.accounting_categories?.name || entry.category}
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
    </div>
  );
}
