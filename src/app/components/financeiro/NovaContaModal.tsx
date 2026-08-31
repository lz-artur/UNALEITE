import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { BankAccountRecord } from '../../services/operationsApi';

interface NovaContaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<BankAccountRecord> & { initial_balance?: number }) => Promise<void>;
  editingConta?: BankAccountRecord | null;
}

export default function NovaContaModal({
  isOpen,
  onClose,
  onSave,
  editingConta,
}: NovaContaModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    bank_name: '',
    agency: '',
    agency_digit: '',
    account_number: '',
    account_digit: '',
    initial_balance: 0,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (editingConta) {
      setFormData({
        name: editingConta.name || '',
        bank_name: editingConta.bank_name || '',
        agency: editingConta.agency || '',
        agency_digit: editingConta.agency_digit || '',
        account_number: editingConta.account_number || '',
        account_digit: editingConta.account_digit || '',
        initial_balance: 0,
      });
    } else {
      setFormData({
        name: '',
        bank_name: '',
        agency: '',
        agency_digit: '',
        account_number: '',
        account_digit: '',
        initial_balance: 0,
      });
    }
  }, [editingConta, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      await onSave({
        ...formData,
        active: true,
      });
      onClose();
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">
            {editingConta ? 'Editar Conta Bancária' : 'Nova Conta Bancária'}
          </h2>
          <button onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nome da Conta / Descrição *
            </label>
            <input
              required
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full rounded-lg border border-gray-300 p-2.5 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Ex: Conta Corrente BB"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Banco
            </label>
            <input
              type="text"
              value={formData.bank_name}
              onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
              className="w-full rounded-lg border border-gray-300 p-2.5 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Ex: Banco do Brasil"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Agência</label>
                <input
                  type="text"
                  value={formData.agency}
                  onChange={(e) => setFormData({ ...formData, agency: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 p-2.5 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="w-16">
                <label className="block text-sm font-medium text-gray-700 mb-1">Dígito</label>
                <input
                  type="text"
                  value={formData.agency_digit}
                  onChange={(e) => setFormData({ ...formData, agency_digit: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 p-2.5 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Conta</label>
                <input
                  type="text"
                  value={formData.account_number}
                  onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 p-2.5 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="w-16">
                <label className="block text-sm font-medium text-gray-700 mb-1">Dígito</label>
                <input
                  type="text"
                  value={formData.account_digit}
                  onChange={(e) => setFormData({ ...formData, account_digit: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 p-2.5 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {!editingConta && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Saldo Inicial (R$)
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.initial_balance}
                onChange={(e) => setFormData({ ...formData, initial_balance: parseFloat(e.target.value) || 0 })}
                className="w-full rounded-lg border border-gray-300 p-2.5 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">Este valor gerará uma movimentação de Saldo Inicial.</p>
            </div>
          )}

          <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isSubmitting ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
