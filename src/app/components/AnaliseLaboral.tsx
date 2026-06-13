import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import type { AnaliseLaboral as AnaliseLaboralType, LoteLeite } from '../data/mockData';
import { createMilkAnalysis, loadMilkAnalyses, loadMilkLots } from '../services/operationsApi';

const emptyFormState = {
  alizarol: '',
  antibioticos: '',
  acidez: '',
  crioscopia: '',
  densidade: '',
  gordura: '',
  proteina: '',
  cbt: '',
  observacoes: '',
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Nao foi possivel salvar a analise.';
}

export default function AnaliseLaboral() {
  const [showModal, setShowModal] = useState(false);
  const [selectedLote, setSelectedLote] = useState<string | null>(null);
  const [lotes, setLotes] = useState<LoteLeite[]>([]);
  const [analises, setAnalises] = useState<AnaliseLaboralType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formState, setFormState] = useState(emptyFormState);

  const loadData = async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const [nextLotes, nextAnalises] = await Promise.all([loadMilkLots(), loadMilkAnalyses()]);
      setLotes(nextLotes);
      setAnalises(nextAnalises);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const lotesAguardandoAnalise = useMemo(
    () =>
      lotes.filter(
        (lote) => lote.status === 'Aguardando Analise' || lote.status === 'Aguardando Análise',
      ),
    [lotes],
  );

  const resetForm = () => {
    setFormState(emptyFormState);
    setFormError(null);
  };

  const closeModal = () => {
    if (saving) {
      return;
    }

    resetForm();
    setShowModal(false);
    setSelectedLote(null);
  };

  const handleAnalyze = (loteId: string) => {
    setSelectedLote(loteId);
    setShowModal(true);
    setFormError(null);
  };

  const handleSubmit = async () => {
    if (!selectedLote) {
      return;
    }

    if (
      !formState.alizarol ||
      !formState.antibioticos ||
      !formState.acidez ||
      !formState.crioscopia ||
      !formState.densidade
    ) {
      setFormError('Preencha os campos obrigatorios da analise.');
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      const result = await createMilkAnalysis(selectedLote, {
        alizarol: formState.alizarol,
        antibioticos: formState.antibioticos,
        acidez: Number(formState.acidez),
        crioscopia: Number(formState.crioscopia),
        densidade: Number(formState.densidade),
        gordura: formState.gordura ? Number(formState.gordura) : undefined,
        proteina: formState.proteina ? Number(formState.proteina) : undefined,
        cbt: formState.cbt ? Number(formState.cbt) : undefined,
        observacoes: formState.observacoes,
      });

      setAnalises((current) => [result.analysis, ...current]);
      setLotes((current) => current.map((item) => (item.id === result.lot.id ? result.lot : item)));
      closeModal();
    } catch (error) {
      setFormError(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Analise laboratorial</h2>
          <p className="text-gray-600">Aprove ou bloqueie lotes com base no laudo real</p>
        </div>
        <button
          onClick={() => void loadData()}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          Atualizar
        </button>
      </div>

      {errorMessage ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {errorMessage}
        </div>
      ) : null}

      <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-6">
        <div className="mb-4 flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-yellow-600" />
          <div>
            <h3 className="font-bold text-yellow-900">Lotes aguardando analise</h3>
            <p className="text-sm text-yellow-800">
              {lotesAguardandoAnalise.length} lote(s) pendente(s) de analise laboratorial
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-3 rounded-lg bg-white p-4 text-sm text-gray-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            Carregando fila de analise...
          </div>
        ) : lotesAguardandoAnalise.length > 0 ? (
          <div className="space-y-2">
            {lotesAguardandoAnalise.map((lote) => (
              <div key={lote.id} className="flex items-center justify-between rounded-lg bg-white p-4">
                <div>
                  <p className="font-medium text-gray-900">{lote.codigo}</p>
                  <p className="text-sm text-gray-600">
                    Volume: {lote.volumeLitros.toLocaleString('pt-BR')} L | Temp: {lote.temperatura.toFixed(1)} C
                  </p>
                </div>
                <button
                  onClick={() => handleAnalyze(lote.id)}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
                >
                  Realizar analise
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg bg-white p-4 text-sm text-gray-600">
            Nenhum lote pendente de analise no momento.
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-200 p-4">
          <h3 className="font-bold text-gray-900">Historico de analises</h3>
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-3 p-10 text-sm text-gray-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            Carregando historico...
          </div>
        ) : analises.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-600">Nenhuma analise registrada.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Lote</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Data analise</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Alizarol</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Acidez</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Antibioticos</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Gordura</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Resultado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {analises.map((analise) => {
                  const lote = lotes.find((entry) => entry.id === analise.loteId);
                  return (
                    <tr key={analise.id} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-6 py-4 font-medium text-gray-900">{lote?.codigo || '-'}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                        {format(analise.dataAnalise, 'dd/MM/yyyy HH:mm')}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-medium ${
                            analise.alizarol === 'Aprovado'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {analise.alizarol}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">{analise.acidez}</td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-medium ${
                            analise.antibioticos === 'Não Detectado' || analise.antibioticos === 'Nao Detectado'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {analise.antibioticos}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                        {analise.gordura?.toFixed(1) || '-'}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-medium ${
                            analise.aprovado ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {analise.aprovado ? 'Aprovado' : 'Reprovado'}
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

      {showModal && selectedLote ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white">
            <div className="border-b border-gray-200 p-6">
              <h3 className="text-xl font-bold text-gray-900">Analise laboratorial</h3>
              <p className="text-sm text-gray-600">
                Lote: {lotes.find((lote) => lote.id === selectedLote)?.codigo}
              </p>
            </div>
            <div className="space-y-6 p-6">
              <div>
                <h4 className="mb-3 font-bold text-gray-900">Testes de qualidade</h4>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Alizarol *</label>
                    <select
                      value={formState.alizarol}
                      onChange={(event) =>
                        setFormState((current) => ({ ...current, alizarol: event.target.value }))
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Selecione...</option>
                      <option value="Aprovado">Aprovado</option>
                      <option value="Reprovado">Reprovado</option>
                    </select>
                    <p className="mt-1 text-xs text-red-600">Reprovado bloqueia o lote automaticamente</p>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Antibioticos *</label>
                    <select
                      value={formState.antibioticos}
                      onChange={(event) =>
                        setFormState((current) => ({ ...current, antibioticos: event.target.value }))
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Selecione...</option>
                      <option value="Nao Detectado">Nao Detectado</option>
                      <option value="Detectado">Detectado</option>
                    </select>
                    <p className="mt-1 text-xs text-red-600">Detectado bloqueia o lote automaticamente</p>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="mb-3 font-bold text-gray-900">Analises fisico-quimicas</h4>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {[
                    ['acidez', 'Acidez (D)', '0.1', 'Ex: 16.0'],
                    ['crioscopia', 'Crioscopia (H)', '0.001', 'Ex: -0.530'],
                    ['densidade', 'Densidade (g/mL)', '0.001', 'Ex: 1.028'],
                    ['gordura', 'Gordura (%)', '0.1', 'Ex: 3.5'],
                    ['proteina', 'Proteina (%)', '0.1', 'Ex: 3.2'],
                    ['cbt', 'CBT (UFC/mL)', '1', 'Ex: 50000'],
                  ].map(([key, label, step, placeholder]) => (
                    <div key={key}>
                      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
                      <input
                        type="number"
                        step={step}
                        value={formState[key as keyof typeof formState]}
                        onChange={(event) =>
                          setFormState((current) => ({ ...current, [key]: event.target.value }))
                        }
                        placeholder={placeholder}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Observacoes</label>
                <textarea
                  rows={3}
                  value={formState.observacoes}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, observacoes: event.target.value }))
                  }
                  placeholder="Observacoes adicionais sobre a analise..."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
                  <div>
                    <p className="mb-2 font-bold text-red-900">Regras de bloqueio automatico</p>
                    <ul className="space-y-1 text-sm text-red-800">
                      <li>- Alizarol reprovado -&gt; lote bloqueado</li>
                      <li>- Antibiotico detectado -&gt; lote bloqueado</li>
                      <li>- Lotes bloqueados nao podem ser usados na producao</li>
                    </ul>
                  </div>
                </div>
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
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                Salvar analise
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
