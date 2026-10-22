import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import PagamentoModal from './PagamentoModal';
import { toast } from 'sonner';
import type { FinancialEntryRecord } from '../../services/operationsApi';

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('../../context/CadastrosContext', () => ({
  useCadastros: () => ({
    bankAccounts: [
      { id: 'bank-1', name: 'Banco do Brasil - CC', active: true },
      { id: 'bank-2', name: 'Sicoob - Poupanca', active: false },
    ],
    paymentMethods: [
      { id: 'method-1', name: 'Pix', active: true },
      { id: 'method-2', name: 'Boleto', active: true },
      { id: 'method-3', name: 'Cheque', active: false },
    ],
    suppliers: [{ id: 'supplier-1', name: 'Laticínios Fornecedor SA' }],
    producers: [{ id: 'producer-1', name: 'Produtor João da Silva' }],
  }),
}));

describe('PagamentoModal Component', () => {
  const mockOnClose = vi.fn();
  const mockOnConfirm = vi.fn();

  const mockEntry: FinancialEntryRecord = {
    id: 'entry-payable-1',
    tipo: 'Pagar',
    descricao: 'Compra de Fermentos e Embalagens',
    valor: 1000,
    dataVencimento: new Date('2026-11-10'),
    status: 'Aberto',
    categoria: 'Insumos',
    fornecedorId: 'supplier-1',
    valorPago: 400,
    saldoPagar: 600,
    valorRecebido: 400,
    saldoReceber: 600,
    recebimentos: [],
    pagamentos: [],
    itensRateio: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <PagamentoModal isOpen={false} entry={mockEntry} onClose={mockOnClose} onConfirm={mockOnConfirm} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders modal with summary information, supplier and prefilled remaining balance', () => {
    render(
      <PagamentoModal isOpen={true} entry={mockEntry} onClose={mockOnClose} onConfirm={mockOnConfirm} />
    );

    expect(screen.getByText('Registrar pagamento')).toBeInTheDocument();
    expect(screen.getByText('Compra de Fermentos e Embalagens')).toBeInTheDocument();
    expect(screen.getByText('Laticínios Fornecedor SA')).toBeInTheDocument();
    expect(screen.getByText('R$ 1.000,00')).toBeInTheDocument(); // Total
    expect(screen.getByText('R$ 400,00')).toBeInTheDocument(); // Já pago
    expect(screen.getByText('R$ 600,00')).toBeInTheDocument(); // Saldo a pagar

    const valorInput = screen.getByLabelText(/Valor pago/i) as HTMLInputElement;
    expect(valorInput.value).toBe('600.00');
  });

  it('validates and blocks payment higher than remaining balance', async () => {
    render(
      <PagamentoModal isOpen={true} entry={mockEntry} onClose={mockOnClose} onConfirm={mockOnConfirm} />
    );

    const valorInput = screen.getByLabelText(/Valor pago/i);
    fireEvent.change(valorInput, { target: { value: '700.00' } });

    const formaSelect = screen.getByLabelText(/Forma de pagamento/i);
    fireEvent.change(formaSelect, { target: { value: 'Pix' } });

    const submitBtn = screen.getByRole('button', { name: /Confirmar pagamento/i });
    fireEvent.submit(submitBtn.closest('form')!);

    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('O valor não pode ultrapassar o saldo a pagar')
    );
    expect(mockOnConfirm).not.toHaveBeenCalled();
  });

  it('shows dynamic warning when a partial payment is informed', () => {
    render(
      <PagamentoModal isOpen={true} entry={mockEntry} onClose={mockOnClose} onConfirm={mockOnConfirm} />
    );

    const valorInput = screen.getByLabelText(/Valor pago/i);
    fireEvent.change(valorInput, { target: { value: '250.00' } });

    expect(
      screen.getByText(/Após este pagamento, o lançamento continuará parcialmente aberto com saldo a pagar de R\$ 350,00/i)
    ).toBeInTheDocument();
  });

  it('submits partial payment successfully and calls onConfirm with correct payload', async () => {
    mockOnConfirm.mockResolvedValueOnce(undefined);

    render(
      <PagamentoModal isOpen={true} entry={mockEntry} onClose={mockOnClose} onConfirm={mockOnConfirm} />
    );

    const valorInput = screen.getByLabelText(/Valor pago/i);
    fireEvent.change(valorInput, { target: { value: '200.00' } });

    const formaSelect = screen.getByLabelText(/Forma de pagamento/i);
    fireEvent.change(formaSelect, { target: { value: 'Pix' } });

    const contaSelect = screen.getByLabelText(/Conta de origem/i);
    fireEvent.change(contaSelect, { target: { value: 'bank-1' } });

    const obsTextarea = screen.getByPlaceholderText(/Informações adicionais deste pagamento/i);
    fireEvent.change(obsTextarea, { target: { value: '1ª parcela do acordo de fornecimento' } });

    const submitBtn = screen.getByRole('button', { name: /Confirmar pagamento/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockOnConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          valor: 200,
          formaPagamento: 'Pix',
          contaBancariaId: 'bank-1',
          observacoes: '1ª parcela do acordo de fornecimento',
        }),
        undefined
      );
    });

    expect(mockOnClose).toHaveBeenCalled();
  });
});
