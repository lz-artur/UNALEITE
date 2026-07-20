import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { useCadastros } from '../context/CadastrosContext';
import {
  createPurchase,
  loadPurchaseDetail,
  loadPurchases,
  receivePurchase,
  deletePurchase,
  type PurchaseFilters,
  type PurchaseRecord,
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

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Nao foi possivel processar a compra.';
}

function getDefaultDates() {
  const now = new Date();
  return {
    purchaseDate: now.toISOString().slice(0, 10),
    dueDate: now.toISOString().slice(0, 10),
  };
}

export default function Compras() {
  const [filters, setFilters] = useState<PurchaseFilters>({});
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [selectedPurchase, setSelectedPurchase] = useState<PurchaseRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [createForm, setCreateForm] = useState({
    supplierId: '',
    ...getDefaultDates(),
    notes: '',
    items: [{ localId: 'item-1', supplyItemId: '', quantity: '', unitCost: '' }],
    paymentMethodId: '',
    paymentTypeId: '',
    costCenterId: '',
    accountingCategoryId: '',
    accountingSubcategoryId: '',
    bankAccountId: '',
    installments: [] as Array<{ localId: string; dueDate: string; amount: string }>,
  });
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [receiveForm, setReceiveForm] = useState<{
    receivedAt: string;
    items: Record<
      string,
      {
        receivedQuantity: string;
        supplierLotNumber: string;
        manufactureDate: string;
        expirationDate: string;
        locationId: string;
        unitCost: string;
      }
    >;
  }>({
    receivedAt: new Date().toISOString().slice(0, 10),
    items: {},
  });
  const {
    suppliers,
    supplyItems,
    stockLocations,
    costCenters,
    bankAccounts,
    accountingCategories,
    accountingSubcategories,
    paymentMethods,
    paymentTypes,
    getSupplierById,
    getSupplyItemById,
    getUnitSymbol,
  } = useCadastros();

  const loadData = async (nextFilters: PurchaseFilters = filters) => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const nextPurchases = await loadPurchases(nextFilters);
      setPurchases(nextPurchases);
      if (selectedPurchase) {
        const refreshed = nextPurchases.find((purchase) => purchase.id === selectedPurchase.id);
        setSelectedPurchase(refreshed ?? null);
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

  const supplierOptions = useMemo(
    () => suppliers.filter((supplier) => supplier.active),
    [suppliers],
  );
  const supplyItemOptions = useMemo(
    () => supplyItems.filter((item) => item.active),
    [supplyItems],
  );
  const supplyLocations = useMemo(
    () => stockLocations.filter((location) => location.active && location.stockType === 'Insumos'),
    [stockLocations],
  );

  const applyFilters = () => {
    void loadData(filters);
  };

  const openCreateModal = () => {
    setCreateForm({
      supplierId: '',
      ...getDefaultDates(),
      notes: '',
      items: [{ localId: `item-${Date.now()}`, supplyItemId: '', quantity: '', unitCost: '' }],
      paymentMethodId: '',
      paymentTypeId: '',
      costCenterId: '',
      accountingCategoryId: '',
      accountingSubcategoryId: '',
      bankAccountId: '',
      installments: [],
    });
    setShowCreateModal(true);
    setErrorMessage(null);
  };

  const handleCreatePurchase = async () => {
    if (!createForm.supplierId) {
      setErrorMessage('Selecione um fornecedor para a compra.');
      return;
    }

    const normalizedItems = createForm.items
      .filter((item) => item.supplyItemId && Number(item.quantity) > 0)
      .map((item) => ({
        supplyItemId: item.supplyItemId,
        quantity: Number(item.quantity),
        unitCost: Number(item.unitCost),
      }));

    if (normalizedItems.length === 0 || normalizedItems.some((item) => item.unitCost < 0)) {
      setErrorMessage('Informe itens validos com quantidade e custo unitario corretos.');
      return;
    }

    const selectedPaymentType = paymentTypes.find((pt) => pt.id === createForm.paymentTypeId);
    const isDividido = selectedPaymentType?.name.toLowerCase().includes('dividido') || selectedPaymentType?.name.toLowerCase().includes('prazo');

    const normalizedInstallments = isDividido
      ? createForm.installments
          .filter((inst) => inst.amount && Number(inst.amount) > 0 && inst.dueDate)
          .map((inst) => ({
            dueDate: new Date(inst.dueDate).toISOString(),
            amount: Number(inst.amount),
          }))
      : [];

    if (isDividido) {
      const totalItems = normalizedItems.reduce((acc, item) => acc + item.quantity * item.unitCost, 0);
      const totalInstallments = normalizedInstallments.reduce((acc, inst) => acc + inst.amount, 0);

      // Tolerar diferenca de centavos
      if (Math.abs(totalItems - totalInstallments) > 0.1) {
        setErrorMessage('A soma das parcelas deve ser igual ao valor total da compra.');
        return;
      }
      if (normalizedInstallments.length === 0) {
        setErrorMessage('Informe pelo menos uma parcela válida.');
        return;
      }
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      const createdPurchase = await createPurchase({
        supplierId: createForm.supplierId,
        purchaseDate: new Date(createForm.purchaseDate).toISOString(),
        dueDate: createForm.dueDate ? new Date(createForm.dueDate).toISOString() : undefined,
        notes: createForm.notes || undefined,
        paymentMethodId: createForm.paymentMethodId || undefined,
        paymentTypeId: createForm.paymentTypeId || undefined,
        costCenterId: createForm.costCenterId || undefined,
        accountingCategoryId: createForm.accountingCategoryId || undefined,
        accountingSubcategoryId: createForm.accountingSubcategoryId || undefined,
        bankAccountId: createForm.bankAccountId || undefined,
        installments: normalizedInstallments.length > 0 ? normalizedInstallments : undefined,
        items: normalizedItems,
      });
      setPurchases((current) => [createdPurchase, ...current]);
      setSelectedPurchase(createdPurchase);
      setShowCreateModal(false);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleOpenReceive = async (purchaseId: string) => {
    setLoadingDetail(true);
    setErrorMessage(null);

    try {
      const detail = await loadPurchaseDetail(purchaseId);
      setSelectedPurchase(detail);
      const initialItems = detail.items.reduce<
        Record<
          string,
          {
            receivedQuantity: string;
            supplierLotNumber: string;
            manufactureDate: string;
            expirationDate: string;
            locationId: string;
            unitCost: string;
          }
        >
      >((accumulator, item) => {
        accumulator[item.id] = {
          receivedQuantity: '',
          supplierLotNumber: '',
          manufactureDate: '',
          expirationDate: '',
          locationId: supplyLocations[0]?.id ?? '',
          unitCost: item.unitCost.toString(),
        };
        return accumulator;
      }, {});

      setReceiveForm({
        receivedAt: new Date().toISOString().slice(0, 10),
        items: initialItems,
      });
      setShowReceiveModal(true);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleReceivePurchase = async () => {
    if (!selectedPurchase) {
      return;
    }

    const itemsToReceive = selectedPurchase.items
      .map((item) => ({
        item,
        values: receiveForm.items[item.id],
      }))
      .filter((entry) => Number(entry.values?.receivedQuantity) > 0);

    if (itemsToReceive.length === 0) {
      setErrorMessage('Informe ao menos um item com quantidade recebida.');
      return;
    }

    for (const entry of itemsToReceive) {
      if (entry.item.tracksLot && !entry.values.supplierLotNumber) {
        setErrorMessage(`O item ${entry.item.supplyItemName} exige lote do fornecedor.`);
        return;
      }

      if (entry.item.tracksExpiration && !entry.values.expirationDate) {
        setErrorMessage(`O item ${entry.item.supplyItemName} exige data de validade.`);
        return;
      }
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      const updatedPurchase = await receivePurchase({
        purchaseId: selectedPurchase.id,
        receivedAt: new Date(receiveForm.receivedAt).toISOString(),
        items: itemsToReceive.map(({ item, values }) => ({
          purchaseItemId: item.id,
          receivedQuantity: Number(values.receivedQuantity),
          supplierLotNumber: values.supplierLotNumber || undefined,
          manufactureDate: values.manufactureDate
            ? new Date(values.manufactureDate).toISOString()
            : undefined,
          expirationDate: values.expirationDate
            ? new Date(values.expirationDate).toISOString()
            : undefined,
          locationId: values.locationId || undefined,
          unitCost: values.unitCost ? Number(values.unitCost) : undefined,
        })),
      });

      setPurchases((current) =>
        current.map((purchase) => (purchase.id === updatedPurchase.id ? updatedPurchase : purchase)),
      );
      setSelectedPurchase(updatedPurchase);
      setShowReceiveModal(false);
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
      await deletePurchase(itemToDelete);
      setPurchases((current) => current.filter((purchase) => purchase.id !== itemToDelete));
      
      if (selectedPurchase?.id === itemToDelete) {
        setSelectedPurchase(null);
      }

      setDeleteConfirmOpen(false);
      setItemToDelete(null);
    } catch (error) {
      setDeleteConfirmOpen(false);
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsDeleting(false);
    }
  };

  const statusBadgeClass = (status: string) => {
    if (status === 'Recebida') return 'bg-green-100 text-green-800';
    if (status === 'Parcialmente Recebida') return 'bg-yellow-100 text-yellow-800';
    if (status === 'Cancelada') return 'bg-gray-100 text-gray-800';
    return 'bg-blue-100 text-blue-800';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Compras</h2>
          <p className="text-gray-600">Pedidos de compra, recebimento e geracao de lotes de insumo</p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          <Plus className="h-5 w-5" />
          Nova compra
        </button>
      </div>

      {errorMessage ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {errorMessage}
        </div>
      ) : null}

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <FilterSelect
            label="Fornecedor"
            value={filters.supplierId || ''}
            onChange={(value) => setFilters((current) => ({ ...current, supplierId: value || undefined }))}
            options={[
              { label: 'Todos', value: '' },
              ...supplierOptions.map((supplier) => ({ label: supplier.name, value: supplier.id })),
            ]}
          />
          <FilterSelect
            label="Status"
            value={filters.status || ''}
            onChange={(value) => setFilters((current) => ({ ...current, status: value || undefined }))}
            options={[
              { label: 'Todos', value: '' },
              { label: 'Aberta', value: 'Aberta' },
              { label: 'Parcialmente Recebida', value: 'Parcialmente Recebida' },
              { label: 'Recebida', value: 'Recebida' },
              { label: 'Cancelada', value: 'Cancelada' },
            ]}
          />
          <FilterField
            label="Data inicial"
            type="date"
            value={filters.startDate || ''}
            onChange={(value) => setFilters((current) => ({ ...current, startDate: value || undefined }))}
          />
          <FilterField
            label="Data final"
            type="date"
            value={filters.endDate || ''}
            onChange={(value) => setFilters((current) => ({ ...current, endDate: value || undefined }))}
          />
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={applyFilters}
            className="rounded-lg bg-slate-900 px-4 py-2 text-white hover:bg-slate-800"
          >
            Aplicar filtros
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <SummaryCard title="Compras abertas" value={purchases.filter((purchase) => purchase.status === 'Aberta').length} />
        <SummaryCard
          title="Recebimentos parciais"
          value={purchases.filter((purchase) => purchase.status === 'Parcialmente Recebida').length}
        />
        <SummaryCard
          title="Total comprado"
          value={`R$ ${purchases.reduce((sum, purchase) => sum + purchase.totalAmount, 0).toLocaleString('pt-BR', {
            minimumFractionDigits: 2,
          })}`}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-200 p-4">
          <h3 className="font-bold text-gray-900">Pedidos de compra</h3>
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-3 p-10 text-sm text-gray-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            Carregando compras...
          </div>
        ) : purchases.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-600">
            Nenhuma compra encontrada para os filtros selecionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Numero</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Fornecedor</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Compra</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Vencimento</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Valor</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Acoes</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {purchases.map((purchase) => (
                  <tr key={purchase.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">{purchase.number}</td>
                    <td className="px-6 py-4">{purchase.supplierName}</td>
                    <td className="px-6 py-4 text-sm">{format(purchase.purchaseDate, 'dd/MM/yyyy')}</td>
                    <td className="px-6 py-4 text-sm">{format(purchase.dueDate, 'dd/MM/yyyy')}</td>
                    <td className="px-6 py-4">
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${statusBadgeClass(purchase.status)}`}>
                        {purchase.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-medium text-blue-700">
                      R$ {purchase.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => {
                            setSelectedPurchase(purchase);
                            setShowDetailModal(true);
                          }}
                          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          Detalhes
                        </button>
                        {purchase.status !== 'Recebida' && purchase.status !== 'Cancelada' ? (
                          <button
                            onClick={() => void handleOpenReceive(purchase.id)}
                            disabled={loadingDetail}
                            className="flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-60"
                          >
                            {loadingDetail && selectedPurchase?.id === purchase.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : null}
                            Receber
                          </button>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-6 py-4 w-12">
                      <button
                        onClick={() => {
                          setItemToDelete(purchase.id);
                          setDeleteConfirmOpen(true);
                        }}
                        className="text-red-600 hover:text-red-900"
                        title="Excluir compra"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showDetailModal && selectedPurchase ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white shadow-xl flex flex-col">
            <div className="border-b border-gray-200 p-6 flex justify-between items-center bg-gray-50 sticky top-0 rounded-t-xl z-10">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Detalhes da Compra {selectedPurchase.number}</h3>
                <p className="text-sm text-gray-600 font-medium">{selectedPurchase.supplierName}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-sm font-medium ${statusBadgeClass(selectedPurchase.status)} shadow-sm`}>
                {selectedPurchase.status}
              </span>
            </div>
            
            <div className="p-6 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                  <h4 className="text-sm font-bold text-blue-900 uppercase tracking-wider mb-3">Informacoes Gerais</h4>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between border-b border-blue-100 pb-1">
                      <dt className="text-blue-800">Data da Compra:</dt>
                      <dd className="font-semibold text-blue-900">{format(selectedPurchase.purchaseDate, 'dd/MM/yyyy')}</dd>
                    </div>
                    <div className="flex justify-between border-b border-blue-100 pb-1">
                      <dt className="text-blue-800">Vencimento:</dt>
                      <dd className="font-semibold text-blue-900">{format(selectedPurchase.dueDate, 'dd/MM/yyyy')}</dd>
                    </div>
                    <div className="flex justify-between border-b border-blue-100 pb-1">
                      <dt className="text-blue-800">Valor Total:</dt>
                      <dd className="font-semibold text-blue-900">R$ {selectedPurchase.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</dd>
                    </div>
                  </dl>
                </div>

                <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                  <h4 className="text-sm font-bold text-indigo-900 uppercase tracking-wider mb-3">Financeiro & Contabil</h4>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between border-b border-indigo-100 pb-1">
                      <dt className="text-indigo-800">Forma Pagto:</dt>
                      <dd className="font-semibold text-indigo-900">{paymentMethods.find(m => m.id === selectedPurchase.paymentMethodId)?.name || '-'}</dd>
                    </div>
                    <div className="flex justify-between border-b border-indigo-100 pb-1">
                      <dt className="text-indigo-800">Tipo Pagto:</dt>
                      <dd className="font-semibold text-indigo-900">{paymentTypes.find(t => t.id === selectedPurchase.paymentTypeId)?.name || '-'}</dd>
                    </div>
                    <div className="flex justify-between border-b border-indigo-100 pb-1">
                      <dt className="text-indigo-800">Centro Custo:</dt>
                      <dd className="font-semibold text-indigo-900">{costCenters.find(c => c.id === selectedPurchase.costCenterId)?.name || '-'}</dd>
                    </div>
                  </dl>
                </div>
              </div>

              <h4 className="font-bold text-gray-900 mb-4 text-lg border-b pb-2">Itens Solicitados</h4>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-600">Insumo</th>
                      <th className="px-4 py-3 text-right text-xs font-bold uppercase text-gray-600">Pedido</th>
                      <th className="px-4 py-3 text-right text-xs font-bold uppercase text-gray-600">Recebido</th>
                      <th className="px-4 py-3 text-right text-xs font-bold uppercase text-gray-600">Pendente</th>
                      <th className="px-4 py-3 text-right text-xs font-bold uppercase text-gray-600">Custo Unit.</th>
                      <th className="px-4 py-3 text-center text-xs font-bold uppercase text-gray-600">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {selectedPurchase.items.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{item.supplyItemName}</td>
                        <td className="px-4 py-3 text-right text-gray-700">
                          {item.orderedQuantity.toLocaleString('pt-BR')} <span className="text-xs text-gray-500">{getUnitSymbol(item.unitId)}</span>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-green-600">
                          {item.receivedQuantity.toLocaleString('pt-BR')} <span className="text-xs text-green-700/50">{getUnitSymbol(item.unitId)}</span>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-orange-500">
                          {item.pendingQuantity.toLocaleString('pt-BR')} <span className="text-xs text-orange-600/50">{getUnitSymbol(item.unitId)}</span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700 font-mono">R$ {item.unitCost.toFixed(2)}</td>
                        <td className="px-4 py-3 text-center text-sm">
                          <span className={`px-2 py-1 rounded-md text-xs font-medium ${item.status === 'Pendente' ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800'}`}>{item.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {selectedPurchase.notes && (
                <div className="mt-6 bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <h4 className="text-sm font-bold text-gray-700 mb-2">Observacoes:</h4>
                  <p className="text-gray-600 text-sm whitespace-pre-line">{selectedPurchase.notes}</p>
                </div>
              )}
            </div>
            
            <div className="border-t border-gray-200 p-4 bg-gray-50 rounded-b-xl flex justify-end">
              <button
                onClick={() => setShowDetailModal(false)}
                className="rounded-lg bg-gray-900 px-5 py-2 text-white hover:bg-gray-800 font-medium transition-colors shadow-sm"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showCreateModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white">
            <div className="border-b border-gray-200 p-6">
              <h3 className="text-xl font-bold text-gray-900">Nova compra</h3>
            </div>
            <div className="space-y-6 p-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <FilterSelect
                  label="Fornecedor"
                  value={createForm.supplierId}
                  onChange={(value) => setCreateForm((current) => ({ ...current, supplierId: value }))}
                  options={[
                    { label: 'Selecione...', value: '' },
                    ...supplierOptions.map((supplier) => ({ label: supplier.name, value: supplier.id })),
                  ]}
                />
                <FilterField
                  label="Data da compra"
                  type="date"
                  value={createForm.purchaseDate}
                  onChange={(value) => setCreateForm((current) => ({ ...current, purchaseDate: value }))}
                />
                <FilterField
                  label="Data de vencimento"
                  type="date"
                  value={createForm.dueDate}
                  onChange={(value) => setCreateForm((current) => ({ ...current, dueDate: value }))}
                />
                <FilterSelect
                  label="Conta Bancaria"
                  value={createForm.bankAccountId}
                  onChange={(value) => setCreateForm((current) => ({ ...current, bankAccountId: value }))}
                  options={[
                    { label: 'Selecione...', value: '' },
                    ...bankAccounts.filter(b => b.active).map((b) => ({ label: b.name, value: b.id })),
                  ]}
                />
                <FilterSelect
                  label="Centro de Custo"
                  value={createForm.costCenterId}
                  onChange={(value) => setCreateForm((current) => ({ ...current, costCenterId: value }))}
                  options={[
                    { label: 'Selecione...', value: '' },
                    ...costCenters.filter(c => c.active).map((c) => ({ label: c.name, value: c.id })),
                  ]}
                />
                <FilterSelect
                  label="Categoria contabil"
                  value={createForm.accountingCategoryId}
                  onChange={(value) => setCreateForm((current) => ({ ...current, accountingCategoryId: value }))}
                  options={[
                    { label: 'Selecione...', value: '' },
                    ...accountingCategories.filter(c => c.active && c.entryType === 'Pagar').map((c) => ({ label: c.name, value: c.id })),
                  ]}
                />
                <FilterSelect
                  label="Subcategoria contabil"
                  value={createForm.accountingSubcategoryId}
                  onChange={(value) => setCreateForm((current) => ({ ...current, accountingSubcategoryId: value }))}
                  options={[
                    { label: 'Selecione...', value: '' },
                    ...accountingSubcategories.filter(s => s.active && s.categoryId === createForm.accountingCategoryId).map((s) => ({ label: s.name, value: s.id })),
                  ]}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 mt-4 bg-gray-50 p-4 rounded-xl border border-gray-200">
                <FilterSelect
                  label="Forma de Pagamento"
                  value={createForm.paymentMethodId}
                  onChange={(value) => setCreateForm((current) => ({ ...current, paymentMethodId: value }))}
                  options={[
                    { label: 'Selecione...', value: '' },
                    ...paymentMethods.filter(p => p.active).map((p) => ({ label: p.name, value: p.id })),
                  ]}
                />
                <FilterSelect
                  label="Tipo de Pagamento"
                  value={createForm.paymentTypeId}
                  onChange={(value) => setCreateForm((current) => ({ ...current, paymentTypeId: value }))}
                  options={[
                    { label: 'Selecione...', value: '' },
                    ...paymentTypes.filter(p => p.active).map((p) => ({ label: p.name, value: p.id })),
                  ]}
                />
              </div>

              {paymentTypes.find(pt => pt.id === createForm.paymentTypeId)?.name.toLowerCase().includes('dividido') || 
               paymentTypes.find(pt => pt.id === createForm.paymentTypeId)?.name.toLowerCase().includes('prazo') ? (
                <div className="bg-orange-50 p-4 rounded-xl border border-orange-200">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-bold text-orange-900">Parcelas</h4>
                    <button
                      onClick={() =>
                        setCreateForm((current) => ({
                          ...current,
                          installments: [
                            ...current.installments,
                            { localId: `inst-${Date.now()}`, dueDate: '', amount: '' },
                          ],
                        }))
                      }
                      className="rounded-lg border border-orange-300 bg-white px-3 py-1.5 text-sm text-orange-800 hover:bg-orange-100"
                    >
                      + Adicionar Parcela
                    </button>
                  </div>
                  {createForm.installments.map((inst) => (
                    <div key={inst.localId} className="flex gap-3 mb-2 items-end">
                      <div className="flex-1">
                        <FilterField
                          label="Data Vencimento"
                          type="date"
                          value={inst.dueDate}
                          onChange={(value) => setCreateForm(c => ({
                            ...c, 
                            installments: c.installments.map(i => i.localId === inst.localId ? { ...i, dueDate: value } : i)
                          }))}
                        />
                      </div>
                      <div className="flex-1">
                        <FilterField
                          label="Valor"
                          type="number"
                          value={inst.amount}
                          onChange={(value) => setCreateForm(c => ({
                            ...c, 
                            installments: c.installments.map(i => i.localId === inst.localId ? { ...i, amount: value } : i)
                          }))}
                        />
                      </div>
                      <button
                        onClick={() =>
                          setCreateForm((current) => ({
                            ...current,
                            installments: current.installments.filter(i => i.localId !== inst.localId),
                          }))
                        }
                        className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700 hover:bg-red-200 h-[42px] mb-0.5"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  {createForm.installments.length === 0 && (
                    <p className="text-sm text-orange-700 mt-2">Nenhuma parcela adicionada. O valor deve bater com o total da compra.</p>
                  )}
                </div>
              ) : null}

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Observacoes</label>
                <textarea
                  rows={3}
                  value={createForm.notes}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, notes: event.target.value }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-gray-900">Itens da compra</h4>
                  <button
                    onClick={() =>
                      setCreateForm((current) => ({
                        ...current,
                        items: [
                          ...current.items,
                          {
                            localId: `item-${Date.now()}-${current.items.length + 1}`,
                            supplyItemId: '',
                            quantity: '',
                            unitCost: '',
                          },
                        ],
                      }))
                    }
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Adicionar item
                  </button>
                </div>
                {createForm.items.map((item, index) => (
                  <div key={item.localId} className="grid grid-cols-1 gap-3 rounded-lg border border-gray-200 p-4 md:grid-cols-4">
                    <FilterSelect
                      label="Insumo"
                      value={item.supplyItemId}
                      onChange={(value) => {
                        const supplyItem = getSupplyItemById(value);
                        setCreateForm((current) => ({
                          ...current,
                          items: current.items.map((entry) =>
                            entry.localId === item.localId
                              ? {
                                  ...entry,
                                  supplyItemId: value,
                                  unitCost: supplyItem?.defaultCost?.toString() ?? entry.unitCost,
                                }
                              : entry,
                          ),
                        }));
                      }}
                      options={[
                        { label: 'Selecione...', value: '' },
                        ...supplyItemOptions.map((supplyItem) => ({
                          label: supplyItem.name,
                          value: supplyItem.id,
                        })),
                      ]}
                    />
                    <FilterField
                      label="Quantidade"
                      type="number"
                      value={item.quantity}
                      onChange={(value) =>
                        setCreateForm((current) => ({
                          ...current,
                          items: current.items.map((entry) =>
                            entry.localId === item.localId ? { ...entry, quantity: value } : entry,
                          ),
                        }))
                      }
                    />
                    <FilterField
                      label="Custo unitario"
                      type="number"
                      value={item.unitCost}
                      onChange={(value) =>
                        setCreateForm((current) => ({
                          ...current,
                          items: current.items.map((entry) =>
                            entry.localId === item.localId ? { ...entry, unitCost: value } : entry,
                          ),
                        }))
                      }
                    />
                    <div className="flex items-end">
                      <button
                        onClick={() =>
                          setCreateForm((current) => ({
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
            </div>
            <div className="flex justify-end gap-3 border-t border-gray-200 p-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => void handleCreatePurchase()}
                disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
                Criar compra
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showReceiveModal && selectedPurchase ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-xl bg-white">
            <div className="border-b border-gray-200 p-6">
              <h3 className="text-xl font-bold text-gray-900">Recebimento da compra {selectedPurchase.number}</h3>
            </div>
            <div className="space-y-6 p-6">
              <FilterField
                label="Data do recebimento"
                type="date"
                value={receiveForm.receivedAt}
                onChange={(value) =>
                  setReceiveForm((current) => ({ ...current, receivedAt: value }))
                }
              />

              <div className="space-y-4">
                {selectedPurchase.items
                  .filter((item) => item.pendingQuantity > 0)
                  .map((item) => {
                    const values = receiveForm.items[item.id];
                    return (
                      <div key={item.id} className="rounded-lg border border-gray-200 p-4">
                        <div className="mb-3 flex items-start justify-between">
                          <div>
                            <h4 className="font-bold text-gray-900">{item.supplyItemName}</h4>
                            <p className="text-sm text-gray-600">
                              Pendente: {item.pendingQuantity.toLocaleString('pt-BR')} {getUnitSymbol(item.unitId)}
                            </p>
                          </div>
                          <span className="rounded-full bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-800">
                            {item.status}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-6">
                          <FilterField
                            label="Qtd recebida"
                            type="number"
                            value={values?.receivedQuantity || ''}
                            onChange={(value) =>
                              setReceiveForm((current) => ({
                                ...current,
                                items: {
                                  ...current.items,
                                  [item.id]: {
                                    ...current.items[item.id],
                                    receivedQuantity: value,
                                  },
                                },
                              }))
                            }
                          />
                          <FilterField
                            label="Lote fornecedor"
                            type="text"
                            value={values?.supplierLotNumber || ''}
                            onChange={(value) =>
                              setReceiveForm((current) => ({
                                ...current,
                                items: {
                                  ...current.items,
                                  [item.id]: {
                                    ...current.items[item.id],
                                    supplierLotNumber: value,
                                  },
                                },
                              }))
                            }
                          />
                          <FilterField
                            label="Fabricacao"
                            type="date"
                            value={values?.manufactureDate || ''}
                            onChange={(value) =>
                              setReceiveForm((current) => ({
                                ...current,
                                items: {
                                  ...current.items,
                                  [item.id]: {
                                    ...current.items[item.id],
                                    manufactureDate: value,
                                  },
                                },
                              }))
                            }
                          />
                          <FilterField
                            label="Validade"
                            type="date"
                            value={values?.expirationDate || ''}
                            onChange={(value) =>
                              setReceiveForm((current) => ({
                                ...current,
                                items: {
                                  ...current.items,
                                  [item.id]: {
                                    ...current.items[item.id],
                                    expirationDate: value,
                                  },
                                },
                              }))
                            }
                          />
                          <FilterSelect
                            label="Local"
                            value={values?.locationId || ''}
                            onChange={(value) =>
                              setReceiveForm((current) => ({
                                ...current,
                                items: {
                                  ...current.items,
                                  [item.id]: {
                                    ...current.items[item.id],
                                    locationId: value,
                                  },
                                },
                              }))
                            }
                            options={[
                              { label: 'Selecione...', value: '' },
                              ...supplyLocations.map((location) => ({
                                label: location.name,
                                value: location.id,
                              })),
                            ]}
                          />
                          <FilterField
                            label="Custo real"
                            type="number"
                            value={values?.unitCost || ''}
                            onChange={(value) =>
                              setReceiveForm((current) => ({
                                ...current,
                                items: {
                                  ...current.items,
                                  [item.id]: {
                                    ...current.items[item.id],
                                    unitCost: value,
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
            </div>
            <div className="flex justify-end gap-3 border-t border-gray-200 p-6">
              <button
                onClick={() => setShowReceiveModal(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => void handleReceivePurchase()}
                disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Confirmar recebimento
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Pedido de Compra</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este pedido de compra? Esta ação não pode ser desfeita.
              Isso também excluirá todos os recebimentos e lançamentos financeiros associados, e restaurará 
              os volumes dos lotes de insumos. A exclusão não será permitida se algum lote de insumo recebido já tiver sido consumido.
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
}: {
  title: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <p className="mb-1 text-sm text-gray-600">{title}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

function FilterField({
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

function FilterSelect({
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
