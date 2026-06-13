import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { format } from 'date-fns';
import { Loader2, Plus, ShoppingBag, Users } from 'lucide-react';
import { useCadastros } from '../context/CadastrosContext';
import {
  createClient,
  createSalesOrder,
  fulfillSalesOrder,
  loadClients,
  loadFinishedProductLots,
  loadSalesOrderDetail,
  loadSalesOrders,
  updateClient,
  type ClientRecord,
  type SalesOrderFilters,
  type SalesOrderRecord,
} from '../services/operationsApi';

interface FinishedLotOption {
  id: string;
  productId: string;
  lote: string;
  disponivel: number;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Nao foi possivel concluir a operacao comercial.';
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

export default function Comercial() {
  const [activeTab, setActiveTab] = useState<'pedidos' | 'clientes'>('pedidos');
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [salesOrders, setSalesOrders] = useState<SalesOrderRecord[]>([]);
  const [finishedLots, setFinishedLots] = useState<FinishedLotOption[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<SalesOrderRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showClientModal, setShowClientModal] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showFulfillModal, setShowFulfillModal] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientRecord | null>(null);
  const [orderFilters, setOrderFilters] = useState<SalesOrderFilters>({});
  const [clientSearch, setClientSearch] = useState('');
  const [clientForm, setClientForm] = useState({
    code: '',
    name: '',
    tradeName: '',
    document: '',
    stateRegistration: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    state: '',
    notes: '',
    active: true,
  });
  const [orderForm, setOrderForm] = useState({
    clientId: '',
    orderDate: getToday(),
    dueDate: getToday(),
    notes: '',
    items: [{ localId: 'order-item-1', productId: '', quantity: '', unitPrice: '' }],
  });
  const [fulfillForm, setFulfillForm] = useState<{
    fulfilledAt: string;
    items: Record<string, { finishedProductLotId: string; quantity: string }>;
  }>({
    fulfilledAt: getToday(),
    items: {},
  });
  const { finishedProducts, getUnitSymbol } = useCadastros();

  const loadData = async (filters: SalesOrderFilters = orderFilters) => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const [clientsResult, ordersResult, lotsResult] = await Promise.all([
        loadClients(),
        loadSalesOrders(filters),
        loadFinishedProductLots(),
      ]);
      setClients(clientsResult);
      setSalesOrders(ordersResult);
      setFinishedLots(
        lotsResult.map((lot) => ({
          id: lot.id,
          productId: lot.produtoId,
          lote: lot.lote,
          disponivel: lot.disponivel,
        })),
      );
      if (selectedOrder) {
        const refreshed = ordersResult.find((entry) => entry.id === selectedOrder.id);
        setSelectedOrder(refreshed ?? null);
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const activeClients = useMemo(
    () => clients.filter((client) => client.active),
    [clients],
  );

  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) {
      return clients;
    }

