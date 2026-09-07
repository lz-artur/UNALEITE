import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { format, startOfDay } from 'date-fns';
import { ArrowRight, Check, ClipboardList, Loader2, MapPin, Package, Phone, Plus, RefreshCw, Search, ShoppingBag, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useCadastros } from '../context/CadastrosContext';
import { usePermissions } from '../context/PermissionsContext';
import type { EstoqueProduto } from '../data/mockData';
import { createSalesOrder, loadClients, loadFinishedProductLots, loadSalesOrders, type ClientRecord, type SalesOrderRecord } from '../services/operationsApi';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import '../../styles/vendedor.css';
import NovoClienteVendedor from './NovoClienteVendedor';

type CartItem = { productId: string; quantity: string; unitPrice: string };
const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const quantity = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const decimal = (value: string) => Number(value.replace(',', '.'));
const today = () => format(new Date(), 'yyyy-MM-dd');
const dateLabel = (date?: Date) => date && !Number.isNaN(date.getTime()) ? format(date, 'dd/MM/yyyy') : 'Não informada';

// A quantidade livre é a informada pelo estoque; pedidos ainda não expedidos não reservam lotes.
export function availableLots(lots: EstoqueProduto[], productId: string) {
  return lots.filter(lot => lot.produtoId === productId && lot.disponivel > 0 && lot.dataValidade >= startOfDay(new Date()));
}

