import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import VendedorExterno from './VendedorExterno';
import { createClient, createSalesOrder, loadClients, loadFinishedProductLots, loadSalesOrders } from '../services/operationsApi';
import type { EstoqueProduto } from '../data/mockData';

const permissions = vi.hoisted(() => ({ canCreate: true }));
vi.mock('../context/PermissionsContext', () => ({ usePermissions: () => ({ loading: false, hasPermission: () => permissions.canCreate }) }));
vi.mock('../context/CadastrosContext', () => ({ useCadastros: () => ({
  finishedProducts: [
    { id: 'p1', name: 'Queijo coalho', code: 'Q01', category: 'Queijos', unitId: 'kg', active: true },
    { id: 'p2', name: 'Manteiga', code: 'M01', category: 'Manteigas', unitId: 'un', active: true },
  ], getUnitSymbol: (id: string) => id,
}) }));
vi.mock('../services/operationsApi', () => ({ createClient: vi.fn(), createSalesOrder: vi.fn(), loadClients: vi.fn(), loadFinishedProductLots: vi.fn(), loadSalesOrders: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), info: vi.fn() } }));
const lot = (overrides = {}) => ({ id: 'l1', produtoId: 'p1', disponivel: 12.5, dataValidade: new Date('2099-12-31'), ...overrides }) as EstoqueProduto;

beforeEach(() => {
  vi.resetAllMocks();
  permissions.canCreate = true;
  vi.mocked(loadFinishedProductLots).mockResolvedValue([lot(), lot({ id: 'expired', disponivel: 90, dataValidade: new Date('2000-01-01') }), lot({ id: 'l2', produtoId: 'p2', disponivel: 0 })]);
  vi.mocked(loadClients).mockResolvedValue([{ id: 'c1', name: 'Mercado Central', document: '123', active: true }]);
  vi.mocked(loadSalesOrders).mockResolvedValue([]);
});
async function openReview() {
  render(<VendedorExterno />);
  fireEvent.click(await screen.findByRole('button', { name: 'Adicionar ao pedido' }));
  fireEvent.click(screen.getByRole('button', { name: 'Revisar' }));
  const dialog = within(screen.getByRole('dialog'));
  fireEvent.change(dialog.getByLabelText('Cliente'), { target: { value: 'c1' } });
  fireEvent.change(dialog.getByLabelText('Quantidade (kg)'), { target: { value: '2,5' } });
  fireEvent.change(dialog.getByLabelText('Preço unitário (R$)'), { target: { value: '20,50' } });
  return dialog;
}

