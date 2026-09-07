import { useRef, useState, type FormEvent } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { createClient, type ClientRecord } from '../services/operationsApi';
import { usePermissions } from '../context/PermissionsContext';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';

const states = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
const emptyForm = {
  name: '', tradeName: '', document: '', phone: '', email: '', city: '', state: '',
  cep: '', address: '', addressNumber: '', neighborhood: '', addressComplement: '', notes: '',
};

export default function NovoClienteVendedor({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (client: ClientRecord) => void;
}) {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const { hasPermission, loading } = usePermissions();
  const canCreate = !loading && hasPermission('comercial', 'create');
  const update = (field: keyof typeof emptyForm, value: string) => setForm(current => ({ ...current, [field]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting.current || !canCreate) return;
    setError('');
    if (!form.name.trim() || !form.document.trim()) {
      setError('Informe o nome e o documento do cliente.');
      return;
    }
    submitting.current = true;
    setSaving(true);
    try {
      const optional = (value: string) => value.trim() || undefined;
      const client = await createClient({
        name: form.name.trim(), document: form.document.trim(), tradeName: optional(form.tradeName),
        phone: optional(form.phone), email: optional(form.email), city: optional(form.city), state: optional(form.state),
        cep: optional(form.cep), address: optional(form.address), addressNumber: optional(form.addressNumber),
        neighborhood: optional(form.neighborhood), addressComplement: optional(form.addressComplement),
        notes: optional(form.notes), countryCode: '1058', countryName: 'Brasil', active: true,
      });
      onCreated(client);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível cadastrar o cliente. Tente novamente.');
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={open => { if (!open && !submitting.current) onClose(); }}>
      <DialogContent className="seller-dialog">
        <DialogHeader>
          <DialogTitle>Novo cliente</DialogTitle>
          <DialogDescription>Cadastre o cliente para começar a vender. Nome e documento são obrigatórios.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="seller-form">
          <fieldset disabled={saving}>
            <label>Nome / razão social *<input required autoComplete="organization" value={form.name} onChange={e => update('name', e.target.value)} placeholder="Nome do cliente ou da empresa" /></label>
            <label>CPF / CNPJ / documento *<input required value={form.document} onChange={e => update('document', e.target.value)} placeholder="Informe o documento" /></label>
            <label>Nome fantasia<input value={form.tradeName} onChange={e => update('tradeName', e.target.value)} placeholder="Como o estabelecimento é conhecido" /></label>
            <div className="seller-form-grid">
              <label>Telefone<input type="tel" autoComplete="tel" value={form.phone} onChange={e => update('phone', e.target.value)} placeholder="(81) 99999-9999" /></label>
              <label>E-mail<input type="email" autoComplete="email" value={form.email} onChange={e => update('email', e.target.value)} placeholder="cliente@exemplo.com" /></label>
            </div>
            <div className="seller-form-grid">
              <label>Cidade<input autoComplete="address-level2" value={form.city} onChange={e => update('city', e.target.value)} /></label>
              <label>Estado<select autoComplete="address-level1" value={form.state} onChange={e => update('state', e.target.value)}><option value="">Selecione</option>{states.map(state => <option key={state}>{state}</option>)}</select></label>
            </div>
            <details className="seller-client-address">
              <summary>Endereço de entrega e observações</summary>
              <div className="seller-client-address-fields">
                <label>CEP<input autoComplete="postal-code" inputMode="numeric" value={form.cep} onChange={e => update('cep', e.target.value)} placeholder="00000-000" /></label>
                <label>Rua / avenida<input autoComplete="address-line1" value={form.address} onChange={e => update('address', e.target.value)} /></label>
                <div className="seller-form-grid">
                  <label>Número<input value={form.addressNumber} onChange={e => update('addressNumber', e.target.value)} /></label>
                  <label>Bairro<input value={form.neighborhood} onChange={e => update('neighborhood', e.target.value)} /></label>
                </div>
                <label>Complemento<input autoComplete="address-line2" value={form.addressComplement} onChange={e => update('addressComplement', e.target.value)} /></label>
                <label>Observações<textarea rows={2} value={form.notes} onChange={e => update('notes', e.target.value)} placeholder="Referência de entrega, horário de atendimento…" /></label>
              </div>
            </details>
          </fieldset>
          {error && <p className="seller-error" role="alert">{error}</p>}
          <div className="seller-checkout seller-client-footer">
            <button type="button" className="seller-secondary" disabled={saving} onClick={onClose}>Cancelar</button>
            <button type="submit" className="seller-primary" disabled={saving || !canCreate}>
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
              {saving ? 'Salvando…' : 'Salvar cliente'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