export default function VendedorExterno() {
  const { finishedProducts, getUnitSymbol } = useCadastros();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const canCreate = !permissionsLoading && hasPermission('comercial', 'create');
  const [tab, setTab] = useState<'estoque' | 'comercial'>('estoque');
  const [commercialTab, setCommercialTab] = useState<'pedidos' | 'clientes'>('pedidos');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Todas');
  const [status, setStatus] = useState('Todos');
  const [lots, setLots] = useState<EstoqueProduto[]>([]);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [orders, setOrders] = useState<SalesOrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<SalesOrderRecord | null>(null);
  const [clientSearch, setClientSearch] = useState('');
  const [clientId, setClientId] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(today);
  const [dueDate, setDueDate] = useState(today);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const submitting = useRef(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [stock, customerList, orderList] = await Promise.all([
        loadFinishedProductLots({ requireLive: true }),
        loadClients(undefined, { requireLive: true }),
        loadSalesOrders(),
      ]);
      setLots(stock);
      setClients(customerList);
      setOrders(orderList.sort((a, b) => b.orderDate.getTime() - a.orderDate.getTime()));
      setUpdatedAt(new Date());
    } catch {
      setError('Não foi possível atualizar os dados. Verifique sua conexão e tente novamente.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const products = useMemo(() => finishedProducts.filter(p => p.active).map(product => {
    const validLots = availableLots(lots, product.id);
    return { ...product, available: validLots.reduce((sum, lot) => sum + lot.disponivel, 0),
      expiry: validLots.length ? new Date(Math.min(...validLots.map(lot => lot.dataValidade.getTime()))) : undefined };
  }), [finishedProducts, lots]);
  const categories = ['Todas', ...new Set(products.map(p => p.category).filter(Boolean))];
  const visibleProducts = products.filter(p => p.available > 0 && (category === 'Todas' || category === p.category) && normalize(`${p.name} ${p.code}`).includes(normalize(search)));
  const visibleOrders = orders.filter(o => (status === 'Todos' || o.status === status) && normalize(`${o.number} ${o.clientName}`).includes(normalize(search)));
  const visibleClients = clients.filter(c => c.active && normalize(`${c.name} ${c.tradeName ?? ''} ${c.document} ${c.city ?? ''}`).includes(normalize(search)));
  const cartTotal = cart.reduce((sum, item) => sum + (decimal(item.quantity) || 0) * (decimal(item.unitPrice) || 0), 0);
  const switchTab = (next: typeof tab) => { setTab(next); setSearch(''); };
  const updateItem = (productId: string, patch: Partial<CartItem>) => setCart(items => items.map(item => item.productId === productId ? { ...item, ...patch } : item));
  const addProduct = (productId: string) => {
    setCart(items => items.some(item => item.productId === productId) ? items : [...items, { productId, quantity: '', unitPrice: '' }]);
    setSaveError('');
  };

  const submitOrder = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting.current || !canCreate) return;
    setSaveError('');
    if (!clients.some(c => c.id === clientId && c.active)) { setSaveError('Selecione um cliente ativo.'); return; }
    if (!cart.length) { setSaveError('Adicione pelo menos um produto.'); return; }
    if (deliveryDate < today() || dueDate < today()) { setSaveError('As datas não podem ser anteriores a hoje.'); return; }
    const items = cart.map(item => ({ productId: item.productId, quantity: decimal(item.quantity), unitPrice: decimal(item.unitPrice) }));
    if (items.some(item => !Number.isFinite(item.quantity) || item.quantity < 0.0001 || !Number.isFinite(item.unitPrice) || item.unitPrice <= 0)) {
      setSaveError('Informe uma quantidade e um preço maiores que zero para cada produto.'); return;
    }
    submitting.current = true;
    setSaving(true);
    try {
      const currentLots = await loadFinishedProductLots({ requireLive: true });
      setLots(currentLots);
      for (const item of items) {
        const product = products.find(p => p.id === item.productId);
        const available = availableLots(currentLots, item.productId).reduce((sum, lot) => sum + lot.disponivel, 0);
        if (!product || item.quantity > available) throw new Error(`Estoque insuficiente para ${product?.name ?? 'o produto'}. Disponível: ${quantity(available)} ${getUnitSymbol(product?.unitId)}.`);
      }
      const order = await createSalesOrder({ clientId, orderDate: today(), deliveryDate, dueDate, notes: notes.trim() || undefined, items });
      setOrders(previous => [order, ...previous]);
      setCart([]);
      setClientId('');
      setClientSearch('');
      setNotes('');
      setReviewOpen(false);
      setSearch('');
      setStatus('Todos');
      setTab('comercial');
      setCommercialTab('pedidos');
      toast.success(`Pedido ${order.number} criado com sucesso.`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Não foi possível salvar o pedido. Tente novamente.');
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="seller">
      <header className="seller-heading">
        <div><p className="seller-eyebrow">UNA · NA ROTA COM VOCÊ</p><h1>Vendedor externo</h1><p>Estoque na mão. Sua próxima venda começa aqui.</p></div>
        <button className="seller-icon-button" aria-label="Atualizar dados" onClick={() => void refresh()} disabled={loading || saving || newClientOpen}><RefreshCw size={20} className={loading ? 'animate-spin' : ''} /></button>
      </header>
      <div className="seller-summary">
        <div className="seller-summary-icon"><Package size={26} /></div>
        <div><span>Prontos para vender</span><strong>{loading || error ? '—' : products.filter(p => p.available > 0).length} <small>produtos disponíveis</small></strong></div>
        <span className="seller-sync">{loading ? 'Atualizando…' : error ? 'Sem atualização' : `Atualizado às ${updatedAt ? format(updatedAt, 'HH:mm') : '—'}`}</span>
      </div>
      <nav className="seller-tabs" aria-label="Área do vendedor">
        <button aria-current={tab === 'estoque' ? 'page' : undefined} onClick={() => switchTab('estoque')}><Package size={20} />Estoque disponível</button>
        <button aria-current={tab === 'comercial' ? 'page' : undefined} onClick={() => switchTab('comercial')}><ShoppingBag size={20} />Comercial</button>
      </nav>
      <section className="seller-section">
        <div className="seller-section-heading"><div><h2>{tab === 'estoque' ? 'O que vamos vender hoje?' : 'Comercial'}</h2><p>{tab === 'estoque' ? 'Consulte o saldo e adicione produtos ao pedido.' : 'Consulte pedidos e encontre seus clientes.'}</p></div>
          {tab === 'comercial' && canCreate && (commercialTab === 'clientes'
            ? <button className="seller-primary" disabled={loading} onClick={() => setNewClientOpen(true)}><Plus size={18} />Novo cliente</button>
            : <button className="seller-primary" onClick={() => switchTab('estoque')}><Plus size={18} />Novo pedido</button>)}
        </div>
        {tab === 'comercial' && <div className="seller-segments"><button aria-pressed={commercialTab === 'pedidos'} onClick={() => { setCommercialTab('pedidos'); setSearch(''); }}><ClipboardList size={17} />Pedidos</button><button aria-pressed={commercialTab === 'clientes'} onClick={() => { setCommercialTab('clientes'); setSearch(''); }}><Users size={17} />Clientes</button></div>}
        <label className="seller-search"><Search size={20} /><input aria-label={tab === 'estoque' ? 'Buscar produto' : commercialTab === 'pedidos' ? 'Buscar pedido ou cliente' : 'Buscar cliente'} placeholder={tab === 'estoque' ? 'Buscar produto ou código' : commercialTab === 'pedidos' ? 'Buscar pedido ou cliente' : 'Nome, documento ou cidade'} value={search} onChange={e => setSearch(e.target.value)} /></label>
        {tab === 'estoque' ? <div className="seller-chips" aria-label="Categorias">{categories.map(c => <button key={c} aria-pressed={category === c} onClick={() => setCategory(c)}>{c}</button>)}</div> : commercialTab === 'pedidos' && <label className="seller-filter">Status do pedido<select value={status} onChange={e => setStatus(e.target.value)}>{['Todos', ...new Set(orders.map(o => o.status))].map(s => <option key={s}>{s}</option>)}</select></label>}
        {loading ? <div className="seller-empty" role="status"><Loader2 className="animate-spin" /><h3>Carregando dados…</h3></div> : error ? <div className="seller-empty" role="alert"><h3>Dados indisponíveis</h3><p>{error}</p><button className="seller-primary" onClick={() => void refresh()}>Tentar novamente</button></div> : <>
          {tab === 'estoque' && <><p className="seller-count">{visibleProducts.length} produtos encontrados · lotes dentro da validade</p><div className="seller-grid">{visibleProducts.map(p => {
            const added = cart.some(item => item.productId === p.id);
            return <article className="seller-card" key={p.id}><div className="seller-product-top"><div className="seller-product-icon"><Package size={24} /></div><span className="seller-badge">Disponível</span></div><p className="seller-code">{p.category} · {p.code}</p><h3>{p.name}</h3><div className="seller-stock"><strong>{quantity(p.available)}</strong><span>{getUnitSymbol(p.unitId)}</span></div><p className="seller-muted">Próxima validade: {dateLabel(p.expiry)}</p>{canCreate && <button className={added ? 'seller-added' : 'seller-add'} onClick={() => added ? setReviewOpen(true) : addProduct(p.id)}>{added ? <Check size={18} /> : <Plus size={18} />}{added ? 'No pedido · revisar' : 'Adicionar ao pedido'}</button>}</article>;
          })}</div>{!visibleProducts.length && <Empty title="Nenhum produto disponível" description="Tente outra busca ou atualize o estoque." />}<p className="seller-footnote">Saldo consultado no estoque. A disponibilidade é conferida novamente ao salvar; o pedido não reserva os produtos.</p></>}
          {tab === 'comercial' && commercialTab === 'pedidos' && <><p className="seller-count">{visibleOrders.length} pedidos encontrados</p><div className="seller-grid">{visibleOrders.map(order => <button className="seller-card seller-order" key={order.id} onClick={() => setSelectedOrder(order)}><div className="seller-row"><span className="seller-code">#{order.number}</span><span className="seller-badge neutral">{order.status}</span></div><h3>{order.clientName}</h3><p className="seller-muted">Pedido em {dateLabel(order.orderDate)}</p><p className="seller-muted">Entrega: {dateLabel(order.deliveryDate)}</p><div className="seller-order-bottom"><strong>{money(order.totalAmount)}</strong><span>Ver pedido <ArrowRight size={16} /></span></div></button>)}</div>{!visibleOrders.length && <Empty title="Nenhum pedido encontrado" description="Altere sua busca ou comece um pedido pelo estoque." />}</>}
          {tab === 'comercial' && commercialTab === 'clientes' && <><p className="seller-count">{visibleClients.length} clientes ativos</p><div className="seller-grid">{visibleClients.map(client => <article className="seller-card" key={client.id}><div className="seller-product-icon"><Users size={23} /></div><h3>{client.tradeName || client.name}</h3><p className="seller-muted">{client.name}</p><p className="seller-muted">{client.document}</p><p className="seller-location"><MapPin size={15} />{[client.city, client.state].filter(Boolean).join(' / ') || 'Cidade não informada'}</p><div className="seller-client-actions">{client.phone && <a className="seller-secondary" href={`tel:${client.phone.replace(/[^\d+]/g, '')}`}><Phone size={17} />Ligar</a>}{canCreate && <button className="seller-add" onClick={() => { setClientId(client.id); setClientSearch(''); switchTab('estoque'); toast.info(`Cliente selecionado: ${client.name}. Adicione os produtos.`); }}><Plus size={17} />Novo pedido</button>}</div></article>)}</div>{!visibleClients.length && <Empty title="Nenhum cliente encontrado" description="Tente buscar por nome, documento ou cidade." />}</>}
        </>}
      </section>
      {cart.length > 0 && canCreate && <div className="seller-cart-bar"><div><strong>{cart.length} {cart.length === 1 ? 'produto no pedido' : 'produtos no pedido'}</strong><span>{money(cartTotal)} · informe quantidade e preço</span></div><button className="seller-primary" disabled={loading || !!error} onClick={() => { setSaveError(''); setReviewOpen(true); }}>Revisar <ArrowRight size={18} /></button></div>}
      {newClientOpen && canCreate && <NovoClienteVendedor
        onClose={() => setNewClientOpen(false)}
        onCreated={client => {
          setClients(current => [...current.filter(entry => entry.id !== client.id), client].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
          setSearch('');
          setNewClientOpen(false);
          toast.success('Cliente cadastrado com sucesso.');
        }}
      />}
      <Dialog open={reviewOpen} onOpenChange={open => { if (!saving) setReviewOpen(open); }}>
        <DialogContent className="seller-dialog"><DialogHeader><DialogTitle>Revisar pedido</DialogTitle><DialogDescription>Selecione o cliente, informe os valores e confirme a venda.</DialogDescription></DialogHeader>
          <form onSubmit={submitOrder} className="seller-form"><fieldset disabled={saving}>
            <label>Buscar cliente<input placeholder="Nome ou documento" value={clientSearch} onChange={e => setClientSearch(e.target.value)} /></label>
            <label>Cliente<select required value={clientId} onChange={e => setClientId(e.target.value)}><option value="">Selecione um cliente</option>{clients.filter(c => c.active && (c.id === clientId || normalize(`${c.name} ${c.document}`).includes(normalize(clientSearch)))).map(c => <option value={c.id} key={c.id}>{c.name} · {c.document}</option>)}</select></label>
            {cart.map(item => { const product = products.find(p => p.id === item.productId); return <div className="seller-cart-item" key={item.productId}><div className="seller-row"><h3>{product?.name ?? 'Produto indisponível'}</h3><button type="button" className="seller-icon-button" aria-label={`Remover ${product?.name ?? 'produto'}`} onClick={() => setCart(items => items.filter(i => i.productId !== item.productId))}><Trash2 size={18} /></button></div><p className="seller-muted">Disponível: {quantity(product?.available ?? 0)} {getUnitSymbol(product?.unitId)}</p><div className="seller-form-grid"><label>Quantidade ({getUnitSymbol(product?.unitId)})<input required inputMode="decimal" placeholder="0" value={item.quantity} onChange={e => updateItem(item.productId, { quantity: e.target.value })} /></label><label>Preço unitário (R$)<input required inputMode="decimal" placeholder="0,00" value={item.unitPrice} onChange={e => updateItem(item.productId, { unitPrice: e.target.value })} /></label></div><p className="seller-subtotal">Subtotal: {money((decimal(item.quantity) || 0) * (decimal(item.unitPrice) || 0))}</p></div>; })}
            {!cart.length && <p>Seu pedido está vazio. Volte ao estoque para adicionar produtos.</p>}
            <div className="seller-form-grid"><label>Entrega<input type="date" required min={today()} value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} /></label><label>Vencimento<input type="date" required min={today()} value={dueDate} onChange={e => setDueDate(e.target.value)} /></label></div>
            <label>Observações<textarea rows={2} placeholder="Referência de entrega, horário…" value={notes} onChange={e => setNotes(e.target.value)} /></label>
          </fieldset><p className="seller-footnote">O estoque será conferido ao salvar. O pedido não reserva produtos.</p>{saveError && <p className="seller-error" role="alert">{saveError}</p>}<div className="seller-checkout"><div><span>Total do pedido</span><strong>{money(cartTotal)}</strong></div><button type="submit" className="seller-primary" disabled={saving || !cart.length || !canCreate || loading || !!error}>{saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}{saving ? 'Salvando…' : 'Salvar pedido'}</button></div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={!!selectedOrder} onOpenChange={open => { if (!open) setSelectedOrder(null); }}><DialogContent className="seller-dialog"><DialogHeader><DialogTitle>Pedido #{selectedOrder?.number}</DialogTitle><DialogDescription>{selectedOrder?.clientName}</DialogDescription></DialogHeader>{selectedOrder && <div className="seller-form"><span className="seller-badge neutral">{selectedOrder.status}</span><p>Entrega: {dateLabel(selectedOrder.deliveryDate)}<br />Vencimento: {dateLabel(selectedOrder.dueDate)}</p>{selectedOrder.items.map(item => <div className="seller-cart-item" key={item.id}><h3>{item.productName}</h3><p className="seller-muted">{quantity(item.orderedQuantity)} {getUnitSymbol(item.unitId)} × {money(item.unitPrice)}</p><strong>{money(item.totalValue)}</strong><p className="seller-muted">Atendido: {quantity(item.fulfilledQuantity)} · Pendente: {quantity(item.pendingQuantity)}</p></div>)}{selectedOrder.notes && <p className="seller-notes">{selectedOrder.notes}</p>}<div className="seller-checkout"><span>Total</span><strong>{money(selectedOrder.totalAmount)}</strong></div></div>}</DialogContent></Dialog>
    </div>
  );
}

function Empty({ title, description }: { title: string; description: string }) {
  return <div className="seller-empty"><Search size={30} /><h3>{title}</h3><p>{description}</p></div>;
}