    const query = clientSearch.toLowerCase();
    return clients.filter((client) =>
      [client.name, client.tradeName, client.document, client.city]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query),
    );
  }, [clientSearch, clients]);

  const productOptions = useMemo(
    () => finishedProducts.filter((product) => product.active),
    [finishedProducts],
  );

  const openCreateClient = () => {
    setEditingClient(null);
    setClientForm({
      code: '',
      name: '',
      tradeName: '',
      document: '',
      stateRegistration: '',
      phone: '',
      email: '',
      address: '',
      city: '',
      state: '',
      notes: '',
      active: true,
    });
    setShowClientModal(true);
    setErrorMessage(null);
  };

  const openEditClient = (client: ClientRecord) => {
    setEditingClient(client);
    setClientForm({
      code: client.code ?? '',
      name: client.name,
      tradeName: client.tradeName ?? '',
      document: client.document,
      stateRegistration: client.stateRegistration ?? '',
      phone: client.phone ?? '',
      email: client.email ?? '',
      address: client.address ?? '',
      city: client.city ?? '',
      state: client.state ?? '',
      notes: client.notes ?? '',
      active: client.active,
    });
    setShowClientModal(true);
    setErrorMessage(null);
  };

  const handleSaveClient = async () => {
    if (!clientForm.name.trim() || !clientForm.document.trim()) {
      setErrorMessage('Informe ao menos nome e documento do cliente.');
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      const payload = {
        code: clientForm.code || undefined,
        name: clientForm.name,
        tradeName: clientForm.tradeName || undefined,
        document: clientForm.document,
        stateRegistration: clientForm.stateRegistration || undefined,
        phone: clientForm.phone || undefined,
        email: clientForm.email || undefined,
        address: clientForm.address || undefined,
        city: clientForm.city || undefined,
        state: clientForm.state || undefined,
        notes: clientForm.notes || undefined,
        active: clientForm.active,
      };

      const savedClient = editingClient
        ? await updateClient(editingClient.id, payload)
        : await createClient(payload);

      setClients((current) => {
        const exists = current.some((client) => client.id === savedClient.id);
        if (!exists) {
          return [...current, savedClient].sort((a, b) => a.name.localeCompare(b.name));
        }

        return current
          .map((client) => (client.id === savedClient.id ? savedClient : client))
          .sort((a, b) => a.name.localeCompare(b.name));
      });
      setShowClientModal(false);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const openCreateOrder = () => {
    setOrderForm({
      clientId: activeClients[0]?.id ?? '',
      orderDate: getToday(),
      dueDate: getToday(),
      notes: '',
      items: [{ localId: `order-item-${Date.now()}`, productId: '', quantity: '', unitPrice: '' }],
    });
    setShowOrderModal(true);
    setErrorMessage(null);
  };

  const handleCreateOrder = async () => {
    if (!orderForm.clientId) {
      setErrorMessage('Selecione um cliente para criar o pedido.');
      return;
    }

    const items = orderForm.items
      .filter((item) => item.productId && Number(item.quantity) > 0)
      .map((item) => ({
        productId: item.productId,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
      }));

    if (items.length === 0 || items.some((item) => item.unitPrice < 0)) {
      setErrorMessage('Informe itens validos com quantidade e preco unitario corretos.');
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      const createdOrder = await createSalesOrder({
        clientId: orderForm.clientId,
        orderDate: new Date(orderForm.orderDate).toISOString(),
        dueDate: orderForm.dueDate ? new Date(orderForm.dueDate).toISOString() : undefined,
        notes: orderForm.notes || undefined,
        items,
      });
      setSalesOrders((current) => [createdOrder, ...current]);
      setSelectedOrder(createdOrder);
      setShowOrderModal(false);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const openFulfillModal = async (salesOrderId: string) => {
    setLoadingDetail(true);
    setErrorMessage(null);

    try {
      const detail = await loadSalesOrderDetail(salesOrderId);
      setSelectedOrder(detail);
      const nextItems = detail.items.reduce<Record<string, { finishedProductLotId: string; quantity: string }>>(
        (accumulator, item) => {
          const candidateLot = finishedLots.find(
            (lot) => lot.productId === item.productId && lot.disponivel > 0,
          );
          accumulator[item.id] = {
            finishedProductLotId: candidateLot?.id ?? '',
            quantity: '',
          };
          return accumulator;
        },
        {},
      );
      setFulfillForm({
        fulfilledAt: getToday(),
        items: nextItems,
      });
      setShowFulfillModal(true);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleFulfillOrder = async () => {
    if (!selectedOrder) {
      return;
    }

    const items = selectedOrder.items
      .map((item) => ({
        item,
        values: fulfillForm.items[item.id],
      }))
      .filter((entry) => Number(entry.values?.quantity) > 0);

    if (items.length === 0) {
      setErrorMessage('Informe ao menos um item com quantidade atendida.');
      return;
    }

    if (items.some((entry) => !entry.values.finishedProductLotId)) {
      setErrorMessage('Selecione os lotes acabados para todos os itens atendidos.');
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      const updatedOrder = await fulfillSalesOrder({
        salesOrderId: selectedOrder.id,
        fulfilledAt: new Date(fulfillForm.fulfilledAt).toISOString(),
        items: items.map(({ item, values }) => ({
          salesOrderItemId: item.id,
          finishedProductLotId: values.finishedProductLotId,
          quantity: Number(values.quantity),
        })),
      });

      setSalesOrders((current) =>
        current.map((order) => (order.id === updatedOrder.id ? updatedOrder : order)),
      );
      setSelectedOrder(updatedOrder);
      setShowFulfillModal(false);
      const refreshedLots = await loadFinishedProductLots();
      setFinishedLots(
        refreshedLots.map((lot) => ({
          id: lot.id,
          productId: lot.produtoId,
          lote: lot.lote,
          disponivel: lot.disponivel,
        })),
      );
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const availableLotsByProduct = (productId: string) =>
    finishedLots.filter((lot) => lot.productId === productId && lot.disponivel > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Comercial</h2>
          <p className="text-gray-600">
            Clientes, pedidos de venda e atendimento com baixa de produto acabado
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={openCreateClient}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Novo cliente
          </button>
          <button
            onClick={openCreateOrder}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Novo pedido
          </button>
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <SummaryCard title="Clientes ativos" value={clients.filter((client) => client.active).length} icon={Users} />
        <SummaryCard
          title="Pedidos abertos"
          value={salesOrders.filter((order) => order.status === 'Aberto').length}
          icon={ShoppingBag}
        />
        <SummaryCard
          title="Atendimento parcial"
          value={salesOrders.filter((order) => order.status === 'Parcialmente Atendido').length}
          icon={ShoppingBag}
        />
        <SummaryCard
          title="Valor em pedidos"
          value={`R$ ${salesOrders.reduce((sum, order) => sum + order.totalAmount, 0).toLocaleString('pt-BR', {
            minimumFractionDigits: 2,
          })}`}
          icon={ShoppingBag}
        />
      </div>

      <div className="flex gap-2 rounded-xl border border-gray-200 bg-white p-2">
        <TabButton
          active={activeTab === 'pedidos'}
          label="Pedidos"
          onClick={() => setActiveTab('pedidos')}
        />
        <TabButton
          active={activeTab === 'clientes'}
          label="Clientes"
          onClick={() => setActiveTab('clientes')}
        />
      </div>

      {activeTab === 'pedidos' ? (
        <>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <SelectField
                label="Cliente"
                value={orderFilters.clientId || ''}
                onChange={(value) => setOrderFilters((current) => ({ ...current, clientId: value || undefined }))}
                options={[
                  { label: 'Todos', value: '' },
                  ...clients.map((client) => ({ label: client.name, value: client.id })),
                ]}
              />
              <SelectField
                label="Status"
                value={orderFilters.status || ''}
                onChange={(value) => setOrderFilters((current) => ({ ...current, status: value || undefined }))}
                options={[
                  { label: 'Todos', value: '' },
                  { label: 'Aberto', value: 'Aberto' },
                  { label: 'Parcialmente Atendido', value: 'Parcialmente Atendido' },
                  { label: 'Atendido', value: 'Atendido' },
                  { label: 'Cancelado', value: 'Cancelado' },
                ]}
              />
              <InputField
                label="Data inicial"
                type="date"
                value={orderFilters.startDate || ''}
                onChange={(value) => setOrderFilters((current) => ({ ...current, startDate: value || undefined }))}
              />
              <InputField
                label="Data final"
                type="date"
                value={orderFilters.endDate || ''}
                onChange={(value) => setOrderFilters((current) => ({ ...current, endDate: value || undefined }))}
              />
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => void loadData(orderFilters)}
                className="rounded-lg bg-slate-900 px-4 py-2 text-white hover:bg-slate-800"
              >
                Aplicar filtros
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-200 p-4">
              <h3 className="font-bold text-gray-900">Pedidos de venda</h3>
            </div>
            {loading ? (
              <LoadingState message="Carregando pedidos..." />
            ) : salesOrders.length === 0 ? (
              <EmptyState message="Nenhum pedido encontrado para os filtros selecionados." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <TableHead>Numero</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Pedido</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Acoes</TableHead>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {salesOrders.map((order) => (
                      <tr key={order.id} className="hover:bg-gray-50">
                        <TableCell highlight>{order.number}</TableCell>
                        <TableCell>{order.clientName}</TableCell>
                        <TableCell>{format(order.orderDate, 'dd/MM/yyyy')}</TableCell>
                        <TableCell>{format(order.dueDate, 'dd/MM/yyyy')}</TableCell>
                        <TableCell>
                          <StatusBadge status={order.status} />
                        </TableCell>
                        <TableCell className="font-medium text-blue-700">
                          R$ {order.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => setSelectedOrder(order)}
                              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              Detalhes
                            </button>
                            {order.status !== 'Atendido' && order.status !== 'Cancelado' ? (
                              <button
                                onClick={() => void openFulfillModal(order.id)}
                                disabled={loadingDetail}
                                className="flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-60"
                              >
                                {loadingDetail && selectedOrder?.id === order.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : null}
                                Atender
                              </button>
                            ) : null}
                          </div>
                        </TableCell>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {selectedOrder ? (
            <div className="rounded-xl border border-gray-200 bg-white p-6">
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-gray-900">{selectedOrder.number}</h3>
                  <p className="text-sm text-gray-600">
                    {selectedOrder.clientName} - {selectedOrder.clientDocument || 'Sem documento'}
                  </p>
                </div>
                <StatusBadge status={selectedOrder.status} />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <TableHead>Produto</TableHead>
                      <TableHead>Pedido</TableHead>
                      <TableHead>Atendido</TableHead>
                      <TableHead>Pendente</TableHead>
                      <TableHead>Preco</TableHead>
                      <TableHead>Lotes expedidos</TableHead>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {selectedOrder.items.map((item) => (
                      <tr key={item.id}>
                        <TableCell highlight>{item.productName}</TableCell>
                        <TableCell>
                          {item.orderedQuantity.toLocaleString('pt-BR')} {getUnitSymbol(item.unitId)}
                        </TableCell>
                        <TableCell>
                          {item.fulfilledQuantity.toLocaleString('pt-BR')} {getUnitSymbol(item.unitId)}
                        </TableCell>
                        <TableCell>
                          {item.pendingQuantity.toLocaleString('pt-BR')} {getUnitSymbol(item.unitId)}
                        </TableCell>
                        <TableCell>R$ {item.unitPrice.toFixed(2)}</TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {item.fulfillments.length > 0
                            ? item.fulfillments
                                .map(
                                  (fulfillment) =>
                                    `${fulfillment.lotCode} (${fulfillment.quantity.toLocaleString('pt-BR')})`,
                                )
                                .join(', ')
                            : 'Nenhum atendimento ainda'}
                        </TableCell>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <InputField
                label="Buscar cliente"
                type="text"
                value={clientSearch}
                onChange={setClientSearch}
              />
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-200 p-4">
              <h3 className="font-bold text-gray-900">Clientes</h3>
            </div>
            {loading ? (
              <LoadingState message="Carregando clientes..." />
            ) : filteredClients.length === 0 ? (
              <EmptyState message="Nenhum cliente encontrado." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Documento</TableHead>
                      <TableHead>Cidade/UF</TableHead>
                      <TableHead>Contato</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Acoes</TableHead>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredClients.map((client) => (
                      <tr key={client.id} className="hover:bg-gray-50">
                        <TableCell highlight>{client.name}</TableCell>
                        <TableCell>{client.document}</TableCell>
                        <TableCell>{[client.city, client.state].filter(Boolean).join('/') || '-'}</TableCell>
                        <TableCell>{client.phone || client.email || '-'}</TableCell>
                        <TableCell>
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-medium ${
                              client.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {client.active ? 'Ativo' : 'Inativo'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <button
                            onClick={() => openEditClient(client)}
                            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                          >
                            Editar
                          </button>
                        </TableCell>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {showClientModal ? (
        <ModalShell
          title={editingClient ? 'Editar cliente' : 'Novo cliente'}
          onClose={() => setShowClientModal(false)}
          onConfirm={() => void handleSaveClient()}
          confirmLabel={editingClient ? 'Salvar cliente' : 'Criar cliente'}
          saving={saving}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <InputField label="Codigo" type="text" value={clientForm.code} onChange={(value) => setClientForm((current) => ({ ...current, code: value }))} />
            <InputField label="Documento" type="text" value={clientForm.document} onChange={(value) => setClientForm((current) => ({ ...current, document: value }))} />
            <InputField label="Razao social / nome" type="text" value={clientForm.name} onChange={(value) => setClientForm((current) => ({ ...current, name: value }))} />
            <InputField label="Nome fantasia" type="text" value={clientForm.tradeName} onChange={(value) => setClientForm((current) => ({ ...current, tradeName: value }))} />
            <InputField label="Inscricao estadual" type="text" value={clientForm.stateRegistration} onChange={(value) => setClientForm((current) => ({ ...current, stateRegistration: value }))} />
            <InputField label="Telefone" type="text" value={clientForm.phone} onChange={(value) => setClientForm((current) => ({ ...current, phone: value }))} />
            <InputField label="E-mail" type="text" value={clientForm.email} onChange={(value) => setClientForm((current) => ({ ...current, email: value }))} />
            <InputField label="Endereco" type="text" value={clientForm.address} onChange={(value) => setClientForm((current) => ({ ...current, address: value }))} />
            <InputField label="Cidade" type="text" value={clientForm.city} onChange={(value) => setClientForm((current) => ({ ...current, city: value }))} />
            <InputField label="UF" type="text" value={clientForm.state} onChange={(value) => setClientForm((current) => ({ ...current, state: value }))} />
          </div>
          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium text-gray-700">Observacoes</label>
            <textarea
              rows={3}
              value={clientForm.notes}
              onChange={(event) => setClientForm((current) => ({ ...current, notes: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="mt-4 flex items-center gap-2">
            <input
              id="client-active"
              type="checkbox"
              checked={clientForm.active}
              onChange={(event) => setClientForm((current) => ({ ...current, active: event.target.checked }))}
            />
            <label htmlFor="client-active" className="text-sm text-gray-700">
              Cliente ativo
            </label>
          </div>
        </ModalShell>
      ) : null}

      {showOrderModal ? (
        <ModalShell
          title="Novo pedido de venda"
          onClose={() => setShowOrderModal(false)}
          onConfirm={() => void handleCreateOrder()}
          confirmLabel="Criar pedido"
          saving={saving}
          maxWidth="max-w-4xl"
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <SelectField
              label="Cliente"
              value={orderForm.clientId}
              onChange={(value) => setOrderForm((current) => ({ ...current, clientId: value }))}
              options={[
                { label: 'Selecione...', value: '' },
                ...activeClients.map((client) => ({ label: client.name, value: client.id })),
              ]}
            />
            <InputField label="Data do pedido" type="date" value={orderForm.orderDate} onChange={(value) => setOrderForm((current) => ({ ...current, orderDate: value }))} />
            <InputField label="Vencimento" type="date" value={orderForm.dueDate} onChange={(value) => setOrderForm((current) => ({ ...current, dueDate: value }))} />
          </div>

          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium text-gray-700">Observacoes</label>
            <textarea
              rows={3}
              value={orderForm.notes}
              onChange={(event) => setOrderForm((current) => ({ ...current, notes: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="mt-6 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-gray-900">Itens do pedido</h4>
              <button
                onClick={() =>
                  setOrderForm((current) => ({
                    ...current,
                    items: [
                      ...current.items,
                      {
                        localId: `order-item-${Date.now()}-${current.items.length + 1}`,
                        productId: '',
                        quantity: '',
                        unitPrice: '',
                      },
                    ],
                  }))
                }
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Adicionar item
              </button>
            </div>
            {orderForm.items.map((item) => (
              <div key={item.localId} className="grid grid-cols-1 gap-3 rounded-lg border border-gray-200 p-4 md:grid-cols-4">
                <SelectField
                  label="Produto"
                  value={item.productId}
                  onChange={(value) => {
                            setOrderForm((current) => ({
                              ...current,
                              items: current.items.map((entry) =>
                                entry.localId === item.localId
                                  ? {
                                    ...entry,
                                    productId: value,
                                  }
                                  : entry,
                              ),
                    }));
                  }}
                  options={[
                    { label: 'Selecione...', value: '' },
                    ...productOptions.map((product) => ({
                      label: product.name,
                      value: product.id,
                    })),
                  ]}
                />
                <InputField
                  label="Quantidade"
                  type="number"
                  value={item.quantity}
                  onChange={(value) =>
                    setOrderForm((current) => ({
                      ...current,
                      items: current.items.map((entry) =>
                        entry.localId === item.localId ? { ...entry, quantity: value } : entry,
                      ),
                    }))
                  }
                />
                <InputField
                  label="Preco unitario"
                  type="number"
                  value={item.unitPrice}
                  onChange={(value) =>
                    setOrderForm((current) => ({
                      ...current,
                      items: current.items.map((entry) =>
                        entry.localId === item.localId ? { ...entry, unitPrice: value } : entry,
                      ),
                    }))
                  }
                />
                <div className="flex items-end">
                  <button
                    onClick={() =>
                      setOrderForm((current) => ({
                        ...current,
                        items:
                          current.items.length > 1
                            ? current.items.filter((entry) => entry.localId !== item.localId)
                            : current.items,
                      }))
                    }
                    className="w-full rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                  >
                    Remover
                  </button>
                </div>
              </div>
            ))}
          </div>
        </ModalShell>
      ) : null}

      {showFulfillModal && selectedOrder ? (
        <ModalShell
          title={`Atendimento do pedido ${selectedOrder.number}`}
          onClose={() => setShowFulfillModal(false)}
          onConfirm={() => void handleFulfillOrder()}
          confirmLabel="Confirmar atendimento"
          saving={saving}
          maxWidth="max-w-5xl"
        >
          <InputField
            label="Data do atendimento"
            type="date"
            value={fulfillForm.fulfilledAt}
            onChange={(value) => setFulfillForm((current) => ({ ...current, fulfilledAt: value }))}
          />
          <div className="mt-4 space-y-4">
            {selectedOrder.items
              .filter((item) => item.pendingQuantity > 0)
              .map((item) => {
                const lotOptions = availableLotsByProduct(item.productId);
                const values = fulfillForm.items[item.id];
                return (
                  <div key={item.id} className="rounded-lg border border-gray-200 p-4">
                    <div className="mb-3 flex items-start justify-between">
                      <div>
                        <h4 className="font-bold text-gray-900">{item.productName}</h4>
                        <p className="text-sm text-gray-600">
                          Pendente: {item.pendingQuantity.toLocaleString('pt-BR')} {getUnitSymbol(item.unitId)}
                        </p>
                      </div>
                      <StatusBadge status={item.status} />
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <SelectField
                        label="Lote acabado"
                        value={values?.finishedProductLotId || ''}
                        onChange={(value) =>
                          setFulfillForm((current) => ({
                            ...current,
                            items: {
                              ...current.items,
                              [item.id]: {
                                ...current.items[item.id],
                                finishedProductLotId: value,
                              },
                            },
                          }))
                        }
                        options={[
                          { label: lotOptions.length ? 'Selecione...' : 'Sem lotes disponiveis', value: '' },
                          ...lotOptions.map((lot) => ({
                            label: `${lot.lote} - saldo ${lot.disponivel.toLocaleString('pt-BR')}`,
                            value: lot.id,
                          })),
                        ]}
                      />
                      <InputField
                        label="Quantidade atendida"
                        type="number"
                        value={values?.quantity || ''}
                        onChange={(value) =>
                          setFulfillForm((current) => ({
                            ...current,
                            items: {
                              ...current.items,
                              [item.id]: {
                                ...current.items[item.id],
                                quantity: value,
                              },
                            },
                          }))
                        }
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}

function SummaryCard({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value: string | number;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="mb-1 text-sm text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
        <div className="rounded-xl bg-blue-50 p-3 text-blue-700">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
        active ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
      }`}
    >
      {label}
    </button>
  );
}

function ModalShell({
  title,
  children,
  onClose,
  onConfirm,
  confirmLabel,
  saving,
  maxWidth = 'max-w-3xl',
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  saving: boolean;
  maxWidth?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className={`max-h-[90vh] w-full overflow-y-auto rounded-xl bg-white ${maxWidth}`}>
        <div className="border-b border-gray-200 p-6">
          <h3 className="text-xl font-bold text-gray-900">{title}</h3>
        </div>
        <div className="p-6">{children}</div>
        <div className="flex justify-end gap-3 border-t border-gray-200 p-6">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function LoadingState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center gap-3 p-10 text-sm text-gray-600">
      <Loader2 className="h-5 w-5 animate-spin" />
      {message}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <div className="p-10 text-center text-sm text-gray-600">{message}</div>;
}

function StatusBadge({ status }: { status: string }) {
  const className =
    status === 'Atendido'
      ? 'bg-green-100 text-green-800'
      : status === 'Parcialmente Atendido'
        ? 'bg-yellow-100 text-yellow-800'
        : status === 'Cancelado'
          ? 'bg-gray-100 text-gray-700'
          : 'bg-blue-100 text-blue-800';

  return <span className={`rounded-full px-2 py-1 text-xs font-medium ${className}`}>{status}</span>;
}

function InputField({
  label,
  type,
  value,
  onChange,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function TableHead({ children }: { children: ReactNode }) {
  return (
    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">{children}</th>
  );
}

function TableCell({
  children,
  className = '',
  highlight = false,
}: {
  children: ReactNode;
  className?: string;
  highlight?: boolean;
}) {
  return (
    <td className={`px-6 py-4 ${highlight ? 'font-medium text-gray-900' : ''} ${className}`.trim()}>
      {children}
    </td>
  );
}
