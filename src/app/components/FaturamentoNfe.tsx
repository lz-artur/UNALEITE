import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  Download,
  FileCheck2,
  FilePlus2,
  Loader2,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { usePermissions } from '../context/PermissionsContext';
import {
  authorizeNfe,
  cancelNfe,
  createNfeDraft,
  deleteNfe,
  getNfe,
  getNfeAsset,
  getNfeConfig,
  listEligibleOrders,
  listNfe,
  reconcileNfe,
  testSefazStatus,
  updateNfe,
  updateNfeConfig,
  updateNfeItem,
  uploadNfeCertificate,
  validateNfe,
  type EligibleOrder,
  type NfeConfig,
  type NfeInvoice,
  type NfeItem,
} from '../services/nfeApi';

const STATUS_STYLE: Record<string, string> = {
  RASCUNHO: 'bg-slate-100 text-slate-700', VALIDADA: 'bg-blue-100 text-blue-700',
  AUTORIZANDO: 'bg-amber-100 text-amber-700', AUTORIZADA: 'bg-emerald-100 text-emerald-700',
  REJEITADA: 'bg-red-100 text-red-700', PENDENTE_CONCILIACAO: 'bg-orange-100 text-orange-700',
  CANCELANDO: 'bg-amber-100 text-amber-700', CANCELADA: 'bg-gray-200 text-gray-600',
};

const STATUS_LABEL: Record<string, string> = {
  RASCUNHO: 'Rascunho', VALIDADA: 'Pronta para emitir', AUTORIZANDO: 'Enviando', AUTORIZADA: 'Autorizada',
  REJEITADA: 'Rejeitada', PENDENTE_CONCILIACAO: 'Aguardando consulta', CANCELANDO: 'Cancelando', CANCELADA: 'Cancelada',
};

