import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
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
  });

  it('shows coherence indicator in completion modal when quantity and commercial units are informed', async () => {
    render(<Producao />);

    await waitFor(() => {
      expect(screen.getByText('OP-2026-001')).toBeInTheDocument();
    });

    // We simulate opening completion on an order
    // Render with an order in Em Produção state
    const openOrder = {
      ...mockProductionOrders[0],
      id: 'op-open',
      numero: 'OP-2026-002',
      status: 'Em Produção',
      quantidadeProduzida: null,
      unidadesComerciaisProduzidas: null,
    };
    (operationsApi.loadProductionOrders as any).mockResolvedValue([openOrder]);

    const { rerender } = render(<Producao />);
    await waitFor(() => {
      expect(screen.getByText('OP-2026-002')).toBeInTheDocument();
    });

    // Find "Finalizar" action in dropdown
    const actionButtons = screen.getAllByRole('button');
    const dotsButton = actionButtons.find((btn) => btn.querySelector('svg.lucide-more-horizontal'));
    if (dotsButton) {
      fireEvent.click(dotsButton);
      const finalizeBtn = await screen.findByText('Finalizar OP');
      fireEvent.click(finalizeBtn);

      // In completion modal:
      expect(screen.getByText('Finalizar ordem de producao')).toBeInTheDocument();
      expect(screen.getByText(/Secundário \(Derivados\)/i)).toBeInTheDocument();

      // Enter 100 kg and 500 potes
      const qtyInput = screen.getByLabelText(/Quantidade produzida/i);
      fireEvent.change(qtyInput, { target: { value: '100' } });

      const commUnitsInput = screen.getByLabelText(/Unidades comerciais/i);
      fireEvent.change(commUnitsInput, { target: { value: '500' } });

      // Average weight: 100kg / 500 = 0.200kg = 200g
      expect(screen.getByText(/Peso médio por unidade/i)).toBeInTheDocument();
      expect(screen.getByText(/200\.0 g \/ unidade/i)).toBeInTheDocument();
    }
  });
});
