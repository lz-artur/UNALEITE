import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { format } from 'date-fns';
import { AlertTriangle, Loader2, Plus, ShoppingBag, Users, Trash2, Calendar, CalendarDays, FileText, User, X, Wallet, TrendingUp, History, CreditCard, Edit2 } from 'lucide-react';
import { toast } from 'sonner';
import { useCadastros } from '../context/CadastrosContext';
import {
  createClient,
  createSalesOrder,
  finalizeConferredSalesOrder,
  fulfillSalesOrder,
  cancelAttendance,
  loadClients,
  loadFinishedProductLots,
  loadSalesOrderDetail,
  loadSalesOrders,
  updateClient,
  deleteSalesOrder,
  returnSalesOrder,
  type ClientRecord,
  type SalesOrderFilters,
  type SalesOrderRecord,
} from '../services/operationsApi';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';

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
  const [showFinalizeModal, setShowFinalizeModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
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
    addressNumber: '',
    addressComplement: '',
    neighborhood: '',
    cep: '',
    city: '',
    cityCode: '',
    state: '',
    countryCode: '1058',
    countryName: 'Brasil',
    ieIndicator: '9',
    finalConsumer: false,
    notes: '',
    active: true,
  });
  const [orderForm, setOrderForm] = useState({
    clientId: '',
    orderDate: getToday(),
    dueDate: getToday(),
    deliveryDate: getToday(),
    notes: '',
    items: [{ localId: 'order-item-1', productId: '', quantity: '', unitPrice: '' }],
  });
  const [fulfillForm, setFulfillForm] = useState<{
    idempotencyKey: string;
    fulfilledAt: string;
    paymentMethod: string;
    installments: string;
    isParcelado: boolean;
    parcelas: Array<{ id: string; dueDate: string; amount: string }>;
    bankAccountId: string;
    items: Record<string, Array<{ localId: string; finishedProductLotId: string; quantity: string }>>;
  }>({
    idempotencyKey: crypto.randomUUID(),
    fulfilledAt: getToday(),
    paymentMethod: '',
    installments: '',
    isParcelado: false,
    parcelas: [{ id: crypto.randomUUID(), dueDate: '', amount: '' }],
    bankAccountId: '',
    items: {},
  });
  const [returnForm, setReturnForm] = useState<{
    returnDate: string;
    items: Array<{ salesOrderItemId: string; productId: string; lotId: string; returnedQuantity: string; reason: string; unitPrice: number; maxQuantity: number }>;
    discountAmount: string;
    excessHandlingStrategy: 'credit' | 'refund';
  }>({
    returnDate: getToday(),
    items: [],
    discountAmount: '',
    excessHandlingStrategy: 'credit',
  });
  const [selectedClientProfile, setSelectedClientProfile] = useState<ClientRecord | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const { finishedProducts, bankAccounts, getUnitSymbol } = useCadastros();

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

  useEffect(() => {
    if (errorMessage) {
      toast.error(errorMessage);
      const timer = setTimeout(() => setErrorMessage(null), 100);
      return () => clearTimeout(timer);
    }
  }, [errorMessage]);

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
      code: 'Gerado automaticamente',
      name: '',
      tradeName: '',
      document: '',
      stateRegistration: '',
      phone: '',
      email: '',
      address: '',
      addressNumber: '',
      addressComplement: '',
      neighborhood: '',
      cep: '',
      city: '',
      cityCode: '',
      state: '',
      countryCode: '1058',
      countryName: 'Brasil',
      ieIndicator: '9',
      finalConsumer: false,
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
      addressNumber: client.addressNumber ?? '',
      addressComplement: client.addressComplement ?? '',
      neighborhood: client.neighborhood ?? '',
      cep: client.cep ?? '',
      city: client.city ?? '',
      cityCode: client.cityCode ?? '',
      state: client.state ?? '',
      countryCode: client.countryCode ?? '1058',
      countryName: client.countryName ?? 'Brasil',
      ieIndicator: client.ieIndicator ?? '9',
      finalConsumer: client.finalConsumer ?? false,
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
        addressNumber: clientForm.addressNumber || undefined,
        addressComplement: clientForm.addressComplement || undefined,
        neighborhood: clientForm.neighborhood || undefined,
        cep: clientForm.cep || undefined,
        city: clientForm.city || undefined,
        cityCode: clientForm.cityCode || undefined,
        state: clientForm.state || undefined,
        countryCode: clientForm.countryCode || '1058',
        countryName: clientForm.countryName || 'Brasil',
        ieIndicator: clientForm.ieIndicator || undefined,
        finalConsumer: clientForm.finalConsumer,
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
      deliveryDate: getToday(),
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
        deliveryDate: (orderForm as any).deliveryDate ? new Date((orderForm as any).deliveryDate).toISOString() : undefined,
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
      const nextItems = detail.items.reduce<Record<string, Array<{ localId: string; finishedProductLotId: string; quantity: string }>>>(
        (accumulator, item) => {
          if (item.pendingQuantity <= 0) return accumulator;
          // Nunca preencher o saldo pendente automaticamente: isso faria um
          // atendimento parcial ser salvo como integral caso o usuário não
          // removesse todas as quantidades sugeridas.
          accumulator[item.id] = [{
            localId: `lot-${Date.now()}-0`,
            finishedProductLotId: '',
            quantity: '',
          }];
          return accumulator;
        },
        {},
      );
      setFulfillForm({
        idempotencyKey: crypto.randomUUID(),
        fulfilledAt: getToday(),
        paymentMethod: '',
        installments: '',
        isParcelado: false,
        parcelas: [{ id: crypto.randomUUID(), dueDate: '', amount: '' }],
        bankAccountId: '',
        items: nextItems,
      });
      setShowFulfillModal(true);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoadingDetail(false);
    }
  };

  const openFinalizeModal = async (salesOrderId: string) => {
    setLoadingDetail(true);
    setErrorMessage(null);
    try {
      setSelectedOrder(await loadSalesOrderDetail(salesOrderId));
      setFulfillForm({
        idempotencyKey: crypto.randomUUID(), fulfilledAt: getToday(), paymentMethod: '', installments: '',
        isParcelado: false, parcelas: [{ id: crypto.randomUUID(), dueDate: '', amount: '' }], bankAccountId: '', items: {},
      });
      setShowFinalizeModal(true);
    } catch (error) { setErrorMessage(getErrorMessage(error)); }
    finally { setLoadingDetail(false); }
  };

  const handleFinalizeOrder = async () => {
    if (!selectedOrder) return;
    if (!fulfillForm.paymentMethod || !fulfillForm.bankAccountId) {
      setErrorMessage('Selecione a forma de pagamento e a conta de recebimento.');
      return;
    }
    const installmentsTotal = fulfillForm.parcelas.reduce((sum, entry) => sum + Number(entry.amount.replace(',', '.') || 0), 0);
    if (fulfillForm.isParcelado && (fulfillForm.parcelas.some((entry) => !entry.amount || !entry.dueDate) || Math.abs(installmentsTotal - conferredAmount) > 0.01)) {
      setErrorMessage('Preencha as parcelas e faça com que a soma seja igual ao total do pedido.');
      return;
    }
    setSaving(true); setErrorMessage(null);
    try {
      const updatedOrder = await finalizeConferredSalesOrder({
        salesOrderId: selectedOrder.id, paymentMethod: fulfillForm.paymentMethod, bankAccountId: fulfillForm.bankAccountId,
        installmentEntries: fulfillForm.isParcelado ? fulfillForm.parcelas.map((entry) => ({ amount: Number(entry.amount.replace(',', '.')), dueDate: new Date(`${entry.dueDate}T12:00:00`).toISOString() })) : undefined,
      });
      setSalesOrders((current) => current.map((order) => order.id === updatedOrder.id ? updatedOrder : order));
      setSelectedOrder(updatedOrder); setShowFinalizeModal(false);
      toast.success('Venda finalizada e contas a receber gerado.');
    } catch (error) { setErrorMessage(getErrorMessage(error)); }
    finally { setSaving(false); }
  };

  const handleFulfillOrder = async () => {
    if (!selectedOrder) {
      return;
    }

    if (!fulfillForm.paymentMethod) {
      setErrorMessage('Selecione a forma de pagamento para atender o pedido.');
      return;
    }

    if (!fulfillForm.bankAccountId) {
      setErrorMessage('Selecione a conta de recebimento para atender o pedido.');
      return;
    }

    const items = selectedOrder.items
      .flatMap((item) => {
        const itemLots = fulfillForm.items[item.id] || [];
        return itemLots.map((lot) => ({
          item,
          values: lot,
        }));
      })
      .filter((entry) => Number(entry.values?.quantity) > 0);

    if (items.length === 0) {
      setErrorMessage('Informe ao menos um item com quantidade atendida.');
      return;
    }

    if (fulfillForm.isParcelado && fulfillForm.parcelas.some((p) => !p.amount || !p.dueDate)) {
      setErrorMessage('Preencha todos os campos das parcelas (valor e data de vencimento).');
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
        idempotencyKey: fulfillForm.idempotencyKey,
        fulfilledAt: new Date(fulfillForm.fulfilledAt).toISOString(),
        paymentMethod: fulfillForm.paymentMethod,
        installments: fulfillForm.installments ? Number(fulfillForm.installments) : undefined,
        installmentEntries: fulfillForm.isParcelado 
          ? fulfillForm.parcelas.map(p => ({ 
              amount: parseFloat(p.amount.replace(',', '.')), 
              dueDate: new Date(p.dueDate + 'T12:00:00').toISOString() 
            }))
          : undefined,
        bankAccountId: fulfillForm.bankAccountId,
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

  const openReturnModal = () => {
    if (!selectedOrder) return;
    
    // Create return items for every fulfillment
    const items = selectedOrder.items.flatMap(item => 
      item.fulfillments.map(f => ({
        salesOrderItemId: item.id,
        productId: item.productId,
        lotId: f.finishedProductLotId,
        returnedQuantity: '', // empty initially
        reason: '',
        unitPrice: item.unitPrice,
        maxQuantity: f.quantity - (f.returnedQuantity || 0)
      })).filter(entry => entry.maxQuantity > 0)
    );

    setReturnForm({
      returnDate: getToday(),
      items,
      discountAmount: '',
      excessHandlingStrategy: 'credit',
    });
    setShowReturnModal(true);
  };

  const calculateSuggestedDiscount = (items: typeof returnForm.items) => {
    return items.reduce((sum, item) => sum + (Number(item.returnedQuantity) || 0) * item.unitPrice, 0);
  };

  const handleReturnOrder = async () => {
    if (!selectedOrder) return;

    const itemsToReturn = returnForm.items
      .filter(item => Number(item.returnedQuantity) > 0)
      .map(item => ({
        salesOrderItemId: item.salesOrderItemId,
        lotId: item.lotId,
        returnedQuantity: Number(item.returnedQuantity),
        reason: item.reason,
      }));

    if (itemsToReturn.length === 0) {
      setErrorMessage('Informe a quantidade a devolver para ao menos um lote.');
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      const updatedOrder = await returnSalesOrder({
        salesOrderId: selectedOrder.id,
        returnDate: new Date(returnForm.returnDate).toISOString(),
        items: itemsToReturn,
        discountAmount: Number(returnForm.discountAmount) || 0,
        excessHandlingStrategy: returnForm.excessHandlingStrategy,
      });

      setSalesOrders((current) =>
        current.map((order) => (order.id === updatedOrder.id ? updatedOrder : order)),
      );
      setSelectedOrder(updatedOrder);
      setShowReturnModal(false);
      
      const refreshedLots = await loadFinishedProductLots();
      setFinishedLots(
        refreshedLots.map((lot) => ({
          id: lot.id,
          productId: lot.produtoId,
          lote: lot.lote,
          disponivel: lot.disponivel,
        })),
      );
      toast.success('Devolução registrada com sucesso!');
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!itemToDelete) return;
    setIsDeleting(true);
    setErrorMessage(null);

    try {
      await deleteSalesOrder(itemToDelete);
      setSalesOrders((current) => current.filter((order) => order.id !== itemToDelete));
      
      if (selectedOrder?.id === itemToDelete) {
        setSelectedOrder(null);
      }

      setDeleteConfirmOpen(false);
      setItemToDelete(null);
      toast.success('Pedido de venda excluído com sucesso');
    } catch (error) {
      setDeleteConfirmOpen(false);
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsDeleting(false);
    }
  };

  const availableLotsByProduct = (productId: string) =>
    finishedLots.filter((lot) => lot.productId === productId && lot.disponivel > 0);

  const totalFulfillmentValue = useMemo(() => {
    if (!selectedOrder || !showFulfillModal) return 0;
    return selectedOrder.items.reduce((sum, item) => {
      const itemLots = fulfillForm.items[item.id] || [];
      const itemFulfilledQty = itemLots.reduce((qSum, lot) => qSum + Number(lot.quantity || 0), 0);
      return sum + (itemFulfilledQty * item.unitPrice);
    }, 0);
  }, [selectedOrder, fulfillForm.items, showFulfillModal]);

  const conferredAmount = useMemo(
    () => selectedOrder?.attendances
      .filter((attendance) => attendance.attendanceNumber.startsWith('EXP-'))
      .reduce((sum, attendance) => sum + attendance.totalValue, 0) ?? 0,
    [selectedOrder],
  );

  const hasFulfillmentErrors = useMemo(() => {
    if (!selectedOrder || !showFulfillModal) return false;
    if (!fulfillForm.paymentMethod || !fulfillForm.bankAccountId) return true;

    for (const item of selectedOrder.items) {
      if (item.pendingQuantity <= 0) continue;
      const itemLots = fulfillForm.items[item.id] || [];
      const itemFulfilledQty = itemLots.reduce((qSum, lot) => qSum + Number(lot.quantity || 0), 0);
      
      // Add a small tolerance for floating point errors
      if (itemFulfilledQty > item.pendingQuantity + 0.001) return true;

      
      for (const lot of itemLots) {
        if (!lot.finishedProductLotId) continue;
        const availableLot = finishedLots.find(l => l.id === lot.finishedProductLotId);
        if (availableLot && Number(lot.quantity || 0) > availableLot.disponivel) return true;
      }
    }
    
    if (fulfillForm.isParcelado) {
      const installmentsTotal = fulfillForm.parcelas.reduce((sum, p) => sum + Number(p.amount.replace(',', '.') || 0), 0);
      if (Math.abs(installmentsTotal - totalFulfillmentValue) > 0.01) return true;
    }
    
    return false;
  }, [selectedOrder, fulfillForm, finishedLots, showFulfillModal, totalFulfillmentValue]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Comercial</h2>
          <p className="text-gray-600">
            Pedidos de venda e atendimento com baixa de produto acabado
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={openCreateOrder}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Novo pedido
          </button>
        </div>
      </div>

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
                  { label: 'Conferido', value: 'Conferido' },
                  { label: 'Parcialmente Conferido', value: 'Parcialmente Conferido' },
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
                      <TableHead></TableHead>
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
                          {order.hasReturn && <span className="ml-2 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">Devolução</span>}
                        </TableCell>
                        <TableCell className="font-medium text-blue-700">
                          R$ {order.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => {
                                setSelectedOrder(order);
                                setShowDetailModal(true);
                              }}
                              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              Detalhes
                            </button>
                            {order.status === 'Conferido' && (
                              <button onClick={() => void openFinalizeModal(order.id)} disabled={loadingDetail} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-60">
                                Finalizar venda
                              </button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="w-12">
                          <button
                            onClick={() => {
                              setItemToDelete(order.id);
                              setDeleteConfirmOpen(true);
                            }}
                            className="text-red-600 hover:text-red-900"
                            title="Excluir pedido"
                          >
                            <Trash2 className="h-5 w-5" />
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
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => setSelectedClientProfile(client)}
                              className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700 hover:bg-blue-100 font-medium flex items-center space-x-1"
                              title="Ver Perfil"
                            >
                              <User className="h-4 w-4" />
                              <span>Perfil</span>
                            </button>
                            <button
                              onClick={() => openEditClient(client)}
                              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                              title="Editar"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                          </div>
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
            <InputField label="Codigo" type="text" value={clientForm.code} disabled={true} onChange={(value) => setClientForm((current) => ({ ...current, code: value }))} />
            <InputField label="CNPJ/CPF" type="text" value={clientForm.document} onChange={(value) => setClientForm((current) => ({ ...current, document: value }))} />
            <InputField label="Razao social / nome" type="text" value={clientForm.name} onChange={(value) => setClientForm((current) => ({ ...current, name: value }))} />
            <InputField label="Nome fantasia" type="text" value={clientForm.tradeName} onChange={(value) => setClientForm((current) => ({ ...current, tradeName: value }))} />
            <InputField label="Inscricao estadual" type="text" value={clientForm.stateRegistration} onChange={(value) => setClientForm((current) => ({ ...current, stateRegistration: value }))} />
            <InputField label="Telefone" type="text" value={clientForm.phone} onChange={(value) => setClientForm((current) => ({ ...current, phone: value }))} />
            <InputField label="E-mail" type="text" value={clientForm.email} onChange={(value) => setClientForm((current) => ({ ...current, email: value }))} />
            <InputField label="Endereco" type="text" value={clientForm.address} onChange={(value) => setClientForm((current) => ({ ...current, address: value }))} />
            <InputField label="Numero (Residencia/Empresa)" type="text" value={clientForm.addressNumber} onChange={(value) => setClientForm((current) => ({ ...current, addressNumber: value }))} />
            <InputField label="Complemento" type="text" value={clientForm.addressComplement} onChange={(value) => setClientForm((current) => ({ ...current, addressComplement: value }))} />
            <InputField label="Bairro" type="text" value={clientForm.neighborhood} onChange={(value) => setClientForm((current) => ({ ...current, neighborhood: value }))} />
            <InputField label="CEP" type="text" value={clientForm.cep} onChange={(value) => setClientForm((current) => ({ ...current, cep: value }))} />
            <InputField label="Cidade" type="text" value={clientForm.city} onChange={(value) => setClientForm((current) => ({ ...current, city: value }))} />
            <InputField label="Código IBGE do município" type="text" value={clientForm.cityCode} onChange={(value) => setClientForm((current) => ({ ...current, cityCode: value }))} />
            <InputField label="UF" type="text" value={clientForm.state} onChange={(value) => setClientForm((current) => ({ ...current, state: value }))} />
            <InputField label="Indicador IE (1, 2 ou 9)" type="text" value={clientForm.ieIndicator} onChange={(value) => setClientForm((current) => ({ ...current, ieIndicator: value }))} />
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
              id="client-final-consumer"
              type="checkbox"
              checked={clientForm.finalConsumer}
              onChange={(event) => setClientForm((current) => ({ ...current, finalConsumer: event.target.checked }))}
            />
            <label htmlFor="client-final-consumer" className="text-sm text-gray-700">
              Consumidor final
            </label>
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
            {clients.find((client) => client.id === orderForm.clientId)?.delinquent && <div className="md:col-span-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span><strong>Cliente inadimplente.</strong> Revise a situação financeira antes de criar este pedido.</span></div>}
            <InputField label="Data do pedido" type="date" value={orderForm.orderDate} onChange={(value) => setOrderForm((current) => ({ ...current, orderDate: value }))} />
            <InputField label="Data prev. de entrega" type="date" value={(orderForm as any).deliveryDate} onChange={(value) => setOrderForm((current) => ({ ...current, deliveryDate: value }))} />
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

      {showFinalizeModal && selectedOrder ? (
        <ModalShell
          title={`Finalizar venda do pedido ${selectedOrder.number}`}
          onClose={() => setShowFinalizeModal(false)}
          onConfirm={() => void handleFinalizeOrder()}
          confirmLabel="Finalizar venda e gerar contas a receber"
          saving={saving}
          disabled={!fulfillForm.paymentMethod || !fulfillForm.bankAccountId}
          maxWidth="max-w-3xl"
        >
          <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            A expedição deste pedido já foi conferida e o estoque já foi baixado. Informe abaixo as condições financeiras para concluir a venda e gerar o contas a receber.
          </div>
          <p className="mb-4 text-lg font-bold text-gray-900">Total conferido: R$ {conferredAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <SelectField label="Forma de pagamento *" value={fulfillForm.paymentMethod} onChange={(value) => setFulfillForm((current) => ({ ...current, paymentMethod: value }))} options={[{ label: 'Selecione...', value: '' }, { label: 'À vista', value: 'À vista' }, { label: 'Pix', value: 'Pix' }, { label: 'Dinheiro', value: 'Dinheiro' }, { label: 'Boleto', value: 'Boleto' }, { label: 'Cartão', value: 'Cartão' }]} />
            <SelectField label="Conta de recebimento *" value={fulfillForm.bankAccountId} onChange={(value) => setFulfillForm((current) => ({ ...current, bankAccountId: value }))} options={[{ label: 'Selecione...', value: '' }, ...bankAccounts.filter((account) => account.active).map((account) => ({ label: account.name, value: account.id }))]} />
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm font-medium text-gray-700"><input type="checkbox" checked={fulfillForm.isParcelado} onChange={(event) => setFulfillForm((current) => ({ ...current, isParcelado: event.target.checked }))} className="h-4 w-4 rounded border-gray-300 text-blue-600" />Lançamento parcelado</label>
          {fulfillForm.isParcelado && <div className="mt-4 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
            {fulfillForm.parcelas.map((entry, index) => <div key={entry.id} className="flex items-end gap-3"><div className="flex-1"><InputField label={`Valor da parcela ${index + 1}`} type="number" value={entry.amount} onChange={(value) => setFulfillForm((current) => ({ ...current, parcelas: current.parcelas.map((item) => item.id === entry.id ? { ...item, amount: value } : item) }))} /></div><div className="flex-1"><InputField label="Vencimento" type="date" value={entry.dueDate} onChange={(value) => setFulfillForm((current) => ({ ...current, parcelas: current.parcelas.map((item) => item.id === entry.id ? { ...item, dueDate: value } : item) }))} /></div>{fulfillForm.parcelas.length > 1 && <button type="button" onClick={() => setFulfillForm((current) => ({ ...current, parcelas: current.parcelas.filter((item) => item.id !== entry.id) }))} className="mb-1 rounded p-2 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>}</div>)}
            <button type="button" onClick={() => setFulfillForm((current) => ({ ...current, parcelas: [...current.parcelas, { id: crypto.randomUUID(), dueDate: '', amount: '' }] }))} className="text-sm font-medium text-blue-700">+ Adicionar parcela</button>
          </div>}
        </ModalShell>
      ) : null}

      {showFulfillModal && selectedOrder ? (
        <ModalShell
          title={`Atendimento do pedido ${selectedOrder.number}`}
          onClose={() => setShowFulfillModal(false)}
          onConfirm={() => void handleFulfillOrder()}
          confirmLabel="Confirmar atendimento"
          saving={saving}
          disabled={hasFulfillmentErrors}
          maxWidth="max-w-5xl"
        >
          <div className="mb-6 rounded-lg bg-gray-50 p-4 border border-gray-200">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-bold text-gray-900">Dados Financeiros</h3>
              <div className="text-sm font-medium text-blue-700 bg-blue-50 px-3 py-1 rounded-full">
                Total sendo atendido: R$ {totalFulfillmentValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>
            
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <InputField
              label="Data do atendimento"
              type="date"
              value={fulfillForm.fulfilledAt}
              onChange={(value) => setFulfillForm((current) => ({ ...current, fulfilledAt: value }))}
            />
            <SelectField
              label="Forma de pagamento *"
              value={fulfillForm.paymentMethod}
              onChange={(value) => setFulfillForm((current) => ({ ...current, paymentMethod: value }))}
              options={[
                { label: 'Selecione...', value: '' },
                { label: 'À vista', value: 'À vista' },
                { label: 'Pix', value: 'Pix' },
                { label: 'Dinheiro', value: 'Dinheiro' },
                { label: 'Boleto', value: 'Boleto' },
                { label: 'Cartão', value: 'Cartão' },
              ]}
            />
            <SelectField
              label="Conta de recebimento *"
              value={fulfillForm.bankAccountId}
              onChange={(value) => setFulfillForm((current) => ({ ...current, bankAccountId: value }))}
              options={[
                { label: 'Selecione...', value: '' },
                ...bankAccounts.filter(b => b.active).map(b => ({ label: b.name, value: b.id })),
              ]}
            />
          </div>
          <div className="mt-4 flex items-center">
            <input 
              type="checkbox" 
              id="isParcelado" 
              checked={fulfillForm.isParcelado} 
              onChange={(e) => setFulfillForm(current => ({ ...current, isParcelado: e.target.checked }))}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-2 h-4 w-4"
            />
            <label htmlFor="isParcelado" className="text-sm font-medium text-gray-700 cursor-pointer">
              Lançamento parcelado
            </label>
          </div>
          {fulfillForm.isParcelado && (
            <div className="mt-4 border border-gray-200 rounded-md p-3 bg-white flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-700">Parcelas</h3>
                {Math.abs(fulfillForm.parcelas.reduce((sum, p) => sum + Number(p.amount.replace(',', '.') || 0), 0) - totalFulfillmentValue) > 0.01 && (
                  <span className="text-xs font-medium text-red-600">A soma das parcelas deve ser igual ao total atendido</span>
                )}
              </div>
              {fulfillForm.parcelas.map((parcela, index) => (
                <div key={parcela.id} className="flex items-end gap-3">
                  <div className="flex-1">
                    <InputField
                      label={`Valor (R$) P. ${index + 1}`}
                      type="number"
                      value={parcela.amount}
                      onChange={(value) => setFulfillForm(current => ({
                        ...current,
                        parcelas: current.parcelas.map(p => p.id === parcela.id ? { ...p, amount: value } : p)
                      }))}
                    />
                  </div>
                  <div className="flex-1">
                    <InputField
                      label={`Vencimento P. ${index + 1}`}
                      type="date"
                      value={parcela.dueDate}
                      onChange={(value) => setFulfillForm(current => ({
                        ...current,
                        parcelas: current.parcelas.map(p => p.id === parcela.id ? { ...p, dueDate: value } : p)
                      }))}
                    />
                  </div>
                  {fulfillForm.parcelas.length > 1 && (
                    <button 
                      type="button" 
                      onClick={() => setFulfillForm(current => ({
                        ...current,
                        parcelas: current.parcelas.filter(p => p.id !== parcela.id)
                      }))}
                      className="mb-1 p-2 text-red-500 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              <button 
                type="button" 
                onClick={() => setFulfillForm(current => ({
                  ...current,
                  parcelas: [...current.parcelas, { id: crypto.randomUUID(), dueDate: '', amount: '' }]
                }))}
                className="self-start mt-2 flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                <Plus className="w-4 h-4" /> Adicionar parcela
              </button>
            </div>
          )}
          </div>

          <h3 className="mb-3 font-bold text-gray-900">Itens a Atender</h3>
          <p className="mb-4 text-sm text-gray-600">
            Informe somente as quantidades que serão atendidas agora. Nenhuma quantidade é preenchida automaticamente.
          </p>
          <div className="space-y-4">
            {selectedOrder.items
              .filter((item) => item.pendingQuantity > 0)
              .map((item) => {
                const baseLotOptions = availableLotsByProduct(item.productId);
                const itemLots = fulfillForm.items[item.id] || [];
                const fulfilledQty = itemLots.reduce((sum, lot) => sum + Number(lot.quantity || 0), 0);
                // Add a small tolerance for floating point errors
                const isOverfulfilled = fulfilledQty > item.pendingQuantity + 0.001;


                return (
                  <div key={item.id} className="rounded-lg border border-gray-200 p-4 bg-white">
                    <div className="mb-3 flex items-start justify-between border-b border-gray-100 pb-3">
                      <div>
                        <h4 className="font-bold text-gray-900 flex items-center gap-2">
                          {item.productName}
                          <StatusBadge status={item.status} />
                        </h4>
                        <div className="mt-1 flex items-center gap-2 text-sm">
                          <span className={`font-medium ${isOverfulfilled ? 'text-red-600' : 'text-gray-700'}`}>
                            Atendido: {fulfilledQty.toLocaleString('pt-BR')} / {item.pendingQuantity.toLocaleString('pt-BR')} {getUnitSymbol(item.unitId)}
                          </span>
                          {isOverfulfilled && (
                            <span className="text-xs text-red-600 font-medium bg-red-50 px-2 py-0.5 rounded">
                              Quantidade excede o pendente
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setFulfillForm((current) => ({
                            ...current,
                            items: {
                              ...current.items,
                              [item.id]: [
                                ...(current.items[item.id] || []),
                                { localId: `lot-${Date.now()}`, finishedProductLotId: '', quantity: '' }
                              ],
                            },
                          }))}
                          className="flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100"
                        >
                          <Plus className="h-4 w-4" /> Adicionar Lote
                        </button>
                      </div>
                    </div>
                    {itemLots.map((lotValue, index) => {
                      // Filter out lots already selected in OTHER lines of this same item
                      const selectedLotIds = itemLots.filter((_, i) => i !== index).map(l => l.finishedProductLotId).filter(Boolean);
                      const lotOptions = baseLotOptions.filter(lot => !selectedLotIds.includes(lot.id) || lot.id === lotValue.finishedProductLotId);
                      
                      const selectedLotData = baseLotOptions.find(l => l.id === lotValue.finishedProductLotId);
                      const isOverLotDisponivel = selectedLotData && Number(lotValue.quantity || 0) > selectedLotData.disponivel;

                      return (
                        <div key={lotValue.localId} className="mt-3">
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto]">
                            <SelectField
                              label="Lote acabado"
                              value={lotValue.finishedProductLotId}
                              onChange={(value) =>
                                setFulfillForm((current) => ({
                                  ...current,
                                  items: {
                                    ...current.items,
                                    [item.id]: current.items[item.id].map((l, i) => i === index ? { ...l, finishedProductLotId: value } : l),
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
                            <div>
                              <InputField
                                label="Quantidade atendida"
                                type="number"
                                value={lotValue.quantity}
                                onChange={(value) =>
                                  setFulfillForm((current) => ({
                                    ...current,
                                    items: {
                                      ...current.items,
                                      [item.id]: current.items[item.id].map((l, i) => i === index ? { ...l, quantity: value } : l),
                                    },
                                  }))
                                }
                              />
                            </div>
                            <div className="flex items-end">
                              <button
                                onClick={() => setFulfillForm((current) => ({
                                  ...current,
                                  items: {
                                    ...current.items,
                                    [item.id]: current.items[item.id].filter((_, i) => i !== index),
                                  },
                                }))}
                                className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                                title="Remover lote"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                          {isOverLotDisponivel && (
                            <p className="mt-1 text-xs text-red-600 font-medium">A quantidade excede o saldo disponível do lote selecionado.</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
          </div>
        </ModalShell>
      ) : null}

      {showDetailModal && selectedOrder ? (
        <ModalShell
          title={`Detalhes do Pedido`}
          onClose={() => setShowDetailModal(false)}
          maxWidth="max-w-5xl"
          hideCancel={true}
          zIndex="z-[60]"
          extraFooterActions={
            <div className="flex items-center gap-3 w-full justify-end">
              {(selectedOrder.status === 'Atendido' || selectedOrder.status === 'Parcialmente Atendido') && (
                <button
                  onClick={() => { setShowDetailModal(false); openReturnModal(); }}
                  className="rounded-lg bg-orange-500 hover:bg-orange-600 px-4 py-2 text-white transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
                >
                  Devolver
                </button>
              )}
              {selectedOrder.status === 'Conferido' && (
                <button
                  onClick={() => { setShowDetailModal(false); void openFinalizeModal(selectedOrder.id); }}
                  disabled={loadingDetail}
                  className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 transition-colors disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                >
                  Finalizar venda
                </button>
              )}
              {selectedOrder.status !== 'Atendido' && selectedOrder.status !== 'Cancelado' && selectedOrder.status !== 'Conferido' && (
                <button
                  onClick={() => { setShowDetailModal(false); void openFulfillModal(selectedOrder.id); }}
                  disabled={loadingDetail}
                  className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700 transition-colors disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                >
                  {loadingDetail ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Realizar Atendimento
                </button>
              )}
            </div>
          }
        >
          <div className="space-y-6 pb-2">
            {/* Header and Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 bg-white rounded-xl border border-gray-100 p-5 shadow-sm flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="h-12 w-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                    <User className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 text-lg">{selectedOrder.clientName}</h3>
                    <p className="text-sm text-gray-500 font-medium">Doc: {selectedOrder.clientDocument || 'Não informado'}</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex flex-col items-end gap-2 mb-1">
                    <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Status do Pedido</p>
                    <div className="flex gap-2 items-center">
                      <StatusBadge status={selectedOrder.status} />
                      {selectedOrder.hasReturn && <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-800">Devolução parcial/total</span>}
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-2 font-mono">{selectedOrder.number}</p>
                </div>
              </div>

              <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl p-5 shadow-md text-white flex flex-col justify-center relative">
                <p className="text-blue-100 text-sm font-medium mb-1">Valor Total</p>
                <h2 className="text-3xl font-bold tracking-tight">R$ {selectedOrder.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h2>
              </div>
            </div>

            {/* Financial Summary */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Valor Total</p>
                <p className="text-lg font-bold text-gray-900 mt-1">R$ {selectedOrder.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="bg-white rounded-xl border border-emerald-100 p-4 shadow-sm">
                <p className="text-xs text-emerald-600 font-semibold uppercase tracking-wide">Valor Atendido</p>
                <p className="text-lg font-bold text-emerald-700 mt-1">R$ {selectedOrder.totalFulfilled.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="bg-white rounded-xl border border-amber-100 p-4 shadow-sm">
                <p className="text-xs text-amber-600 font-semibold uppercase tracking-wide">Saldo a Atender</p>
                <p className="text-lg font-bold text-amber-700 mt-1">R$ {selectedOrder.remainingAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="bg-white rounded-xl border border-blue-100 p-4 shadow-sm">
                <p className="text-xs text-blue-600 font-semibold uppercase tracking-wide">% Atendido</p>
                <p className="text-lg font-bold text-blue-700 mt-1">{selectedOrder.fulfilledPercent.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}%</p>
                <div className="mt-2 h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500" style={{ width: `${Math.min(100, selectedOrder.fulfilledPercent)}%` }} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm flex items-center space-x-3">
                 <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><Calendar className="h-5 w-5"/></div>
                 <div>
                   <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Data do Pedido</p>
                   <p className="text-sm font-medium text-gray-900 mt-0.5">{new Date(selectedOrder.orderDate).toLocaleDateString('pt-BR')}</p>
                 </div>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm flex items-center space-x-3">
                 <div className="p-2 bg-orange-50 text-orange-600 rounded-lg"><CalendarDays className="h-5 w-5"/></div>
                 <div>
                   <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Vencimento</p>
                   <p className="text-sm font-medium text-gray-900 mt-0.5">{new Date(selectedOrder.dueDate).toLocaleDateString('pt-BR')}</p>
                 </div>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm flex items-start space-x-3">
                 <div className="p-2 bg-gray-50 text-gray-600 rounded-lg shrink-0"><FileText className="h-5 w-5"/></div>
                 <div className="overflow-hidden">
                   <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Observações</p>
                   <p className="text-sm text-gray-800 line-clamp-2 mt-0.5" title={selectedOrder.notes || 'Sem observações'}>{selectedOrder.notes || 'Nenhuma observação informada.'}</p>
                 </div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
              <div className="bg-gray-50/80 px-6 py-4 border-b border-gray-200">
                <h4 className="font-semibold text-gray-800">Itens do Pedido</h4>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-white border-b border-gray-100">
                    <tr>
                      <TableHead>Produto</TableHead>
                      <TableHead>Quantidades</TableHead>
                      <TableHead>Valores</TableHead>
                      <TableHead>Lotes Expedidos</TableHead>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {selectedOrder.items.map((item) => (
                      <tr key={item.id} className="hover:bg-blue-50/30 transition-colors">
                        <TableCell>
                          <div className="font-semibold text-gray-900">{item.productName}</div>
                          <div className="text-xs text-gray-500 mt-1 flex items-center space-x-2">
                             <span className={item.status === 'Atendido' ? 'text-emerald-600 font-medium' : item.status === 'Parcialmente Atendido' ? 'text-amber-600 font-medium' : 'text-blue-600 font-medium'}>{item.status}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col space-y-1.5 text-sm">
                            <div className="flex justify-between w-36">
                              <span className="text-gray-500">Pedido:</span>
                              <span className="font-medium text-gray-900">{item.orderedQuantity.toLocaleString('pt-BR')} {getUnitSymbol(item.unitId)}</span>
                            </div>
                            <div className="flex justify-between w-36">
                              <span className="text-gray-500">Atendido:</span>
                              <span className="font-medium text-emerald-600">{item.fulfilledQuantity.toLocaleString('pt-BR')} {getUnitSymbol(item.unitId)}</span>
                            </div>
                            {item.pendingQuantity > 0 && (
                              <div className="flex justify-between w-36 pt-1 mt-1 border-t border-gray-100">
                                <span className="text-gray-500">Pendente:</span>
                                <span className="font-semibold text-amber-600">{item.pendingQuantity.toLocaleString('pt-BR')} {getUnitSymbol(item.unitId)}</span>
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                           <div className="text-sm">
                             <div className="text-gray-500 font-medium">R$ {item.unitPrice.toFixed(2)} <span className="text-xs font-normal">/ un</span></div>
                             <div className="font-bold text-gray-900 mt-1.5 text-base">R$ {item.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                           </div>
                        </TableCell>
                        <TableCell>
                          {item.fulfillments.length > 0 ? (
                            <div className="flex flex-wrap gap-2 max-w-sm">
                              {item.fulfillments.map((fulfillment) => (
                                <div key={fulfillment.id} className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10 shadow-sm" title={`Atendido em: ${new Date(fulfillment.fulfilledAt).toLocaleString('pt-BR')}`}>
                                  {fulfillment.lotCode}
                                  <span className="ml-1.5 border-l border-blue-200 pl-1.5 opacity-90 font-bold">
                                    {fulfillment.quantity.toLocaleString('pt-BR')} {getUnitSymbol(item.unitId)}
                                  </span>
                                  {fulfillment.returnedQuantity ? (
                                    <span className="ml-1.5 border-l border-blue-200 pl-1.5 text-red-600 font-bold" title="Quantidade devolvida">
                                      - {fulfillment.returnedQuantity.toLocaleString('pt-BR')}
                                    </span>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-sm text-gray-400 italic bg-gray-50 px-3 py-1.5 rounded-md border border-gray-100 inline-block">Sem expedimentos</span>
                          )}
                        </TableCell>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Attendance History */}
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
              <div className="bg-gray-50/80 px-6 py-4 border-b border-gray-200 flex items-center gap-2">
                <History className="h-5 w-5 text-gray-500" />
                <h4 className="font-semibold text-gray-800">Histórico de Atendimentos</h4>
              </div>
              {selectedOrder.attendances.length === 0 ? (
                <div className="p-10 text-center text-sm text-gray-500">Nenhum atendimento realizado para este pedido.</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {selectedOrder.attendances.map((attendance) => (
                    <div key={attendance.id} className={`p-5 ${attendance.status === 'Cancelado' ? 'bg-gray-50/50 opacity-70' : 'hover:bg-blue-50/20'} transition-colors`}>
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className={`h-10 w-10 rounded-lg flex items-center justify-center text-sm font-bold ${
                            attendance.status === 'Cancelado'
                              ? 'bg-gray-100 text-gray-500'
                              : 'bg-emerald-50 text-emerald-700'
                          }`}>
                            {attendance.attendanceNumber.replace('ATD-', '#')}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h5 className="font-bold text-gray-900 text-sm">Atendimento {attendance.attendanceNumber}</h5>
                              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                attendance.status === 'Cancelado'
                                  ? 'bg-gray-100 text-gray-600'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}>
                                {attendance.status}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">
                              Data: {new Date(attendance.fulfilledAt).toLocaleDateString('pt-BR')}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <p className="text-lg font-bold text-gray-900">
                            R$ {attendance.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </p>
                          {attendance.status === 'Concluído' && (
                            <button
                              onClick={async () => {
                                if (!confirm('Deseja cancelar este atendimento? Isso reverterá quantidades e excluirá as contas a receber não pagas.')) return;
                                setSaving(true);
                                try {
                                  const updated = await cancelAttendance(selectedOrder.id, attendance.id);
                                  setSalesOrders((cur) => cur.map((o) => o.id === updated.id ? updated : o));
                                  setSelectedOrder(updated);
                                  toast.success('Atendimento cancelado com sucesso.');
                                  const refreshedLots = await loadFinishedProductLots();
                                  setFinishedLots(refreshedLots.map((lot) => ({ id: lot.id, productId: lot.produtoId, lote: lot.lote, disponivel: lot.disponivel })));
                                } catch (err) {
                                  setErrorMessage(getErrorMessage(err));
                                } finally {
                                  setSaving(false);
                                }
                              }}
                              disabled={saving}
                              className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 transition-colors disabled:opacity-50"
                              title="Cancelar atendimento"
                            >
                              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="border border-gray-100 rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Produto</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qtd</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Preço Unit.</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Valor</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {attendance.items.map((ai) => (
                              <tr key={ai.id}>
                                <td className="px-4 py-2 font-medium text-gray-900">{ai.productName}</td>
                                <td className="px-4 py-2 text-right text-gray-700">{ai.quantity.toLocaleString('pt-BR')}</td>
                                <td className="px-4 py-2 text-right text-gray-500">R$ {ai.unitPrice.toFixed(2)}</td>
                                <td className="px-4 py-2 text-right font-medium text-gray-900">R$ {ai.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                  <div className="p-4 bg-gray-50/80 flex justify-between items-center">
                    <span className="text-sm font-semibold text-gray-700">Total atendido:</span>
                    <span className="text-lg font-bold text-gray-900">
                      R$ {selectedOrder.totalFulfilled.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </ModalShell>
      ) : null}

      {showReturnModal && selectedOrder ? (
        <ModalShell
          title={`Devolução do Pedido ${selectedOrder.number}`}
          onClose={() => setShowReturnModal(false)}
          onConfirm={() => void handleReturnOrder()}
          confirmLabel="Registrar devolução"
          saving={saving}
          maxWidth="max-w-4xl"
        >
          <div className="space-y-4">
            <InputField
              label="Data da devolução"
              type="date"
              value={returnForm.returnDate}
              onChange={(value) => setReturnForm((current) => ({ ...current, returnDate: value }))}
            />

            <div className="rounded-xl border border-gray-200 bg-white">
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                <h4 className="font-semibold text-gray-800">Lotes para Devolução</h4>
              </div>
              <div className="p-4 space-y-4">
                {returnForm.items.length === 0 ? (
                  <EmptyState message="Não há lotes passíveis de devolução." />
                ) : (
                  returnForm.items.map((item, index) => {
                    const product = selectedOrder.items.find(i => i.productId === item.productId);
                    return (
                      <div key={`${item.productId}-${item.lotId}`} className="flex flex-col md:flex-row gap-4 border border-gray-100 rounded-lg p-3 bg-white items-start md:items-center">
                        <div className="flex-1">
                          <p className="font-medium text-sm text-gray-900">{product?.productName}</p>
                          <p className="text-xs text-gray-500">Lote ID: {item.lotId.split('-')[0]}</p>
                          <p className="text-xs font-medium text-blue-600 mt-1">Disponível para devolução: {item.maxQuantity.toLocaleString('pt-BR')} {getUnitSymbol(product?.unitId)}</p>
                        </div>
                        <div className="w-full md:w-32">
                          <InputField
                            label="Devolver Qtd"
                            type="number"
                            value={item.returnedQuantity}
                            onChange={(value) => {
                              const newQuantity = Math.min(Number(value), item.maxQuantity);
                              setReturnForm(current => {
                                const newItems = [...current.items];
                                newItems[index].returnedQuantity = newQuantity.toString();
                                const newSuggestedDiscount = calculateSuggestedDiscount(newItems);
                                return { ...current, items: newItems, discountAmount: newSuggestedDiscount.toString() };
                              });
                            }}
                          />
                        </div>
                        <div className="w-full md:w-48">
                          <InputField
                            label="Motivo"
                            type="text"
                            value={item.reason}
                            onChange={(value) => setReturnForm(current => {
                              const newItems = [...current.items];
                              newItems[index].reason = value;
                              return { ...current, items: newItems };
                            })}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex flex-col space-y-4">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 w-full">
                <div>
                  <h4 className="font-bold text-blue-900">Abatimento Financeiro</h4>
                  <p className="text-sm text-blue-700 mt-1 text-balance">
                    O valor será abatido da receita original. Se o pedido já estiver pago, escolha o destino do valor excedente abaixo.
                  </p>
                </div>
                <div className="w-full md:w-48 bg-white rounded p-2 border border-blue-200 shrink-0">
                  <InputField
                    label="Valor a abater (R$)"
                    type="number"
                    value={returnForm.discountAmount}
                    onChange={(value) => setReturnForm(current => ({ ...current, discountAmount: value }))}
                  />
                </div>
              </div>
              
              {Number(returnForm.discountAmount) > 0 && (
                <div className="flex flex-col md:flex-row items-center gap-3 pt-3 border-t border-blue-200">
                  <span className="text-sm font-medium text-blue-900 shrink-0">Destino do excedente (se já pago):</span>
                  <select 
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                    value={returnForm.excessHandlingStrategy}
                    onChange={(e) => setReturnForm(current => ({ ...current, excessHandlingStrategy: e.target.value as 'credit' | 'refund' }))}
                  >
                    <option value="credit">Gerar Crédito na carteira do cliente (Troca)</option>
                    <option value="refund">Gerar um Contas a Pagar (Reembolso financeiro)</option>
                  </select>
                </div>
              )}
            </div>
          </div>
        </ModalShell>
      ) : null}

      {selectedClientProfile ? (
        <ModalShell
          title="Perfil do Cliente"
          onClose={() => setSelectedClientProfile(null)}
          onConfirm={() => setSelectedClientProfile(null)}
          confirmLabel="Fechar"
          hideCancel={true}
          maxWidth="max-w-4xl"
        >
          {(() => {
            const clientOrders = salesOrders.filter(o => o.clientId === selectedClientProfile.id);
            const totalSpent = clientOrders.reduce((sum, order) => sum + order.totalAmount, 0);

            return (
              <div className="space-y-6">
                <div className="flex items-center gap-4 bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                  <div className="h-16 w-16 bg-gradient-to-br from-blue-100 to-indigo-50 text-blue-600 rounded-2xl flex items-center justify-center shrink-0 border border-blue-100 shadow-sm">
                    <User className="h-8 w-8" />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-2xl font-bold text-gray-900">{selectedClientProfile.name}</h2>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2 text-sm text-gray-600">
                      <span className="flex items-center gap-1"><FileText className="h-4 w-4 text-gray-400"/> Doc: {selectedClientProfile.document}</span>
                      {selectedClientProfile.city && (
                        <span className="flex items-center gap-1">• {selectedClientProfile.city}/{selectedClientProfile.state}</span>
                      )}
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${selectedClientProfile.active ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-800'}`}>{selectedClientProfile.active ? 'Ativo' : 'Inativo'}</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-6 text-white shadow-lg flex items-center gap-5 relative overflow-hidden group">
                    <div className="bg-white/20 p-3.5 rounded-2xl shrink-0 backdrop-blur-md border border-white/10 group-hover:scale-110 transition-transform">
                      <Wallet className="h-8 w-8 text-white" />
                    </div>
                    <div className="z-10">
                      <p className="text-blue-100 font-medium text-sm tracking-wide uppercase">Saldo da Carteira</p>
                      <p className="text-4xl font-bold mt-1 tracking-tight">R$ {(selectedClientProfile.credit_balance || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div className="absolute -right-4 -top-4 opacity-10 group-hover:opacity-20 transition-opacity">
                      <CreditCard className="h-40 w-40 transform -rotate-12" />
                    </div>
                  </div>

                  <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm flex items-center gap-5 hover:border-gray-200 transition-colors">
                    <div className="bg-emerald-50 text-emerald-600 p-3.5 rounded-2xl shrink-0 border border-emerald-100">
                      <TrendingUp className="h-8 w-8" />
                    </div>
                    <div>
                      <p className="text-gray-500 font-medium text-sm tracking-wide uppercase">Total Gasto</p>
                      <p className="text-4xl font-bold text-gray-900 mt-1 tracking-tight">R$ {totalSpent.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                      <p className="text-sm text-gray-500 mt-1 font-medium bg-gray-50 inline-block px-2 py-0.5 rounded-md">{clientOrders.length} pedido(s) registrado(s)</p>
                    </div>
                  </div>
                </div>

                <div className="border border-gray-200 bg-white rounded-2xl overflow-hidden shadow-sm">
                  <div className="bg-gray-50/80 px-5 py-4 border-b border-gray-200 flex items-center gap-2">
                    <History className="h-5 w-5 text-gray-500" />
                    <h3 className="font-semibold text-gray-800 text-base">Histórico de Pedidos de Venda</h3>
                  </div>
                  <div className="overflow-x-auto max-h-96">
                    <table className="w-full">
                      <thead className="bg-white border-b border-gray-100 sticky top-0 z-10 shadow-sm">
                        <tr>
                          <TableHead>Número</TableHead>
                          <TableHead>Data</TableHead>
                          <TableHead>Vencimento</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Total</TableHead>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {clientOrders.length === 0 ? (
                          <tr><td colSpan={5} className="py-12 text-center text-gray-500 font-medium">Nenhum pedido encontrado para este cliente.</td></tr>
                        ) : (
                          clientOrders.sort((a, b) => b.orderDate.getTime() - a.orderDate.getTime()).map(order => (
                            <tr key={order.id} className="hover:bg-blue-50/50 transition-colors cursor-pointer" onClick={() => { setSelectedOrder(order); setShowDetailModal(true); }}>
                              <TableCell className="font-bold text-gray-900">{order.number}</TableCell>
                              <TableCell className="text-gray-600">{format(order.orderDate, 'dd/MM/yyyy')}</TableCell>
                              <TableCell className="text-gray-600">{format(order.dueDate, 'dd/MM/yyyy')}</TableCell>
                              <TableCell>
                                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold leading-5 ${order.status === 'Atendido' ? 'bg-emerald-100 text-emerald-800' : order.status === 'Conferido' ? 'bg-violet-100 text-violet-800' : order.status === 'Parcialmente Atendido' ? 'bg-amber-100 text-amber-800' : order.status === 'Parcialmente Conferido' ? 'bg-violet-50 text-violet-700' : 'bg-blue-100 text-blue-800'}`}>{order.status}</span>
                              </TableCell>
                              <TableCell className="font-bold text-gray-900">R$ {order.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })()}
        </ModalShell>
      ) : null}

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Pedido de Venda</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este pedido de venda? Esta ação não pode ser desfeita.
              Isso também excluirá todos os atendimentos e lançamentos financeiros associados, e restaurará 
              os volumes dos lotes de produtos acabados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
            >
              {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
  saving = false,
  disabled = false,
  maxWidth = 'max-w-3xl',
  confirmColor = 'blue',
  hideCancel = false,
  extraFooterActions,
  zIndex = 'z-50',
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  onConfirm?: () => void;
  confirmLabel?: string;
  saving?: boolean;
  disabled?: boolean;
  maxWidth?: string;
  confirmColor?: 'blue' | 'orange' | 'red';
  hideCancel?: boolean;
  extraFooterActions?: ReactNode;
  zIndex?: string;
}) {
  const colorClasses = {
    blue: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
    orange: 'bg-orange-500 hover:bg-orange-600 focus:ring-orange-500',
    red: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
  };

  return (
    <div className={`fixed inset-0 flex items-center justify-center bg-black/50 p-4 ${zIndex}`}>
      <div className={`max-h-[90vh] w-full flex flex-col overflow-hidden rounded-xl bg-white ${maxWidth}`}>
        <div className="border-b border-gray-200 p-6 shrink-0 flex items-center justify-between">
          <h3 className="text-xl font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1 -mr-1 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-200">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto">{children}</div>
        <div className="flex justify-end gap-3 border-t border-gray-200 p-6 shrink-0">
          {extraFooterActions}
          {!hideCancel && (
            <button
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-200"
            >
              Cancelar
            </button>
          )}
          {onConfirm && confirmLabel && (
            <button
              onClick={onConfirm}
              disabled={saving || disabled}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed ${colorClasses[confirmColor]}`}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {confirmLabel}
            </button>
          )}
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
      : status === 'Conferido'
        ? 'bg-violet-100 text-violet-800'
        : status === 'Parcialmente Conferido'
          ? 'bg-violet-50 text-violet-700'
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
  disabled,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className={`w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          disabled ? 'bg-gray-100 text-gray-500' : ''
        }`}
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
