import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Search } from 'lucide-react';
import { format } from 'date-fns';
import type { LoteLeite } from '../data/mockData';
import { useCadastros } from '../context/CadastrosContext';
import { createMilkReception, loadMilkLots, loadMilkLotDetail, updateMilkReception } from '../services/operationsApi';

function getErrorMessage(error: unknown) {
 if (error instanceof Error) {
 return error.message;
 }

 return 'Nao foi possivel carregar a recepcao de leite.';
}

const emptyFormState = {
 producerId: '',
 routeId: '',
 transporterId: '',
 volumeLiters: '',
 temperatura: '',
 receivedAt: '',
 carPlate: '',
 driverName: '',
 analystName: '',
 observations: '',
};

export default function RecepcaoLeite() {
 const [searchTerm, setSearchTerm] = useState('');
 const [showModal, setShowModal] = useState(false);
 const [editingLoteId, setEditingLoteId] = useState<string | null>(null);
 const [lotes, setLotes] = useState<LoteLeite[]>([]);
 const [loading, setLoading] = useState(true);
 const [saving, setSaving] = useState(false);
 const [errorMessage, setErrorMessage] = useState<string | null>(null);
 const [formError, setFormError] = useState<string | null>(null);
 const [formState, setFormState] = useState(emptyFormState);
 const { producers, routes, transporters, getProducerById, getRouteById } = useCadastros();

 const loadData = async () => {
 setLoading(true);
 setErrorMessage(null);

 try {
 const data = await loadMilkLots();
 setLotes(data);
 } catch (error) {
 setErrorMessage(getErrorMessage(error));
 } finally {
 setLoading(false);
 }
 };

 useEffect(() => {
 void loadData();
 }, []);

 const activeProducers = useMemo(() => producers.filter((producer) => producer.active), [producers]);
 const activeRoutes = useMemo(() => routes.filter((route) => route.active), [routes]);
 const activeTransporters = useMemo(
 () => transporters.filter((transporter) => transporter.active),
 [transporters],
 );

  const filteredLotes = useMemo(
    () =>
      lotes
        .filter((lote) => {
          const produtor = getProducerById(lote.produtorId);
          return (
            lote.codigo.toLowerCase().includes(searchTerm.toLowerCase()) ||
            produtor?.name.toLowerCase().includes(searchTerm.toLowerCase())
          );
        })
        .sort((a, b) => {
          const getTimestamp = (codigo: string) => {
            const parts = codigo.split('-');
            return parts.length >= 3 ? parseInt(parts[2], 10) : 0;
          };
          return getTimestamp(b.codigo) - getTimestamp(a.codigo);
        }),
    [getProducerById, lotes, searchTerm],
  );

 const resetForm = () => {
 setFormState(emptyFormState);
 setFormError(null);
 setEditingLoteId(null);
 };

 const closeModal = () => {
 if (saving) {
 return;
 }

 resetForm();
 setShowModal(false);
 };

 const handleRowClick = async (lote: LoteLeite) => {
 setLoading(true);
 setErrorMessage(null);
 try {
 const detail = await loadMilkLotDetail(lote.id);
 setFormState({
 producerId: lote.produtorId,
 routeId: lote.rotaId,
 transporterId: lote.transportadorId,
 volumeLiters: lote.volumeLitros.toString(),
 temperatura: lote.temperatura.toString(),
 receivedAt: format(lote.dataHoraRecebimento, "yyyy-MM-dd'T'HH:mm"),
 carPlate: detail.reception?.carPlate || '',
 driverName: detail.reception?.driverName || '',
 analystName: detail.reception?.analystName || '',
 observations: detail.reception?.observations || '',
 });
 setEditingLoteId(lote.id);
 setShowModal(true);
 } catch (error) {
 setErrorMessage(getErrorMessage(error));
 } finally {
 setLoading(false);
 }
 };

 const handleSubmit = async () => {
 const volumeLiters = Number(formState.volumeLiters);
 const temperatura = Number(formState.temperatura);
 const nextReceivedAt = formState.receivedAt || new Date().toISOString().slice(0, 16);

 if (
 !formState.producerId ||
 !formState.routeId ||
 !formState.transporterId ||
 volumeLiters <= 0 ||
 Number.isNaN(temperatura)
 ) {
 setFormError('Preencha produtor, rota, transportador, volume e temperatura validos.');
 return;
 }

 setSaving(true);
 setFormError(null);

 try {
 if (editingLoteId) {
 const updated = await updateMilkReception(editingLoteId, {
 producerId: formState.producerId,
 routeId: formState.routeId,
 transporterId: formState.transporterId,
 volumeLiters,
 temperatura,
 receivedAt: new Date(nextReceivedAt).toISOString(),
 carPlate: formState.carPlate || undefined,
 driverName: formState.driverName || undefined,
 analystName: formState.analystName || undefined,
 observations: formState.observations || undefined,
 });
 setLotes((current) =>
 current.map((lote) => (lote.id === editingLoteId ? updated : lote))
 );
 } else {
 const created = await createMilkReception({
 producerId: formState.producerId,
 routeId: formState.routeId,
 transporterId: formState.transporterId,
 volumeLiters,
 temperatura,
 receivedAt: new Date(nextReceivedAt).toISOString(),
 carPlate: formState.carPlate || undefined,
 driverName: formState.driverName || undefined,
 analystName: formState.analystName || undefined,
 observations: formState.observations || undefined,
 });
 setLotes((current) => [created, ...current]);
 }
 resetForm();
 setShowModal(false);
 } catch (error) {
 setFormError(getErrorMessage(error));
 } finally {
 setSaving(false);
 }
 };

 const getStatusColor = (status: string) => {
 switch (status) {
 case 'Aprovado':
 return 'bg-green-100 text-green-800';
 case 'Reprovado':
 case 'Bloqueado':
 return 'bg-red-100 text-red-800';
 case 'Aguardando Analise':
 case 'Aguardando Análise':
 return 'bg-yellow-100 text-yellow-800';
 default:
 return 'bg-gray-100 text-gray-800';
 }
 };

 return (
 <div className="space-y-6">
 <div className="flex items-center justify-between">
 <div>
 <h2 className="text-2xl font-bold text-gray-900">Recepcao de leite cru</h2>
 <p className="text-gray-600">Registre a entrada de leite e a geracao de lotes reais</p>
 </div>
 <button
 onClick={() => setShowModal(true)}
 className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
 >
 <Plus className="h-5 w-5" />
 Nova recepcao
 </button>
 </div>

 {errorMessage ? (
 <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
 {errorMessage}
 </div>
 ) : null}

 <div className="rounded-xl border border-gray-200 bg-white p-4">
 <div className="relative">
 <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
 <input
 type="text"
 placeholder="Buscar por codigo do lote ou produtor..."
 value={searchTerm}
 onChange={(event) => setSearchTerm(event.target.value)}
 className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
 />
 </div>
 </div>

 <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
 {loading ? (
 <div className="flex items-center justify-center gap-3 p-10 text-sm text-gray-600">
 <Loader2 className="h-5 w-5 animate-spin" />
 Carregando lotes recebidos...
 </div>
 ) : filteredLotes.length === 0 ? (
 <div className="p-10 text-center text-sm text-gray-600">Nenhum lote encontrado.</div>
 ) : (
 <div className="overflow-x-auto">
 <table className="w-full">
 <thead className="border-b border-gray-200 bg-gray-50">
 <tr>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Lote</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Produtor</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Rota</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Volume (L)</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Temperatura</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Data/Hora</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-gray-200">
 {filteredLotes.map((lote) => {
 const produtor = getProducerById(lote.produtorId);
 const rota = getRouteById(lote.rotaId);

 return (
 <tr 
 key={lote.id} 
 className="hover:bg-gray-50 cursor-pointer"
 onClick={() => void handleRowClick(lote)}
 >
 <td className="px-6 py-4">
 <div className="font-medium text-gray-900">{lote.codigo}</div>
 </td>
 <td className="px-6 py-4 text-sm text-gray-900">{produtor?.name}</td>
 <td className="px-6 py-4 text-sm text-gray-900">{rota?.name}</td>
 <td className="px-6 py-4 text-sm text-gray-900">
 {lote.volumeLitros.toLocaleString('pt-BR')}
 </td>
 <td className="px-6 py-4 text-sm text-gray-900">
 {lote.temperatura.toFixed(1)} C
 </td>
 <td className="px-6 py-4 text-sm text-gray-900">
 {format(lote.dataHoraRecebimento, 'dd/MM/yyyy HH:mm')}
 </td>
 <td className="px-6 py-4">
 <span className={`rounded-full px-2 py-1 text-xs font-medium ${getStatusColor(lote.status)}`}>
 {lote.status}
 </span>
 </td>
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>
 )}
 </div>

 {showModal ? (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
 <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white">
 <div className="border-b border-gray-200 p-6">
 <h3 className="text-xl font-bold text-gray-900">
 {editingLoteId ? 'Detalhes da recepcao de leite' : 'Nova recepcao de leite'}
 </h3>
 </div>
 <div className="space-y-4 p-6">
 <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
 <div>
 <label className="mb-1 block text-sm font-medium text-gray-700">Produtor *</label>
 <select
 value={formState.producerId}
 onChange={(event) =>
 setFormState((current) => ({ ...current, producerId: event.target.value }))
 }
 className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
 >
 <option value="">Selecione...</option>
 {activeProducers.map((producer) => (
 <option key={producer.id} value={producer.id}>
 {producer.name}
 </option>
 ))}
 </select>
 </div>
 <div>
 <label className="mb-1 block text-sm font-medium text-gray-700">Rota *</label>
 <select
 value={formState.routeId}
 onChange={(event) =>
 setFormState((current) => ({ ...current, routeId: event.target.value }))
 }
 className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
 >
 <option value="">Selecione...</option>
 {activeRoutes.map((route) => (
 <option key={route.id} value={route.id}>
 {route.name}
 </option>
 ))}
 </select>
 </div>
 </div>

 <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
 <div>
 <label className="mb-1 block text-sm font-medium text-gray-700">Transportador *</label>
 <select
 value={formState.transporterId}
 onChange={(event) =>
 setFormState((current) => ({ ...current, transporterId: event.target.value }))
 }
 className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
 >
 <option value="">Selecione...</option>
 {activeTransporters.map((transporter) => (
 <option key={transporter.id} value={transporter.id}>
 {transporter.name}
 </option>
 ))}
 </select>
 </div>
 <div>
 <label className="mb-1 block text-sm font-medium text-gray-700">Volume (litros) *</label>
 <input
 type="number"
 min="0"
 step="0.01"
 value={formState.volumeLiters}
 onChange={(event) =>
 setFormState((current) => ({ ...current, volumeLiters: event.target.value }))
 }
 className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
 placeholder="0"
 />
 </div>
 </div>

 <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
 <div>
 <label className="mb-1 block text-sm font-medium text-gray-700">Temperatura (C) *</label>
 <input
 type="number"
 step="0.1"
 value={formState.temperatura}
 onChange={(event) =>
 setFormState((current) => ({ ...current, temperatura: event.target.value }))
 }
 className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
 placeholder="0.0"
 />
 </div>
 <div>
 <label className="mb-1 block text-sm font-medium text-gray-700">Data/Hora recebimento</label>
 <input
 type="datetime-local"
 value={formState.receivedAt}
 onChange={(event) =>
 setFormState((current) => ({ ...current, receivedAt: event.target.value }))
 }
 className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
 />
 </div>
 </div>

 <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
 <div>
 <label className="mb-1 block text-sm font-medium text-gray-700">Placa do Carro</label>
 <input
 type="text"
 value={formState.carPlate}
 onChange={(event) =>
 setFormState((current) => ({ ...current, carPlate: event.target.value }))
 }
 className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
 placeholder="Ex: ABC-1234"
 />
 </div>
 <div>
 <label className="mb-1 block text-sm font-medium text-gray-700">Motorista</label>
 <input
 type="text"
 value={formState.driverName}
 onChange={(event) =>
 setFormState((current) => ({ ...current, driverName: event.target.value }))
 }
 className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
 placeholder="Nome do motorista"
 />
 </div>
 </div>

 <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
 <div>
 <label className="mb-1 block text-sm font-medium text-gray-700">Analista</label>
 <input
 type="text"
 value={formState.analystName}
 onChange={(event) =>
 setFormState((current) => ({ ...current, analystName: event.target.value }))
 }
 className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
 placeholder="Nome do analista responsável"
 />
 </div>
 <div>
 <label className="mb-1 block text-sm font-medium text-gray-700">Observações</label>
 <input
 type="text"
 value={formState.observations}
 onChange={(event) =>
 setFormState((current) => ({ ...current, observations: event.target.value }))
 }
 className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
 placeholder="Anotações adicionais"
 />
 </div>
 </div>

 <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
 <p className="text-sm text-blue-800">
 <strong>Importante:</strong> a recepcao cria um lote real com status "Aguardando Analise".
 Esse lote so pode entrar em producao depois da aprovacao laboratorial.
 </p>
 </div>

 {formError ? (
 <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
 {formError}
 </div>
 ) : null}
 </div>
 <div className="flex justify-end gap-3 border-t border-gray-200 p-6">
 <button
 onClick={closeModal}
 className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
 >
 Cancelar
 </button>
 <button
 onClick={() => void handleSubmit()}
 disabled={saving}
 className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
 >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {editingLoteId ? 'Salvar alteracoes' : 'Registrar recepcao'}
          </button>
        </div>
      </div>
    </div>
  ) : null}
  </div>
  );
}