function money(value: number | string | undefined) {
  return Number(value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function digits(value: string | undefined) {
  return (value ?? '').replace(/\D/g, '');
}

function Field({ label, value, onChange, type = 'text', disabled = false, placeholder }: {
  label: string; value: string | number | undefined; onChange: (value: string) => void;
  type?: string; disabled?: boolean; placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span>
      <input type={type} value={value ?? ''} disabled={disabled} placeholder={placeholder} onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500" />
    </label>
  );
}

function SelectField({ label, value, onChange, options, disabled = false }: {
  label: string;
  value: string | number | undefined;
  onChange: (value: string) => void;
  options: Array<{ value: string | number; label: string }>;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span>
      <select value={value ?? ''} disabled={disabled} onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500">
        <option value="">Selecione...</option>
        {options.map((option) => <option key={String(option.value)} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

export default function FaturamentoNfe() {
  const { hasPermission } = usePermissions();
  const [tab, setTab] = useState<'notas' | 'config'>('notas');
  const [invoices, setInvoices] = useState<NfeInvoice[]>([]);
  const [eligible, setEligible] = useState<EligibleOrder[]>([]);
  const [selected, setSelected] = useState<NfeInvoice | null>(null);
  const [config, setConfig] = useState<NfeConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [selectedOrder, setSelectedOrder] = useState('');
  const [certificate, setCertificate] = useState<File | null>(null);
  const [certificatePassword, setCertificatePassword] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [notes, orders, fiscalConfig] = await Promise.all([
        listNfe({ status: status || undefined, search: search || undefined }),
        listEligibleOrders(),
        getNfeConfig(),
      ]);
      setInvoices(notes);
      setEligible(orders);
      setConfig(fiscalConfig);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível carregar o faturamento.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [status]);

  const openInvoice = async (id: string) => {
    setBusy(true);
    try { setSelected(await getNfe(id)); } finally { setBusy(false); }
  };

  const refreshSelected = async () => {
    if (!selected) return;
    const detail = await getNfe(selected.id);
    setSelected(detail);
  };

  const createDraft = async () => {
    if (!selectedOrder) return toast.error('Selecione um pedido atendido.');
    setBusy(true);
    try {
      const draft = await createNfeDraft(selectedOrder);
      setSelected(draft);
      setSelectedOrder('');
      await load();
    } finally { setBusy(false); }
  };

  const saveHeader = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const updated = await updateNfe(selected.id, {
        natureOfOperation: selected.nature_of_operation,
        operationType: Number(selected.operation_type), purpose: Number(selected.purpose), presenceIndicator: Number(selected.presence_indicator),
        finalConsumer: selected.final_consumer, freightMode: Number(selected.freight_mode),
        recipient: selected.recipient_snapshot, payment: selected.payment_snapshot,
        additionalInfo: selected.additional_info, fiscalAdditionalInfo: selected.fiscal_additional_info,
      });
      setSelected(updated);
      toast.success('Dados da nota salvos.');
      await load();
    } finally { setBusy(false); }
  };

  const saveItem = async (item: NfeItem) => {
    if (!selected) return;
    setBusy(true);
    try {
      const updated = await updateNfeItem(selected.id, item.id, {
        productCode: item.product_code, fiscalName: item.fiscal_name_snapshot, ncm: digits(item.ncm), cest: digits(item.cest), cfop: digits(item.cfop),
        goodsOrigin: item.goods_origin, commercialUnitSymbol: item.commercial_unit_symbol,
        taxUnitSymbol: item.tax_unit_symbol, discountValue: Number(item.discount_value),
        icmsCst: item.icms_cst, icmsRate: Number(item.icms_rate), pisCst: item.pis_cst,
        pisRate: Number(item.pis_rate), cofinsCst: item.cofins_cst, cofinsRate: Number(item.cofins_rate),
        ibsCbsCst: item.ibs_cbs_cst, ibsCbsClassification: item.ibs_cbs_classification,
        ibsStateRate: Number(item.ibs_state_rate), ibsStateReduction: Number(item.ibs_state_reduction),
        ibsCityRate: Number(item.ibs_city_rate), ibsCityReduction: Number(item.ibs_city_reduction),
        cbsRate: Number(item.cbs_rate), cbsReduction: Number(item.cbs_reduction),
        additionalInfo: item.additional_info,
      });
      setSelected(updated);
      toast.success(`Item ${item.item_number} salvo.`);
    } finally { setBusy(false); }
  };

  const runValidation = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const result = await validateNfe(selected.id);
      setSelected(result);
      if (result.validation?.valid) toast.success('Nota pronta para emissão.');
      else toast.warning(`Ainda faltam ${result.validation?.issues.length ?? 0} informações.`);
      await load();
    } finally { setBusy(false); }
  };

  const authorize = async () => {
    if (!selected || !window.confirm('Enviar esta NF-e para autorização na SEFAZ?')) return;
    setBusy(true);
    try {
      const result = await authorizeNfe(selected.id);
      setSelected(result);
      result.status === 'AUTORIZADA' ? toast.success('NF-e autorizada pela SEFAZ.') : toast.error(result.rejection_reason ?? 'NF-e rejeitada.');
      await load();
    } finally { setBusy(false); }
  };

  const cancel = async () => {
    if (!selected) return;
    const justification = window.prompt('Informe a justificativa do cancelamento (mínimo de 15 caracteres):');
    if (!justification) return;
    setBusy(true);
    try { setSelected(await cancelNfe(selected.id, justification)); await load(); } finally { setBusy(false); }
  };

  const download = async (type: 'xml' | 'danfe') => {
    if (!selected) return;
    const asset = await getNfeAsset(selected.id, type);
    window.open(asset.url, '_blank', 'noopener,noreferrer');
  };

  const updateSelectedItem = (id: string, field: keyof NfeItem, value: string | number) => {
    setSelected((current) => current ? { ...current, items: current.items?.map((item) => item.id === id ? { ...item, [field]: value } : item) } : current);
  };

  const applyHomologationProduct = (id: string) => {
    setSelected((current) => current ? {
      ...current,
      items: current.items?.map((item) => item.id === id ? {
        ...item,
        product_code: '1861',
        fiscal_name_snapshot: 'QUEIJO TIPO MUSSARELA',
        ncm: '04061010',
        cfop: '5101',
        goods_origin: '0',
        commercial_unit_symbol: 'KG',
        tax_unit_symbol: 'KG',
        icms_cst: '00',
        icms_rate: 20.5,
        pis_cst: '06',
        pis_rate: 0,
        cofins_cst: '06',
        cofins_rate: 0,
        ibs_cbs_cst: '200',
        ibs_cbs_classification: '200003',
        ibs_state_rate: 0.1,
        ibs_state_reduction: 100,
        ibs_city_rate: 0,
        ibs_city_reduction: 100,
        cbs_rate: 0.9,
        cbs_reduction: 100,
      } : item),
    } : current);
    toast.success('Dados fiscais de homologação aplicados ao item.');
  };

  const completion = useMemo(() => {
    if (!selected) return 0;
    if (selected.validation) return selected.validation.completionPercentage;
    return selected.validation_issues?.length ? 50 : selected.status === 'VALIDADA' || selected.status === 'AUTORIZADA' ? 100 : 0;
  }, [selected]);

  if (selected) {
    const editable = ['RASCUNHO', 'VALIDADA', 'REJEITADA'].includes(selected.status);
    const issues = selected.validation?.issues ?? selected.validation_issues ?? [];
    const recipient = selected.recipient_snapshot ?? {};
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => setSelected(null)} className="rounded-xl border border-slate-200 p-2 hover:bg-slate-50"><ChevronLeft className="h-5 w-5" /></button>
            <div>
              <div className="flex items-center gap-2"><h2 className="text-2xl font-bold text-slate-900">NF-e {selected.number ? `nº ${selected.number}` : 'em preparação'}</h2><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[selected.status]}`}>{STATUS_LABEL[selected.status]}</span></div>
              <p className="text-sm text-slate-500">Pedido {selected.sales_order?.order_number ?? selected.sales_order_id} · Série {selected.series} · {selected.environment === 'homologacao' ? 'Homologação' : 'Produção'}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {selected.status === 'AUTORIZADA' && <><button onClick={() => void download('xml')} className="btn-secondary"><Download className="h-4 w-4" /> XML</button><button onClick={() => void download('danfe')} className="btn-secondary"><Download className="h-4 w-4" /> DANFE</button></>}
            {selected.status === 'PENDENTE_CONCILIACAO' && <button disabled={busy} onClick={() => void reconcileNfe(selected.id).then(setSelected)} className="btn-secondary"><RefreshCw className="h-4 w-4" /> Consultar SEFAZ</button>}
            {editable && hasPermission('faturamento', 'edit') && <button disabled={busy} onClick={() => void runValidation()} className="btn-secondary"><FileCheck2 className="h-4 w-4" /> Validar</button>}
            {editable && hasPermission('faturamento', 'authorize') && <button disabled={busy} onClick={() => void authorize()} className="btn-primary"><Send className="h-4 w-4" /> Emitir NF-e</button>}
            {selected.status === 'AUTORIZADA' && hasPermission('faturamento', 'cancel') && <button disabled={busy} onClick={() => void cancel()} className="btn-danger"><XCircle className="h-4 w-4" /> Cancelar</button>}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-2 flex justify-between text-sm"><span className="font-medium text-slate-700">Preenchimento fiscal</span><span className="font-bold text-blue-700">{completion}%</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-blue-600 transition-all" style={{ width: `${completion}%` }} /></div>
        </div>

        {selected.rejection_reason && <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertTriangle className="h-5 w-5 shrink-0" /><div><strong>{selected.rejection_code ? `Rejeição ${selected.rejection_code}: ` : ''}</strong>{selected.rejection_reason}</div></div>}
        {issues.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><h3 className="mb-2 flex items-center gap-2 font-semibold text-amber-900"><AlertTriangle className="h-4 w-4" /> Informações pendentes</h3><ul className="grid gap-1 text-sm text-amber-800 md:grid-cols-2">{issues.map((issue, index) => <li key={`${issue.field}-${index}`}>• {issue.message}</li>)}</ul></div>}

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between"><h3 className="font-bold text-slate-900">Dados da operação</h3>{editable && <button disabled={busy} onClick={() => void saveHeader()} className="btn-primary"><Save className="h-4 w-4" /> Salvar</button>}</div>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="md:col-span-2"><Field label="Natureza da operação" value={selected.nature_of_operation} disabled={!editable} onChange={(value) => setSelected({ ...selected, nature_of_operation: value })} /></div>
            <SelectField label="Tipo da nota" value={selected.operation_type} disabled={!editable} onChange={(value) => setSelected({ ...selected, operation_type: Number(value) })} options={[{ value: 1, label: '1 — Saída' }, { value: 0, label: '0 — Entrada' }]} />
            <SelectField label="Finalidade" value={selected.purpose} disabled={!editable} onChange={(value) => setSelected({ ...selected, purpose: Number(value) })} options={[{ value: 1, label: '1 — NF-e normal' }, { value: 2, label: '2 — Complementar' }, { value: 3, label: '3 — Ajuste' }, { value: 4, label: '4 — Devolução' }]} />
            <SelectField label="Presença do comprador" value={selected.presence_indicator} disabled={!editable} onChange={(value) => setSelected({ ...selected, presence_indicator: Number(value) })} options={[{ value: 0, label: '0 — Não se aplica' }, { value: 1, label: '1 — Presencial' }, { value: 2, label: '2 — Internet' }, { value: 3, label: '3 — Teleatendimento' }, { value: 4, label: '4 — Entrega a domicílio' }, { value: 5, label: '5 — Presencial fora do estabelecimento' }, { value: 9, label: '9 — Não presencial, outros' }]} />
            <SelectField label="Consumidor final" value={selected.final_consumer ? '1' : '0'} disabled={!editable} onChange={(value) => setSelected({ ...selected, final_consumer: value === '1' })} options={[{ value: '0', label: 'Não consumidor final' }, { value: '1', label: 'Consumidor final' }]} />
            <SelectField label="Modalidade do frete" value={selected.freight_mode} disabled={!editable} onChange={(value) => setSelected({ ...selected, freight_mode: Number(value) })} options={[{ value: 0, label: '0 — Por conta do remetente' }, { value: 1, label: '1 — Por conta do destinatário' }, { value: 2, label: '2 — Por conta de terceiros' }, { value: 9, label: '9 — Sem frete' }]} />
            <SelectField label="Forma de pagamento" value={selected.payment_snapshot?.method_code} disabled={!editable} onChange={(value) => setSelected({ ...selected, payment_snapshot: { ...selected.payment_snapshot, method_code: value } })} options={[{ value: '01', label: '01 — Dinheiro' }, { value: '03', label: '03 — Cartão de crédito' }, { value: '04', label: '04 — Cartão de débito' }, { value: '15', label: '15 — Boleto bancário' }, { value: '17', label: '17 — PIX dinâmico' }, { value: '20', label: '20 — PIX estático' }, { value: '90', label: '90 — Sem pagamento' }, { value: '99', label: '99 — Outros' }]} />
            <div className="md:col-span-2"><Field label="Informações complementares" value={selected.additional_info} disabled={!editable} onChange={(value) => setSelected({ ...selected, additional_info: value })} /></div>
          </div>
          <p className="mt-3 text-xs text-slate-500">O valor do pagamento será preenchido automaticamente com o total da NF-e.</p>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="mb-4 font-bold text-slate-900">Destinatário</h3>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="md:col-span-2"><Field label="Nome / razão social" value={recipient.name} disabled={!editable} onChange={(value) => setSelected({ ...selected, recipient_snapshot: { ...recipient, name: value } })} /></div>
            <Field label="CPF/CNPJ" value={recipient.document} disabled={!editable} onChange={(value) => setSelected({ ...selected, recipient_snapshot: { ...recipient, document: value } })} />
            <Field label="Indicador IE (1, 2 ou 9)" value={recipient.ie_indicator} disabled={!editable} onChange={(value) => setSelected({ ...selected, recipient_snapshot: { ...recipient, ie_indicator: value } })} />
            <Field label="Inscrição estadual" value={recipient.state_registration} disabled={!editable} onChange={(value) => setSelected({ ...selected, recipient_snapshot: { ...recipient, state_registration: value } })} />
            <div className="md:col-span-2"><Field label="Logradouro" value={recipient.address} disabled={!editable} onChange={(value) => setSelected({ ...selected, recipient_snapshot: { ...recipient, address: value } })} /></div>
            <Field label="Número" value={recipient.address_number} disabled={!editable} onChange={(value) => setSelected({ ...selected, recipient_snapshot: { ...recipient, address_number: value } })} />
            <Field label="Bairro" value={recipient.neighborhood} disabled={!editable} onChange={(value) => setSelected({ ...selected, recipient_snapshot: { ...recipient, neighborhood: value } })} />
            <Field label="Código IBGE" value={recipient.city_code} disabled={!editable} onChange={(value) => setSelected({ ...selected, recipient_snapshot: { ...recipient, city_code: value } })} />
            <Field label="Município" value={recipient.city} disabled={!editable} onChange={(value) => setSelected({ ...selected, recipient_snapshot: { ...recipient, city: value } })} />
            <Field label="UF" value={recipient.state} disabled={!editable} onChange={(value) => setSelected({ ...selected, recipient_snapshot: { ...recipient, state: value.toUpperCase() } })} />
            <Field label="CEP" value={recipient.cep} disabled={!editable} onChange={(value) => setSelected({ ...selected, recipient_snapshot: { ...recipient, cep: value } })} />
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="font-bold text-slate-900">Produtos da nota</h3>
          {selected.items?.map((item) => <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-2"><div><span className="text-xs font-semibold text-blue-600">ITEM {item.item_number}</span><h4 className="font-semibold text-slate-900">{item.product_name_snapshot}</h4><p className="text-xs text-slate-500">Nome interno — não será enviado à SEFAZ</p></div><div className="text-right"><strong>{money(item.total_value)}</strong><p className="text-xs text-slate-500">{item.commercial_quantity} × {money(item.unit_price)}</p></div></div>
            <div className="grid gap-4 md:grid-cols-6">
              <Field label="Código fiscal" value={item.product_code} disabled={!editable} onChange={(v) => updateSelectedItem(item.id, 'product_code', v)} />
              <div className="md:col-span-3"><Field label="Nome fiscal do produto (vai na NF-e)" value={item.fiscal_name_snapshot} disabled={!editable} onChange={(v) => updateSelectedItem(item.id, 'fiscal_name_snapshot', v)} /></div>
              <Field label="NCM" value={item.ncm} disabled={!editable} onChange={(v) => updateSelectedItem(item.id, 'ncm', v)} />
              <Field label="CEST" value={item.cest} disabled={!editable} onChange={(v) => updateSelectedItem(item.id, 'cest', v)} />
              <Field label="CFOP" value={item.cfop} disabled={!editable} onChange={(v) => updateSelectedItem(item.id, 'cfop', v)} />
              <Field label="Origem" value={item.goods_origin} disabled={!editable} onChange={(v) => updateSelectedItem(item.id, 'goods_origin', v)} />
              <Field label="Unidade comercial" value={item.commercial_unit_symbol} disabled={!editable} onChange={(v) => updateSelectedItem(item.id, 'commercial_unit_symbol', v)} />
              <Field label="Unidade tributável" value={item.tax_unit_symbol} disabled={!editable} onChange={(v) => updateSelectedItem(item.id, 'tax_unit_symbol', v)} />
              <Field label="CST ICMS" value={item.icms_cst} disabled={!editable} onChange={(v) => updateSelectedItem(item.id, 'icms_cst', v)} />
              <Field label="ICMS %" type="number" value={item.icms_rate} disabled={!editable} onChange={(v) => updateSelectedItem(item.id, 'icms_rate', Number(v))} />
              <Field label="CST PIS" value={item.pis_cst} disabled={!editable} onChange={(v) => updateSelectedItem(item.id, 'pis_cst', v)} />
              <Field label="PIS %" type="number" value={item.pis_rate} disabled={!editable} onChange={(v) => updateSelectedItem(item.id, 'pis_rate', Number(v))} />
              <Field label="CST COFINS" value={item.cofins_cst} disabled={!editable} onChange={(v) => updateSelectedItem(item.id, 'cofins_cst', v)} />
              <Field label="COFINS %" type="number" value={item.cofins_rate} disabled={!editable} onChange={(v) => updateSelectedItem(item.id, 'cofins_rate', Number(v))} />
              <Field label="CST IBS/CBS" value={item.ibs_cbs_cst} disabled={!editable} onChange={(v) => updateSelectedItem(item.id, 'ibs_cbs_cst', v)} />
              <div className="md:col-span-2"><Field label="Classificação IBS/CBS" value={item.ibs_cbs_classification} disabled={!editable} onChange={(v) => updateSelectedItem(item.id, 'ibs_cbs_classification', v)} /></div>
              <Field label="IBS UF %" type="number" value={item.ibs_state_rate} disabled={!editable} onChange={(v) => updateSelectedItem(item.id, 'ibs_state_rate', Number(v))} />
              <Field label="Redução IBS UF %" type="number" value={item.ibs_state_reduction} disabled={!editable} onChange={(v) => updateSelectedItem(item.id, 'ibs_state_reduction', Number(v))} />
              <Field label="IBS município %" type="number" value={item.ibs_city_rate} disabled={!editable} onChange={(v) => updateSelectedItem(item.id, 'ibs_city_rate', Number(v))} />
              <Field label="Redução IBS município %" type="number" value={item.ibs_city_reduction} disabled={!editable} onChange={(v) => updateSelectedItem(item.id, 'ibs_city_reduction', Number(v))} />
              <Field label="CBS %" type="number" value={item.cbs_rate} disabled={!editable} onChange={(v) => updateSelectedItem(item.id, 'cbs_rate', Number(v))} />
              <Field label="Redução CBS %" type="number" value={item.cbs_reduction} disabled={!editable} onChange={(v) => updateSelectedItem(item.id, 'cbs_reduction', Number(v))} />
            </div>
            <p className="mt-3 text-xs text-slate-500">Quantidade e valor unitário vêm do pedido atendido. Confira-os acima antes de emitir.</p>
            {editable && <div className="mt-4 flex flex-wrap justify-end gap-2">{selected.environment === 'homologacao' && <button disabled={busy} onClick={() => applyHomologationProduct(item.id)} className="btn-secondary"><ShieldCheck className="h-4 w-4" /> Aplicar perfil do queijo teste</button>}<button disabled={busy} onClick={() => void saveItem(item)} className="btn-secondary"><Save className="h-4 w-4" /> Salvar item</button></div>}
          </div>)}
        </section>

        <section className="rounded-xl border border-slate-200 bg-slate-900 p-5 text-white"><div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6"><Total label="Produtos" value={selected.total_products} /><Total label="ICMS" value={selected.total_icms} /><Total label="PIS" value={selected.total_pis} /><Total label="COFINS" value={selected.total_cofins} /><Total label="IBS + CBS" value={Number(selected.total_ibs) + Number(selected.total_cbs)} /><Total label="Total NF-e" value={selected.total_nfe} highlight /></div>{selected.access_key && <p className="mt-4 border-t border-slate-700 pt-3 font-mono text-xs text-slate-300">Chave: {selected.access_key}</p>}</section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-2xl font-bold text-slate-900">Faturamento NF-e</h2><p className="text-sm text-slate-500">Emissão direta de NF-e modelo 55 para a SEFAZ</p></div><div className="flex rounded-xl border border-slate-200 bg-white p-1"><button onClick={() => setTab('notas')} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === 'notas' ? 'bg-blue-600 text-white' : 'text-slate-600'}`}>Notas fiscais</button>{hasPermission('faturamento', 'configure') && <button onClick={() => setTab('config')} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === 'config' ? 'bg-blue-600 text-white' : 'text-slate-600'}`}><Settings className="mr-1 inline h-4 w-4" />Configuração</button>}</div></div>
      {tab === 'config' && config ? <ConfigPanel config={config} setConfig={setConfig} busy={busy} setBusy={setBusy} certificate={certificate} setCertificate={setCertificate} password={certificatePassword} setPassword={setCertificatePassword} /> : <>
        <div className={`flex items-center gap-3 rounded-xl border p-4 ${config?.environment === 'homologacao' ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-red-200 bg-red-50 text-red-800'}`}><ShieldCheck className="h-5 w-5" /><div><strong>Ambiente de {config?.environment === 'homologacao' ? 'homologação' : 'produção'}</strong><p className="text-xs">{config?.environment === 'homologacao' ? 'As notas emitidas aqui não possuem valor fiscal.' : 'Atenção: as notas possuem valor fiscal.'}</p></div></div>
        {hasPermission('faturamento', 'create') && <div className="rounded-xl border border-slate-200 bg-white p-5"><h3 className="mb-3 font-bold text-slate-900">Criar nota a partir de um pedido atendido</h3><div className="flex flex-col gap-3 md:flex-row"><select value={selectedOrder} onChange={(e) => setSelectedOrder(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"><option value="">Selecione o pedido...</option>{eligible.map((order) => <option key={order.id} value={order.id}>{order.order_number} · {order.client?.name} · {money(order.total_amount)}</option>)}</select><button disabled={busy || !selectedOrder} onClick={() => void createDraft()} className="btn-primary"><FilePlus2 className="h-4 w-4" /> Preparar NF-e</button></div>{eligible.length === 0 && <p className="mt-2 text-xs text-slate-500">Nenhum pedido totalmente atendido está aguardando faturamento.</p>}</div>}
        <div className="flex flex-col gap-3 md:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void load()} placeholder="Buscar por número, cliente, pedido ou chave" className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm" /></div><select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"><option value="">Todos os status</option>{Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button onClick={() => void load()} className="btn-secondary"><RefreshCw className="h-4 w-4" /> Atualizar</button></div>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">{loading ? <div className="flex justify-center p-12"><Loader2 className="h-7 w-7 animate-spin text-blue-600" /></div> : invoices.length === 0 ? <div className="p-12 text-center text-sm text-slate-500">Nenhuma NF-e encontrada.</div> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Nota / pedido</th><th className="px-4 py-3">Cliente</th><th className="px-4 py-3">Emissão</th><th className="px-4 py-3">Valor</th><th className="px-4 py-3">Status</th><th className="px-4 py-3"></th></tr></thead><tbody className="divide-y divide-slate-100">{invoices.map((invoice) => <tr key={invoice.id} onClick={() => void openInvoice(invoice.id)} className="cursor-pointer hover:bg-blue-50/40"><td className="px-4 py-3"><strong>{invoice.number ? `NF-e ${invoice.number}` : 'Sem número'}</strong><p className="text-xs text-slate-500">{invoice.sales_order?.order_number}</p></td><td className="px-4 py-3">{invoice.client?.name ?? '—'}</td><td className="px-4 py-3">{new Date(invoice.created_at).toLocaleDateString('pt-BR')}</td><td className="px-4 py-3 font-semibold">{money(invoice.total_nfe)}</td><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[invoice.status]}`}>{STATUS_LABEL[invoice.status]}</span></td><td className="px-4 py-3 text-right">{['RASCUNHO', 'VALIDADA', 'REJEITADA'].includes(invoice.status) && hasPermission('faturamento', 'delete') && <button onClick={(event) => { event.stopPropagation(); if (window.confirm('Excluir este rascunho?')) void deleteNfe(invoice.id).then(load); }} className="rounded-lg p-2 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>}</td></tr>)}</tbody></table></div>}</div>
      </>}
      {busy && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 backdrop-blur-[1px]"><div className="flex items-center gap-3 rounded-xl bg-white px-5 py-4 shadow-xl"><Loader2 className="h-5 w-5 animate-spin text-blue-600" /> Processando...</div></div>}
    </div>
  );
}

function Total({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return <div><p className="text-xs text-slate-400">{label}</p><p className={highlight ? 'text-xl font-bold text-emerald-300' : 'font-semibold'}>{money(value)}</p></div>;
}

function ConfigPanel({ config, setConfig, busy, setBusy, certificate, setCertificate, password, setPassword }: {
  config: NfeConfig; setConfig: (config: NfeConfig) => void; busy: boolean; setBusy: (busy: boolean) => void;
  certificate: File | null; setCertificate: (file: File | null) => void; password: string; setPassword: (password: string) => void;
}) {
  const set = (field: keyof NfeConfig, value: any) => setConfig({ ...config, [field]: value });
  const save = async () => {
    let productionActivation: string | undefined;
    if (config.environment === 'producao') {
      const confirmation = window.prompt('A produção gera documentos fiscais com valor legal. Para confirmar, digite: ATIVAR PRODUCAO');
      if (confirmation !== 'ATIVAR PRODUCAO') {
        toast.error('A ativação da produção foi cancelada.');
        return;
      }
      productionActivation = confirmation;
    }
    setBusy(true);
    try {
      const result = await updateNfeConfig({
        legalName: config.legal_name, tradeName: config.trade_name, cnpj: digits(config.cnpj),
        stateRegistration: digits(config.state_registration), taxRegime: Number(config.tax_regime), cnae: digits(config.cnae),
        address: config.address, addressNumber: config.address_number, addressComplement: config.address_complement,
        neighborhood: config.neighborhood, cityCode: digits(config.city_code), cityName: config.city_name,
        state: config.state, cep: digits(config.cep), countryCode: config.country_code, countryName: config.country_name,
        phone: digits(config.phone), environment: config.environment, productionActivation, series: Number(config.series), initialNumber: Number(config.initial_number),
        applicationVersion: config.application_version, defaultNatureOfOperation: config.default_nature_of_operation,
        defaultIcmsRate: Number(config.default_icms_rate), defaultPisRate: Number(config.default_pis_rate),
        defaultCofinsRate: Number(config.default_cofins_rate), defaultAdditionalInfo: config.default_additional_info,
      });
      setConfig(result); toast.success('Configuração fiscal salva.');
    } finally { setBusy(false); }
  };
  const sendCertificate = async () => {
    if (!certificate || !password) return toast.error('Selecione o certificado e informe a senha.');
    setBusy(true);
    try { setConfig(await uploadNfeCertificate(certificate, password)); setPassword(''); setCertificate(null); toast.success('Certificado A1 configurado.'); } finally { setBusy(false); }
  };
  return <div className="space-y-5">
    <section className="rounded-xl border border-slate-200 bg-white p-5"><div className="mb-4 flex items-center justify-between"><div><h3 className="font-bold text-slate-900">Emitente</h3><p className="text-xs text-slate-500">Dados que identificam a JPS UNAMILK na NF-e.</p></div><button disabled={busy} onClick={() => void save()} className="btn-primary"><Save className="h-4 w-4" /> Salvar configuração</button></div><div className="grid gap-4 md:grid-cols-4"><div className="md:col-span-2"><Field label="Razão social" value={config.legal_name} onChange={(v) => set('legal_name', v)} /></div><Field label="Nome fantasia (opcional)" value={config.trade_name} onChange={(v) => set('trade_name', v)} /><Field label="CNPJ" value={config.cnpj} onChange={(v) => set('cnpj', v)} /><Field label="Inscrição estadual" value={config.state_registration} onChange={(v) => set('state_registration', v)} /><Field label="Regime tributário (CRT)" type="number" value={config.tax_regime} onChange={(v) => set('tax_regime', Number(v))} /><Field label="CNAE" value={config.cnae} onChange={(v) => set('cnae', v)} /><Field label="Série da NF-e" type="number" value={config.series} onChange={(v) => set('series', Number(v))} /><Field label="Número inicial" type="number" value={config.initial_number} onChange={(v) => set('initial_number', Number(v))} /><div className="md:col-span-2"><Field label="Logradouro" value={config.address} onChange={(v) => set('address', v)} /></div><Field label="Número" value={config.address_number} onChange={(v) => set('address_number', v)} /><Field label="Complemento" value={config.address_complement} onChange={(v) => set('address_complement', v)} /><Field label="Bairro" value={config.neighborhood} onChange={(v) => set('neighborhood', v)} /><Field label="Código IBGE do município" value={config.city_code} onChange={(v) => set('city_code', v)} /><Field label="Município" value={config.city_name} onChange={(v) => set('city_name', v)} /><Field label="UF" value={config.state} onChange={(v) => set('state', v.toUpperCase())} /><Field label="CEP" value={config.cep} onChange={(v) => set('cep', v)} /><Field label="Telefone" value={config.phone} onChange={(v) => set('phone', v)} /></div></section>
    <section className={`rounded-xl border p-5 ${config.environment === 'producao' ? 'border-red-200 bg-red-50' : 'border-blue-200 bg-blue-50'}`}><h3 className="font-bold text-slate-900">Ambiente de emissão</h3><p className="mt-1 text-xs text-slate-600">Produção transmite NF-e com valor fiscal. Confira série e próximo número com o responsável fiscal antes de salvar.</p><div className="mt-4 max-w-xs"><SelectField label="Ambiente" value={config.environment} onChange={(value) => set('environment', value)} options={[{ value: 'homologacao', label: 'Homologação' }, { value: 'producao', label: 'Produção' }]} /></div></section>
    <section className="rounded-xl border border-slate-200 bg-white p-5"><h3 className="mb-4 font-bold text-slate-900">Padrões de tributação</h3><div className="grid gap-4 md:grid-cols-4"><div className="md:col-span-2"><Field label="Natureza da operação padrão" value={config.default_nature_of_operation} onChange={(v) => set('default_nature_of_operation', v)} /></div><Field label="ICMS padrão %" type="number" value={config.default_icms_rate} onChange={(v) => set('default_icms_rate', Number(v))} /><Field label="PIS padrão %" type="number" value={config.default_pis_rate} onChange={(v) => set('default_pis_rate', Number(v))} /><Field label="COFINS padrão %" type="number" value={config.default_cofins_rate} onChange={(v) => set('default_cofins_rate', Number(v))} /></div></section>
    <section className="rounded-xl border border-slate-200 bg-white p-5"><div className="mb-4 flex items-center gap-3">{config.certificate_configured ? <CheckCircle2 className="h-6 w-6 text-emerald-600" /> : <AlertTriangle className="h-6 w-6 text-amber-600" />}<div><h3 className="font-bold text-slate-900">Certificado digital A1</h3><p className="text-xs text-slate-500">{config.certificate_configured ? `${config.certificate_subject ?? 'Certificado configurado'} · validade ${config.certificate_expires_at ? new Date(config.certificate_expires_at).toLocaleDateString('pt-BR') : 'não informada'}` : 'Nenhum certificado configurado.'}</p></div></div><div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]"><input type="file" accept=".pfx,.p12" onChange={(e) => setCertificate(e.target.files?.[0] ?? null)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" /><Field label="Senha do certificado" type="password" value={password} onChange={setPassword} /><button disabled={busy} onClick={() => void sendCertificate()} className="btn-secondary self-end"><ShieldCheck className="h-4 w-4" /> Configurar</button></div><button onClick={() => void testSefazStatus().then(() => toast.success('Comunicação com a SEFAZ funcionando.'))} className="mt-4 text-sm font-semibold text-blue-700 hover:underline">Testar comunicação com a SEFAZ</button></section>
  </div>;
}
