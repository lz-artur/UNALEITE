import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import NovaReceitaModal from './NovaReceitaModal';
import * as operationsApi from '../../services/operationsApi';
import { toast } from 'sonner';

vi.mock('../../services/operationsApi', () => ({
  uploadFinancialAttachment: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('../../context/CadastrosContext', () => ({
  useCadastros: () => ({
    contasBancarias: [],
    centrosCusto: [],
    categoriasContabeis: [],
    accountingCategories: [],
    accountingSubcategories: [],
    costCenters: [],
    bankAccounts: [],
    paymentMethods: [],
    paymentTypes: [],
  }),
}));

describe('NovaReceitaModal Component', () => {
  const mockOnSave = vi.fn();
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <NovaReceitaModal isOpen={false} onClose={mockOnClose} onSave={mockOnSave} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders modal content when isOpen is true', () => {
    render(
      <NovaReceitaModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />
    );
    expect(screen.getByText('Nova Receita')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Ex: Venda Supermercado Bom Preço')).toBeInTheDocument();
  });

  it('shows error if trying to save Pago sem comprovante', async () => {
    render(
      <NovaReceitaModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />
    );

    fireEvent.change(screen.getByPlaceholderText('Ex: Venda Supermercado Bom Preço'), {
      target: { value: 'Teste Receita' },
    });
    
    const valorInput = screen.getAllByPlaceholderText('0.00')[0];
    fireEvent.change(valorInput, { target: { value: '100' } });
    const dateInput = document.querySelector('input[type="date"]');
    fireEvent.change(dateInput!, { target: { value: '2023-12-01' } });
    
    const situacaoSelect = document.querySelectorAll('select')[3];
    fireEvent.change(situacaoSelect, { target: { value: 'Pago' } });

    const salvarBtn = screen.getByText('Salvar Receita');
    fireEvent.click(salvarBtn);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('O comprovante é obrigatório para registrar uma conta como Paga.');
      expect(mockOnSave).not.toHaveBeenCalled();
    });
  });

  it('submits correctly for a non-parcelado entry', async () => {
    render(
      <NovaReceitaModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />
    );

    fireEvent.change(screen.getByPlaceholderText('Ex: Venda Supermercado Bom Preço'), {
      target: { value: 'Receita 1' },
    });
    
    const valorInput = screen.getAllByPlaceholderText('0.00')[0];
    fireEvent.change(valorInput, { target: { value: '150.50' } });
    
    const dateInput = document.querySelector('input[type="date"]');
    fireEvent.change(dateInput!, { target: { value: '2023-12-01' } });

    const salvarBtn = screen.getByText('Salvar Receita');
    fireEvent.click(salvarBtn);

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledTimes(1);
      const payloadArg = mockOnSave.mock.calls[0][0];
      expect(payloadArg).toHaveLength(1);
      expect(payloadArg[0].descricao).toBe('Receita 1');
      expect(payloadArg[0].valor).toBe(150.5);
    });
  });

  it('toggles parcelamento and submits multiple payloads', async () => {
    render(
      <NovaReceitaModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />
    );

    fireEvent.change(screen.getByPlaceholderText('Ex: Venda Supermercado Bom Preço'), {
      target: { value: 'Venda Parcelada' },
    });

    const checkboxParcelado = screen.getByLabelText('Lançamento parcelado');
    fireEvent.click(checkboxParcelado);

    expect(screen.getByText('Parcelas')).toBeInTheDocument();
    
    const valorP1 = screen.getByPlaceholderText('0.00');
    fireEvent.change(valorP1, { target: { value: '1000' } });
    
    const allDateInputs = document.querySelectorAll('input[type="date"]');
    fireEvent.change(allDateInputs[0], { target: { value: '2023-10-01' } });

    const addParcelaBtn = screen.getByText(/Adicionar parcela/);
    fireEvent.click(addParcelaBtn);

    const allValorInputs = screen.getAllByPlaceholderText('0.00');
    fireEvent.change(allValorInputs[1], { target: { value: '2000' } });
    
    const allDateInputsUpdated = document.querySelectorAll('input[type="date"]');
    fireEvent.change(allDateInputsUpdated[1], { target: { value: '2023-11-01' } });

    const salvarBtn = screen.getByText('Salvar Receita');
    fireEvent.click(salvarBtn);

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledTimes(1);
      const payloadArgs = mockOnSave.mock.calls[0][0];
      expect(payloadArgs).toHaveLength(2);
      expect(payloadArgs[0].valor).toBe(1000);
      expect(payloadArgs[1].valor).toBe(2000);
      expect(payloadArgs[0].installmentGroupId).toBe(payloadArgs[1].installmentGroupId);
      expect(payloadArgs[0].installmentNumber).toBe(1);
      expect(payloadArgs[1].installmentNumber).toBe(2);
    });
  });
});
