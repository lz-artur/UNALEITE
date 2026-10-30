import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Producao from './Producao';
import * as CadastrosContext from '../context/CadastrosContext';
import * as operationsApi from '../services/operationsApi';

vi.mock('../context/CadastrosContext', () => ({
  useCadastros: vi.fn(),
}));

vi.mock('../services/operationsApi', () => ({
  createProductionOrder: vi.fn(),
  updateProductionOrder: vi.fn(),
  completeProductionOrder: vi.fn(),
  loadMilkLots: vi.fn(),
  loadProductionOrders: vi.fn(),
  cancelProductionOrder: vi.fn(),
  loadProductionOrderEvents: vi.fn(),
  loadSupplyLots: vi.fn(),
  loadFinishedProductLots: vi.fn(),
}));

describe('Producao Component - Secondary Production and Coproducts', () => {
  const mockProducts = [
    {
      id: 'prod-queijo',
      code: 'QMINAS',
      name: 'Queijo Minas Frescal',
      active: true,
      unitId: 'unit-kg',
      productionType: 'Primario',
      theoreticalYield: 10,
      tracksPieces: true,
      standardWeight: 0.5,
      weightVariancePercent: 5,
    },
    {
      id: 'prod-manteiga',
      code: 'MANT-POTE',
      name: 'Manteiga de Primeira Qualidade',
      active: true,
      unitId: 'unit-kg',
      productionType: 'Secundario',
      commercialPresentation: 'Pote',
      packageSize: '200g',
      theoreticalYield: 1,
    },
    {
      id: 'prod-creme',
      code: 'CREME',
      name: 'Creme de Leite 40%',
      active: true,
      unitId: 'unit-kg',
      productionType: 'Primario',
      theoreticalYield: 1,
    },
  ];

  const mockMilkLots = [
    {
      id: 'milk-1',
      codigo: 'LEITE-001',
      volumeLitros: 1000,
      volumeDisponivel: 1000,
      status: 'Aprovado',
    },
  ];

  const mockSupplyLots = [
    {
      id: 'sup-lot-1',
      supplyItemId: 'item-sal',
      supplyItemName: 'Sal Refinado',
      availableQuantity: 50,
      unitId: 'unit-kg',
    },
  ];

  const mockFinishedProductLots = [
    {
      id: 'lot-creme-1',
      produtoId: 'prod-creme',
      lote: 'CREME-001',
      disponivel: 100,
      devolvido: 0,
    },
  ];

  const mockProductionOrders = [
    {
      id: 'op-1',
      numero: 'OP-2026-001',
      produtoId: 'prod-manteiga',
      tipoProducao: 'Secundario',
      loteLeiteId: null,
      litrosUtilizados: 0,
      quantidadeProduzida: 50,
      unidadesComerciaisProduzidas: 250,
      apresentacaoComercial: 'Pote',
      tamanhoEmbalagem: '200g',
      status: 'Finalizada',
      rendimentoReal: 1,
      dataInicio: new Date('2026-02-01T10:00:00Z'),
      dataFinalizacao: new Date('2026-02-01T14:00:00Z'),
    },
  ];

  const mockCadastros = {
    finishedProducts: mockProducts,
    getFinishedProductById: vi.fn((id) => mockProducts.find((p) => p.id === id)),
    getUnitSymbol: vi.fn((unitId) => (unitId === 'unit-kg' ? 'kg' : 'L')),
    getSupplyItemById: vi.fn((id) => ({ id, name: 'Insumo Teste', unitId: 'unit-kg' })),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (CadastrosContext.useCadastros as any).mockReturnValue(mockCadastros);
    (operationsApi.loadProductionOrders as any).mockResolvedValue(mockProductionOrders);
    (operationsApi.loadMilkLots as any).mockResolvedValue(mockMilkLots);
    (operationsApi.loadSupplyLots as any).mockResolvedValue(mockSupplyLots);
    (operationsApi.loadFinishedProductLots as any).mockResolvedValue(mockFinishedProductLots);
    (operationsApi.createProductionOrder as any).mockResolvedValue({ id: 'op-new' });
    (operationsApi.completeProductionOrder as any).mockResolvedValue({ order: {}, productLot: {} });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the orders list displaying Secundário badge and commercial units', async () => {
    render(<Producao />);

    await waitFor(() => {
      expect(screen.getByText('OP-2026-001')).toBeInTheDocument();
    });

    // Check that Secundário badge is displayed
    expect(screen.getByText('Secundário')).toBeInTheDocument();

    // Check that "Sem leite" or "—" is shown in milk column
    expect(screen.getByText('Sem leite')).toBeInTheDocument();

    // Check commercial presentation
    expect(screen.getByText(/250 Pote/i)).toBeInTheDocument();
  });

  it('displays secondary production notice and hides milk inputs when secondary product is chosen', async () => {
    render(<Producao />);

    await waitFor(() => {
      expect(screen.getByText('Nova OP')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Nova OP'));

    // Select secondary product (Manteiga)
    const productSelect = screen.getByLabelText(/Produto a fabricar/i);
    fireEvent.change(productSelect, { target: { value: 'prod-manteiga' } });

    // Should display secondary production banner
    expect(screen.getByText(/Fabricação a partir de Derivados \/ Coprodutos/i)).toBeInTheDocument();
    expect(screen.getByText(/não consome leite cru/i)).toBeInTheDocument();

    // Should NOT have the milk lot input
    expect(screen.queryByLabelText(/Lote de leite \*/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancelar'));
  });

  it('shows coherence indicator in completion modal when quantity and commercial units are informed', async () => {
    const openOrder = {
      ...mockProductionOrders[0],
      id: 'op-open',
      numero: 'OP-2026-002',
      status: 'Em Andamento',
      quantidadeProduzida: null,
      unidadesComerciaisProduzidas: null,
    };
    (operationsApi.loadProductionOrders as any).mockResolvedValue([openOrder]);

    render(<Producao />);
    await waitFor(() => {
      expect(screen.getByText('OP-2026-002')).toBeInTheDocument();
    });

    const dotsButton = screen.getByLabelText('Ações da OP');
    fireEvent.click(dotsButton);
    const finalizeBtn = await screen.findByText('Finalizar OP');
    fireEvent.click(finalizeBtn);

    expect(screen.getByText('Finalizar ordem de producao')).toBeInTheDocument();
    expect(screen.getByText(/Secundário \(Derivados\)/i)).toBeInTheDocument();

    const qtyInput = document.getElementById('input-qtd-produzida') as HTMLInputElement;
    fireEvent.change(qtyInput, { target: { value: '100' } });

    const commUnitsInput = screen.getByLabelText(/Unidades comerciais/i);
    fireEvent.change(commUnitsInput, { target: { value: '500' } });

    expect(screen.getByText(/Peso médio por unidade/i)).toBeInTheDocument();
    expect(screen.getByText(/200\.0 g \/ unidade/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancelar'));
  });

  it('displays non-blocking variance alert when completed weight diverges from standard weight tolerance', async () => {
    const openOrder = {
      id: 'op-queijo',
      numero: 'OP-QUEIJO-001',
      produtoId: 'prod-queijo',
      produtoNome: 'Queijo Minas Frescal',
      status: 'Em Andamento',
      dataInicio: new Date('2026-10-30T10:00:00Z'),
      litrosUtilizados: 1000,
      quantidadeProduzida: null,
      quantidadePecas: null,
    };
    (operationsApi.loadProductionOrders as any).mockResolvedValue([openOrder]);

    render(<Producao />);
    await waitFor(() => {
      expect(screen.getByText('OP-QUEIJO-001')).toBeInTheDocument();
    });

    const dotsButton = screen.getByLabelText('Ações da OP');
    fireEvent.click(dotsButton);
    const finalizeBtn = await screen.findByText('Finalizar OP');
    fireEvent.click(finalizeBtn);

    await screen.findByText('Finalizar ordem de producao');

    const qtyInput = document.getElementById('input-qtd-produzida') as HTMLInputElement;
    fireEvent.change(qtyInput, { target: { value: '40' } });

    const piecesInput = document.getElementById('actualPiecesProduced') as HTMLInputElement;
    fireEvent.change(piecesInput, { target: { value: '100' } });

    const submitBtn = screen.getByTestId('btn-confirm-complete-op');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      const dialog = document.querySelector('[role="alertdialog"]');
      expect(dialog).toBeTruthy();
      expect(dialog?.textContent).toContain('Atenção: Variação de Peso Fora da Tolerância');
      expect(dialog?.textContent).toContain('Cancelar para corrigir');
      expect(dialog?.textContent).toContain('Prosseguir e Finalizar');
    });

    fireEvent.click(screen.getByText(/Prosseguir e Finalizar/i));
    await waitFor(() => {
      expect(operationsApi.completeProductionOrder).toHaveBeenCalledWith(expect.objectContaining({
        orderId: 'op-queijo',
        actualQuantityProduced: 40,
        actualPiecesProduced: 100,
      }));
    });
  });
});