describe('Vendedor externo', () => {
  it('exibe apenas saldo positivo dentro da validade e permite buscar por código', async () => {
    render(<VendedorExterno />);
    expect(await screen.findByText('12,5')).toBeInTheDocument();
    expect(screen.queryByText('Manteiga')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Buscar produto'), { target: { value: 'Q01' } });
    expect(screen.getByText('Queijo coalho')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Buscar produto'), { target: { value: 'inexistente' } });
    expect(screen.getByText('Nenhum produto disponível')).toBeInTheDocument();
  });
  it('confere estoque e salva um pedido com decimais brasileiros', async () => {
    vi.mocked(createSalesOrder).mockResolvedValue({ id: 'o1', number: 'PV001', clientName: 'Mercado Central', orderDate: new Date(), dueDate: new Date(), status: 'Aberto', totalAmount: 51.25, items: [] } as any);
    const dialog = await openReview();
    fireEvent.click(dialog.getByRole('button', { name: 'Salvar pedido' }));
    await waitFor(() => expect(createSalesOrder).toHaveBeenCalledWith(expect.objectContaining({ clientId: 'c1', items: [{ productId: 'p1', quantity: 2.5, unitPrice: 20.5 }] })));
    await screen.findByText('#PV001');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(loadFinishedProductLots).toHaveBeenCalledTimes(2);
    expect(loadFinishedProductLots).toHaveBeenLastCalledWith({ requireLive: true });
  });
  it('impede a venda quando o saldo diminui e mantém o pedido para correção', async () => {
    const dialog = await openReview();
    vi.mocked(loadFinishedProductLots).mockResolvedValueOnce([lot({ disponivel: 1 })]);
    fireEvent.click(dialog.getByRole('button', { name: 'Salvar pedido' }));
    expect(await dialog.findByRole('alert')).toHaveTextContent('Estoque insuficiente');
    expect(createSalesOrder).not.toHaveBeenCalled();
    expect(dialog.getByLabelText('Quantidade (kg)')).toHaveValue('2,5');
  });
  it('não permite criar pedidos sem a permissão comercial de criação', async () => {
    permissions.canCreate = false;
    render(<VendedorExterno />);
    await screen.findByText('Queijo coalho');
    expect(screen.queryByRole('button', { name: 'Adicionar ao pedido' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Comercial' }));
    expect(screen.queryByRole('button', { name: 'Novo pedido' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clientes', exact: true }));
    expect(screen.queryByRole('button', { name: 'Novo cliente' })).not.toBeInTheDocument();
  });
  it('mostra falha de conexão e permite tentar novamente', async () => {
    vi.mocked(loadFinishedProductLots).mockRejectedValueOnce(new Error('offline'));
    render(<VendedorExterno />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Dados indisponíveis');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('Queijo coalho')).toBeInTheDocument();
  });
  it('preserva os valores quando a API rejeita o pedido', async () => {
    vi.mocked(createSalesOrder).mockRejectedValue(new Error('Cliente bloqueado'));
    const dialog = await openReview();
    fireEvent.click(dialog.getByRole('button', { name: 'Salvar pedido' }));
    expect(await dialog.findByRole('alert')).toHaveTextContent('Cliente bloqueado');
    expect(dialog.getByLabelText('Preço unitário (R$)')).toHaveValue('20,50');
  });
  it('cadastra um cliente e o disponibiliza imediatamente na lista e no pedido', async () => {
    vi.mocked(createClient).mockResolvedValue({ id: 'c2', name: 'Mercado Novo', document: '12345678000190', city: 'Recife', state: 'PE', active: true });
    render(<VendedorExterno />);
    await screen.findByText('Queijo coalho');
    fireEvent.click(screen.getByRole('button', { name: 'Comercial', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Clientes', exact: true }));
    fireEvent.change(screen.getByLabelText('Buscar cliente'), { target: { value: 'não existe' } });
    fireEvent.click(screen.getByRole('button', { name: 'Novo cliente' }));
    const dialog = within(screen.getByRole('dialog'));
    fireEvent.change(dialog.getByLabelText('Nome / razão social *'), { target: { value: ' Mercado Novo ' } });
    fireEvent.change(dialog.getByLabelText('CPF / CNPJ / documento *'), { target: { value: '12345678000190' } });
    fireEvent.change(dialog.getByLabelText('Cidade'), { target: { value: 'Recife' } });
    fireEvent.change(dialog.getByLabelText('Estado'), { target: { value: 'PE' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Salvar cliente' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(createClient).toHaveBeenCalledWith(expect.objectContaining({ name: 'Mercado Novo', document: '12345678000190', city: 'Recife', state: 'PE', active: true }));
    expect(screen.getByRole('heading', { name: 'Mercado Novo' })).toBeInTheDocument();
    expect(screen.getByLabelText('Buscar cliente')).toHaveValue('');
    const card = screen.getByRole('heading', { name: 'Mercado Novo' }).closest('article')!;
    fireEvent.click(within(card).getByRole('button', { name: 'Novo pedido' }));
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar ao pedido' }));
    fireEvent.click(screen.getByRole('button', { name: 'Revisar', exact: true }));
    expect(within(screen.getByRole('dialog')).getByLabelText('Cliente')).toHaveValue('c2');
  });
  it('mantém os dados do novo cliente se o cadastro falhar e permite cancelar', async () => {
    vi.mocked(createClient).mockRejectedValue(new Error('Documento já cadastrado'));
    render(<VendedorExterno />);
    await screen.findByText('Queijo coalho');
    fireEvent.click(screen.getByRole('button', { name: 'Comercial', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Clientes', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Novo cliente' }));
    const dialog = within(screen.getByRole('dialog'));
    fireEvent.change(dialog.getByLabelText('Nome / razão social *'), { target: { value: 'Mercado Novo' } });
    fireEvent.change(dialog.getByLabelText('CPF / CNPJ / documento *'), { target: { value: '123' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Salvar cliente' }));
    expect(await dialog.findByRole('alert')).toHaveTextContent('Documento já cadastrado');
    expect(dialog.getByLabelText('Nome / razão social *')).toHaveValue('Mercado Novo');
    fireEvent.click(dialog.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

});
