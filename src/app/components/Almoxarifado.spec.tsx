import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createWarehouseWithdrawal = vi.fn().mockResolvedValue({ id: 'withdrawal-1' });
vi.mock('../context/CadastrosContext', () => ({
  useCadastros: () => ({
    units: [{ id: 'un', symbol: 'un' }],
    supplyItems: [{ id: 'cleaner', name: 'Detergente', code: 'LIM-01', unitId: 'un', active: true, isWarehouseItem: true }],
  }),
}));
vi.mock('../context/PermissionsContext', () => ({ usePermissions: () => ({ hasPermission: () => true }) }));
vi.mock('../services/operationsApi', () => ({
  loadSupplyLots: vi.fn().mockResolvedValue([{ id: 'lot-1', supplyItemId: 'cleaner', availableQuantity: 10 }]),
  loadWarehouseWithdrawals: vi.fn().mockResolvedValue([]),
  createWarehouseWithdrawal,
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('Almoxarifado', () => {
  beforeEach(() => vi.clearAllMocks());

  it('envia a saída com setor, item e quantidade', async () => {
    const { default: Almoxarifado } = await import('./Almoxarifado');
    render(<Almoxarifado />);
    await screen.findByText('Nenhuma saída registrada.');
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'Limpeza' } });
    fireEvent.change(selects[1], { target: { value: 'cleaner' } });
    fireEvent.change(screen.getByPlaceholderText('Quantidade'), { target: { value: '2,5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar saída' }));
    await waitFor(() => expect(createWarehouseWithdrawal).toHaveBeenCalledWith({
      sector: 'Limpeza', notes: undefined, items: [{ supplyItemId: 'cleaner', quantity: 2.5 }],
    }));
  });
});
