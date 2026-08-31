import React, { useState, useEffect } from 'react';
import { Plus, ArrowLeftRight, Landmark, Search, FileText, ChevronRight } from 'lucide-react';
import { loadBankAccounts, createBankAccount, updateBankAccount, transferFunds } from '../../services/operationsApi';
import type { BankAccountRecord } from '../../services/operationsApi';
import NovaContaModal from './NovaContaModal';
import TransferenciaModal from './TransferenciaModal';
import ContaBancariaExtrato from './ContaBancariaExtrato';
import { toast } from 'sonner';

export default function ContasBancarias() {
  const [contas, setContas] = useState<BankAccountRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modals
  const [isNovaContaModalOpen, setIsNovaContaModalOpen] = useState(false);
  const [isTransferenciaModalOpen, setIsTransferenciaModalOpen] = useState(false);
  const [editingConta, setEditingConta] = useState<BankAccountRecord | null>(null);
  
  // Extrato
  const [selectedConta, setSelectedConta] = useState<BankAccountRecord | null>(null);

  useEffect(() => {
    fetchContas();
  }, []);

  const fetchContas = async () => {
    try {
      setIsLoading(true);
      const data = await loadBankAccounts();
      setContas(data);
    } catch (error) {
      toast.error('Erro ao carregar contas bancárias');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveConta = async (data: Partial<BankAccountRecord> & { initial_balance?: number }) => {
    try {
      if (editingConta) {
        await updateBankAccount(editingConta.id, data);
        toast.success('Conta atualizada com sucesso');
      } else {
        await createBankAccount(data);
        toast.success('Conta criada com sucesso');
      }
      fetchContas();
    } catch (error) {
      toast.error('Erro ao salvar conta');
      throw error;
    }
  };

  const handleTransfer = async (data: any) => {
    try {
      await transferFunds(data);
      toast.success('Transferência realizada com sucesso');
      fetchContas();
    } catch (error) {
      toast.error('Erro ao realizar transferência');
      throw error;
    }
  };

  const filteredContas = contas.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.bank_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const saldoConsolidado = contas.reduce((acc, c) => acc + (c.current_balance || 0), 0);

  if (selectedConta) {
    return (
      <ContaBancariaExtrato 
        conta={selectedConta} 
        onBack={() => {
          setSelectedConta(null);
          fetchContas(); // refresh in case of changes
        }} 
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contas Bancárias</h1>
          <p className="text-gray-500">Gerencie suas contas e saldos disponíveis</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsTransferenciaModalOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            <ArrowLeftRight className="h-4 w-4" />
            Transferência
          </button>
          <button
            onClick={() => {
              setEditingConta(null);
              setIsNovaContaModalOpen(true);
            }}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Nova Conta
          </button>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-50 text-green-600">
              <Landmark className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Saldo Consolidado</p>
              <h3 className="text-2xl font-bold text-gray-900">
                R$ {saldoConsolidado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </h3>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 p-4 sm:p-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar contas..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-gray-200 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-gray-500">Carregando contas...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-6 py-4 font-medium">Conta</th>
                  <th className="px-6 py-4 font-medium">Banco</th>
                  <th className="px-6 py-4 font-medium">Agência/Conta</th>
                  <th className="px-6 py-4 font-medium text-right">Saldo Atual</th>
                  <th className="px-6 py-4 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredContas.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-gray-500">
                      Nenhuma conta encontrada
                    </td>
                  </tr>
                ) : (
                  filteredContas.map((conta) => (
                    <tr key={conta.id} className="transition-colors hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                            <Landmark className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{conta.name}</p>
                            {!conta.active && (
                              <span className="text-xs text-red-500">Inativa</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-600">{conta.bank_name || '-'}</td>
                      <td className="px-6 py-4 text-gray-600">
                        {conta.agency ? `${conta.agency}${conta.agency_digit ? '-' + conta.agency_digit : ''}` : ''}
                        {conta.agency && conta.account_number ? ' / ' : ''}
                        {conta.account_number ? `${conta.account_number}${conta.account_digit ? '-' + conta.account_digit : ''}` : ''}
                        {!conta.agency && !conta.account_number && '-'}
                      </td>
                      <td className="px-6 py-4 text-right font-medium text-gray-900">
                        R$ {(conta.current_balance || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setEditingConta(conta);
                              setIsNovaContaModalOpen(true);
                            }}
                            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                            title="Editar Conta"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => setSelectedConta(conta)}
                            className="flex items-center gap-1 rounded-lg p-2 text-blue-600 transition-colors hover:bg-blue-50"
                            title="Ver Extrato"
                          >
                            <FileText className="h-4 w-4" />
                            Extrato
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <NovaContaModal
        isOpen={isNovaContaModalOpen}
        onClose={() => {
          setIsNovaContaModalOpen(false);
          setEditingConta(null);
        }}
        onSave={handleSaveConta}
        editingConta={editingConta}
      />

      <TransferenciaModal
        isOpen={isTransferenciaModalOpen}
        onClose={() => setIsTransferenciaModalOpen(false)}
        onSave={handleTransfer}
        contas={contas}
      />
    </div>
  );
}
