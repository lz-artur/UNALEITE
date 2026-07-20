import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import RecepcaoLeite from './RecepcaoLeite';
import * as CadastrosContext from '../context/CadastrosContext';
import * as operationsApi from '../services/operationsApi';

// Mock contexts and apis
vi.mock('../context/CadastrosContext', () => ({
  useCadastros: vi.fn(),
}));

vi.mock('../services/operationsApi', () => ({
  createMilkReception: vi.fn(),
  loadMilkLots: vi.fn(),
  loadMilkLotDetail: vi.fn(),
  updateMilkReception: vi.fn(),
  deleteMilkReception: vi.fn(),
}));

describe('RecepcaoLeite Component', () => {
  const mockUseCadastros = {
    producers: [{ id: 'prod-1', name: 'Produtor 1', active: true }],
    routes: [{ id: 'route-1', name: 'Rota 1', active: true }],
    transporters: [{ id: 'transp-1', name: 'Transportador 1', active: true }],
    getProducerById: vi.fn((id) => (id === 'prod-1' ? { name: 'Produtor 1' } : undefined)),
    getRouteById: vi.fn((id) => (id === 'route-1' ? { name: 'Rota 1' } : undefined)),
  };

  const mockMilkLots = [
    {
      id: 'lot-1',
      codigo: 'LOT-2023-001',
      produtorId: 'prod-1',
      rotaId: 'route-1',
      transportadorId: 'transp-1',
      volumeLitros: 1000,
      volumeDisponivel: 1000,
      temperatura: 4.5,
      dataHoraRecebimento: new Date('2023-01-01T10:00:00Z'),
      status: 'Aguardando Análise',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (CadastrosContext.useCadastros as any).mockReturnValue(mockUseCadastros);
    (operationsApi.loadMilkLots as any).mockResolvedValue(mockMilkLots);
    (operationsApi.deleteMilkReception as any).mockResolvedValue(undefined);
  });

  it('renders lotes and handles deletion', async () => {
    render(<RecepcaoLeite />);

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('LOT-2023-001')).toBeInTheDocument();
    });

    // Find the delete button
    const deleteButton = screen.getByTitle('Excluir lote');
    fireEvent.click(deleteButton);

    // Confirm dialog opens
    expect(screen.getByText('Excluir Recepção de Leite')).toBeInTheDocument();

    // Click confirm
    const confirmButton = screen.getByText('Excluir');
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(operationsApi.deleteMilkReception).toHaveBeenCalledWith('lot-1');
      // The lote should be removed from the screen
      expect(screen.queryByText('LOT-2023-001')).not.toBeInTheDocument();
    });
  });
});
