import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import NovaDespesaModal from './NovaDespesaModal';
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

describe('NovaDespesaModal Component', () => {
  const mockOnSave = vi.fn();
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <NovaDespesaModal isOpen={false} onClose={mockOnClose} onSave={mockOnSave} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders modal content when isOpen is true', () => {
    render(
      <NovaDespesaModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />
    );
    expect(screen.getByText('Nova Despesa')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Ex: Fornecedor de Insumos - Coalho')).toBeInTheDocument();
  });

  it('shows error if trying to save Pago without file', async () => {
    render(
      <NovaDespesaModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />
    );

    fireEvent.change(screen.getByPlaceholderText('Ex: Fornecedor de Insumos - Coalho'), {
      target: { value: 'Teste Despesa' },
    });
    
    const valorInput = screen.getAllByPlaceholderText('0.00')[0];
    fireEvent.change(valorInput, { target: { value: '100' } });
    const dateInput = document.querySelector('input[type="date"]');
    fireEvent.change(dateInput!, { target: { value: '2023-12-01' } });
    
    // Select status Pago
    const situacaoSelect = document.querySelectorAll('select')[3];
    fireEvent.change(situacaoSelect, { target: { value: 'Pago' } });

    // Clica em Salvar
    const salvarBtn = screen.getByText('Salvar Despesa');
    fireEvent.click(salvarBtn);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('O comprovante é obrigatório para registrar uma conta como Paga.');
      expect(mockOnSave).not.toHaveBeenCalled();
    });
  });

  it('submits correctly for a non-parcelado entry', async () => {
    render(
      <NovaDespesaModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />
    );

    fireEvent.change(screen.getByPlaceholderText('Ex: Fornecedor de Insumos - Coalho'), {
      target: { value: 'Luz' },
    });
    
    const valorInput = screen.getAllByPlaceholderText('0.00')[0];
    fireEvent.change(valorInput, { target: { value: '150.50' } });
    
    const dateInput = document.querySelector('input[type="date"]');
    fireEvent.change(dateInput!, { target: { value: '2023-12-01' } });

    const salvarBtn = screen.getByText('Salvar Despesa');
    fireEvent.click(salvarBtn);

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledTimes(1);
      const payloadArg = mockOnSave.mock.calls[0][0];
      expect(payloadArg).toHaveLength(1);
      expect(payloadArg[0].descricao).toBe('Luz');
      expect(payloadArg[0].valor).toBe(150.5);
    });
  });

  it('toggles parcelamento and submits multiple payloads', async () => {
    render(
      <NovaDespesaModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />
    );

    fireEvent.change(screen.getByPlaceholderText('Ex: Fornecedor de Insumos - Coalho'), {
      target: { value: 'Compra Máquina' },
    });

    // Ativar parcelamento
    const checkboxParcelado = screen.getByLabelText('Lançamento parcelado');
    fireEvent.click(checkboxParcelado);

    // Verificar se renderizou a primeira parcela
    expect(screen.getByText('Parcelas')).toBeInTheDocument();
    
    // Preencher a 1a parcela
    const valorP1 = screen.getByPlaceholderText('0.00');
    fireEvent.change(valorP1, { target: { value: '1000' } });
    
    // O vencimento da primeira parcela pode ser capturado pelo label mais facilmente
    // Usando apenas os campos da tela
    const allDateInputs = document.querySelectorAll('input[type="date"]');
    fireEvent.change(allDateInputs[0], { target: { value: '2023-10-01' } });

    // Adicionar segunda parcela
    const addParcelaBtn = screen.getByText(/Adicionar parcela/);
    fireEvent.click(addParcelaBtn);

    const allValorInputs = screen.getAllByPlaceholderText('0.00');
    expect(allValorInputs).toHaveLength(2);

    fireEvent.change(allValorInputs[1], { target: { value: '2000' } });
    
    const allDateInputsUpdated = document.querySelectorAll('input[type="date"]');
    fireEvent.change(allDateInputsUpdated[1], { target: { value: '2023-11-01' } });

    // Submeter
    const salvarBtn = screen.getByText('Salvar Despesa');
    fireEvent.click(salvarBtn);

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledTimes(1);
      const payloadArgs = mockOnSave.mock.calls[0][0];
      expect(payloadArgs).toHaveLength(2);
      expect(payloadArgs[0].valor).toBe(1000);
      expect(payloadArgs[1].valor).toBe(2000);
      expect(payloadArgs[0].installmentGroupId).toBeTruthy();
      expect(payloadArgs[0].installmentGroupId).toBe(payloadArgs[1].installmentGroupId);
      expect(payloadArgs[0].installmentNumber).toBe(1);
      expect(payloadArgs[1].installmentNumber).toBe(2);
    });
  });
});
