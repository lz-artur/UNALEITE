import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const saveSupplyItem = vi.fn();
const supplyItems = [
  { id: 'cleaner', code: 'LIM-01', name: 'Detergente', category: 'Limpeza', unitId: 'un', currentStock: 12, active: true, isWarehouseItem: false },
  { id: 'reagent', code: 'LAB-01', name: 'Reagente', category: 'Laboratório', unitId: 'un', currentStock: 4, active: true, isWarehouseItem: true },
];

vi.mock('../context/CadastrosContext', () => ({
  useCadastros: () => ({ supplyItems, units: [{ id: 'un', name: 'Unidade', symbol: 'un', active: true }], saveSupplyItem }),
}));
vi.mock('../context/PermissionsContext', () => ({
  usePermissions: () => ({ hasPermission: () => true }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('CadastroAlmoxarifado', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cadastra um novo item já vinculado ao almoxarifado', async () => {
    const { default: CadastroAlmoxarifado } = await import('./CadastroAlmoxarifado');
    render(<CadastroAlmoxarifado />);
    fireEvent.change(screen.getByPlaceholderText('Ex.: ALM-001'), { target: { value: 'ALM-100' } });
    fireEvent.change(screen.getByPlaceholderText('Ex.: Detergente neutro'), { target: { value: 'Sabonete líquido' } });
    fireEvent.change(screen.getByPlaceholderText('Ex.: Material de limpeza'), { target: { value: 'Limpeza' } });
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'un' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar item' }));
    expect(saveSupplyItem).toHaveBeenCalledWith(expect.objectContaining({ code: 'ALM-100', name: 'Sabonete líquido', category: 'Limpeza', isWarehouseItem: true }));
  });

  it('remove um item cadastrado do almoxarifado', async () => {
    const { default: CadastroAlmoxarifado } = await import('./CadastroAlmoxarifado');
    render(<CadastroAlmoxarifado />);
    fireEvent.click(screen.getByRole('button', { name: 'Remover' }));
    expect(saveSupplyItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'reagent', isWarehouseItem: false }));
  });

  it('inclui um insumo existente também no almoxarifado', async () => {
    const { default: CadastroAlmoxarifado } = await import('./CadastroAlmoxarifado');
    render(<CadastroAlmoxarifado />);
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'cleaner' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar ao almoxarifado' }));
    expect(saveSupplyItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'cleaner', isWarehouseItem: true }));
  });
});
