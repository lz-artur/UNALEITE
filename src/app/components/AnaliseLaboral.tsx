import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, Loader2, Trash2, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import type { AnaliseLaboral as AnaliseLaboralType, LoteLeite } from '../data/mockData';
import { createMilkAnalysis, loadMilkAnalyses, loadMilkLots, deleteMilkAnalysis } from '../services/operationsApi';
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

const emptyFormState = {
  alizarol: '',
  antibioticos: '',
  acidez: '',
  crioscopia: '',
  densidade: '',
  gordura: '',
  proteina: '',
  temperatura: '',
  alcool: '',
  ph: '',
  porcentagem_agua: '',
  est: '',
  esd: '',
  redutase: '',
  observacoes: '',
};

type FormState = typeof emptyFormState;

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
  
  // Multi-compartment state
  const [step, setStep] = useState<1 | 2>(1);
  const [compartmentsCount, setCompartmentsCount] = useState<number>(1);
  const [formStates, setFormStates] = useState<FormState[]>([]);
  const [generalObservations, setGeneralObservations] = useState('');
  const [isReadOnly, setIsReadOnly] = useState(false);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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
    setFormStates([]);
    setGeneralObservations('');
    setCompartmentsCount(1);
    setStep(1);
    setFormError(null);
    setIsReadOnly(false);
  };

  const closeModal = () => {
    if (saving) return;
    resetForm();
    setShowModal(false);
    setSelectedLote(null);
  };

  const handleAnalyze = (loteId: string) => {
    setSelectedLote(loteId);
    setShowModal(true);
    setStep(1);
    setFormError(null);
    setIsReadOnly(false);
  };

  const handleViewAnalise = (analise: AnaliseLaboralType) => {
    setSelectedLote(analise.loteId);
    setFormError(null);
    setIsReadOnly(true);
    setGeneralObservations(analise.observacoes || '');

    if (analise.subanalyses && analise.subanalyses.length > 0) {
      setCompartmentsCount(analise.subanalyses.length);
      setFormStates(
        analise.subanalyses.map((sub) => ({
          alizarol: sub.alizarol,
          antibioticos: sub.antibioticos,
          acidez: sub.acidez !== undefined ? String(sub.acidez) : '',
          crioscopia: sub.crioscopia !== undefined ? String(sub.crioscopia) : '',
          densidade: sub.densidade !== undefined ? String(sub.densidade) : '',
          gordura: sub.gordura !== undefined ? String(sub.gordura) : '',
          proteina: sub.proteina !== undefined ? String(sub.proteina) : '',
          temperatura: sub.temperatura !== undefined ? String(sub.temperatura) : '', // Not always stored in sub, but assuming it is or using parent logic
          alcool: sub.alcool || '',
          ph: sub.ph !== undefined ? String(sub.ph) : '',
          porcentagem_agua: sub.porcentagem_agua !== undefined ? String(sub.porcentagem_agua) : '',
          est: sub.est !== undefined ? String(sub.est) : '',
          esd: sub.esd !== undefined ? String(sub.esd) : '',
          redutase: sub.redutase || '',
          observacoes: sub.observacoes || '',
        }))
      );
    } else {
      setCompartmentsCount(1);
      setFormStates([
        {
          alizarol: analise.alizarol,
          antibioticos: analise.antibioticos,
          acidez: analise.acidez !== undefined ? String(analise.acidez) : '',
          crioscopia: analise.crioscopia !== undefined ? String(analise.crioscopia) : '',
          densidade: analise.densidade !== undefined ? String(analise.densidade) : '',
          gordura: analise.gordura !== undefined ? String(analise.gordura) : '',
          proteina: analise.proteina !== undefined ? String(analise.proteina) : '',
          temperatura: '', // Parent temp might be needed here, leaving empty since it's readonly
          alcool: analise.alcool || '',
          ph: analise.ph !== undefined ? String(analise.ph) : '',
          porcentagem_agua: analise.porcentagem_agua !== undefined ? String(analise.porcentagem_agua) : '',
          est: analise.est !== undefined ? String(analise.est) : '',
          esd: analise.esd !== undefined ? String(analise.esd) : '',
          redutase: analise.redutase || '',
          observacoes: analise.observacoes || '',
        },
      ]);
    }
    
    setStep(2);
    setShowModal(true);
  };

  const startAnalysis = () => {
    if (compartmentsCount < 1) {
      setFormError('A quantidade de compartimentos deve ser pelo menos 1.');
      return;
    }
    setFormStates(Array.from({ length: compartmentsCount }).map(() => ({ ...emptyFormState })));
    setStep(2);
    setFormError(null);
  };

  const updateCompartmentForm = (index: number, field: keyof FormState, value: string) => {
    setFormStates((current) => {
      const newStates = [...current];
      newStates[index] = { ...newStates[index], [field]: value };
      return newStates;
    });
  };

  const computedFinalResult = useMemo(() => {
    if (formStates.length === 0) return emptyFormState;

    const computeAverage = (field: keyof FormState) => {
      const validStates = formStates.filter((s) => s[field] !== '' && !isNaN(Number(s[field])));
      const validValues = validStates.map((s) => Number(s[field]));
      if (validValues.length === 0) return '';
      const avg = validValues.reduce((a, b) => a + b, 0) / validValues.length;
      return avg.toFixed(4).replace(/\.?0+$/, ''); // Simple formatting
    };

    const hasReprovado = (field: keyof FormState, failValue: string) => {
      return formStates.some((s) => s[field] === failValue);
    };
    const allApproved = (field: keyof FormState, passValue: string) => {
      return formStates.every((s) => s[field] === passValue);
    };

    let alizarol = '';
    if (hasReprovado('alizarol', 'Reprovado')) alizarol = 'Reprovado';
    else if (allApproved('alizarol', 'Aprovado')) alizarol = 'Aprovado';

    let antibioticos = '';
    if (hasReprovado('antibioticos', 'Detectado')) antibioticos = 'Detectado';
    else if (allApproved('antibioticos', 'Nao Detectado') || allApproved('antibioticos', 'Não Detectado')) antibioticos = 'Nao Detectado';

    let alcool = '';
    if (hasReprovado('alcool', 'Reprovado')) alcool = 'Reprovado';
    else if (allApproved('alcool', 'Aprovado')) alcool = 'Aprovado';
    else if (formStates.every((s) => s.alcool === 'N/R' || !s.alcool)) alcool = 'N/R';

    return {
      alizarol,
      antibioticos,
      alcool,
      acidez: computeAverage('acidez'),
      crioscopia: computeAverage('crioscopia'),
      densidade: computeAverage('densidade'),
      gordura: computeAverage('gordura'),
      proteina: computeAverage('proteina'),
      temperatura: computeAverage('temperatura'),
      ph: computeAverage('ph'),
      porcentagem_agua: computeAverage('porcentagem_agua'),
      est: computeAverage('est'),
      esd: computeAverage('esd'),
      redutase: formStates[0]?.redutase || '', // Assuming redutase is not averaged
      observacoes: generalObservations,
    };
  }, [formStates, generalObservations]);

  const rejectionReasons = useMemo(() => {
    const reasons = [];
    if (computedFinalResult.alizarol === 'Reprovado') reasons.push('Alizarol reprovado');
    if (computedFinalResult.antibioticos === 'Detectado') reasons.push('Antibiótico detectado');
    
    const acidez = Number(computedFinalResult.acidez);
    if (computedFinalResult.acidez && (acidez < 14 || acidez > 18)) {
      reasons.push(`Acidez (${computedFinalResult.acidez} °D) fora do padrão (14 a 18)`);
    }

    const crio = Number(computedFinalResult.crioscopia);
    if (computedFinalResult.crioscopia && (crio < -0.545 || crio > -0.520)) {
      reasons.push(`Crioscopia (${computedFinalResult.crioscopia} °H) fora do padrão (-0.545 a -0.520)`);
    }
    
    return reasons;
  }, [computedFinalResult]);

  const handleSubmit = async () => {
    if (!selectedLote) return;

    // Validate all compartments
    for (let i = 0; i < formStates.length; i++) {
      const state = formStates[i];
      if (
        !state.alizarol ||
        !state.antibioticos ||
        !state.acidez ||
        !state.crioscopia ||
        !state.densidade ||
        !state.temperatura
      ) {
        setFormError(`Preencha os campos obrigatorios para o Compartimento ${i + 1}.`);
        return;
      }
    }

    setSaving(true);
    setFormError(null);

    try {
      const payload = {
        alizarol: computedFinalResult.alizarol,
        antibioticos: computedFinalResult.antibioticos,
        acidez: computedFinalResult.acidez ? Number(computedFinalResult.acidez) : undefined,
        crioscopia: computedFinalResult.crioscopia ? Number(computedFinalResult.crioscopia) : undefined,
        densidade: computedFinalResult.densidade ? Number(computedFinalResult.densidade) : undefined,
        gordura: computedFinalResult.gordura ? Number(computedFinalResult.gordura) : undefined,
        proteina: computedFinalResult.proteina ? Number(computedFinalResult.proteina) : undefined,
        temperatura: computedFinalResult.temperatura ? Number(computedFinalResult.temperatura) : undefined,
        alcool: computedFinalResult.alcool || undefined,
        ph: computedFinalResult.ph ? Number(computedFinalResult.ph) : undefined,
        porcentagem_agua: computedFinalResult.porcentagem_agua ? Number(computedFinalResult.porcentagem_agua) : undefined,
        est: computedFinalResult.est ? Number(computedFinalResult.est) : undefined,
        esd: computedFinalResult.esd ? Number(computedFinalResult.esd) : undefined,
        redutase: computedFinalResult.redutase || undefined,
        observacoes: computedFinalResult.observacoes,
        subanalyses: formStates.map((state, i) => ({
          compartment_number: i + 1,
          alizarol: state.alizarol,
          antibioticos: state.antibioticos,
          acidez: Number(state.acidez),
          crioscopia: Number(state.crioscopia),
          densidade: Number(state.densidade),
          gordura: state.gordura ? Number(state.gordura) : undefined,
          proteina: state.proteina ? Number(state.proteina) : undefined,
          temperatura: state.temperatura ? Number(state.temperatura) : undefined,
          alcool: state.alcool || undefined,
          ph: state.ph ? Number(state.ph) : undefined,
          porcentagem_agua: state.porcentagem_agua ? Number(state.porcentagem_agua) : undefined,
          est: state.est ? Number(state.est) : undefined,
          esd: state.esd ? Number(state.esd) : undefined,
          redutase: state.redutase || undefined,
          observacoes: state.observacoes,
        })),
      };

      const result = await createMilkAnalysis(selectedLote, payload);

      setAnalises((current) => [result.analysis, ...current]);
      setLotes((current) => current.map((item) => (item.id === result.lot.id ? result.lot : item)));
      closeModal();
    } catch (error) {
      setFormError(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!itemToDelete) return;
    setIsDeleting(true);
    setErrorMessage(null);
    try {
      await deleteMilkAnalysis(itemToDelete);
      setAnalises((current) => current.filter((a) => a.id !== itemToDelete));
      const analiseToDelete = analises.find(a => a.id === itemToDelete);
      if (analiseToDelete) {
        setLotes((current) => 
          current.map((lote) => {
            if (lote.id === analiseToDelete.loteId) return { ...lote, status: 'Aguardando Analise' };
            return lote;
          })
        );
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

  const renderSelectRow = (
    key: keyof FormState,
    label: string,
    options: { value: string; label: string }[],
    required = false
  ) => (
    <div className="mb-4">
      <label className="mb-2 block font-medium text-gray-900">
        {label} {required && '*'}
      </label>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {formStates.map((state, i) => (
          <div key={i} className="min-w-[150px] flex-1">
            <span className="mb-1 block text-xs font-semibold text-gray-500">Comp. {i + 1}</span>
            <select
              disabled={isReadOnly}
              value={state[key]}
              onChange={(e) => updateCompartmentForm(i, key, e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
            >
              <option value="">Selec...</option>
              {options.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        ))}
        {formStates.length > 1 && (
          <div className="min-w-[150px] flex-1 rounded-lg border border-blue-100 bg-blue-50 p-2 text-center">
            <span className="mb-1 block text-xs font-bold text-blue-800">Resultado Final</span>
            <div className="font-semibold text-blue-900 mt-1">
              {computedFinalResult[key] || '-'}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderInputRow = (
    key: keyof FormState,
    label: string,
    type = 'number',
    step?: string,
    placeholder?: string
  ) => (
    <div className="mb-4">
      <label className="mb-2 block font-medium text-gray-900">{label}</label>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {formStates.map((state, i) => (
          <div key={i} className="min-w-[150px] flex-1">
            <span className="mb-1 block text-xs font-semibold text-gray-500">Comp. {i + 1}</span>
            <input
              type={type}
              step={step}
              disabled={isReadOnly}
              value={state[key]}
              onChange={(e) => updateCompartmentForm(i, key, e.target.value)}
              placeholder={placeholder}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
            />
          </div>
        ))}
        {formStates.length > 1 && (
          <div className="min-w-[150px] flex-1 rounded-lg border border-blue-100 bg-blue-50 p-2 text-center">
            <span className="mb-1 block text-xs font-bold text-blue-800">Média Final</span>
            <div className="font-semibold text-blue-900 mt-1">
              {computedFinalResult[key] || '-'}
            </div>
          </div>
        )}
      </div>
    </div>
  );

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

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {errorMessage}
        </div>
      )}

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
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {analises.map((analise) => {
                  const lote = lotes.find((entry) => entry.id === analise.loteId);
                  return (
                    <tr 
                      key={analise.id} 
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => handleViewAnalise(analise)}
                    >
                      <td className="px-6 py-4 font-medium text-gray-900">{lote?.codigo || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {format(new Date(analise.dataAnalise), 'dd/MM/yyyy HH:mm')}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-medium ${
                            analise.alizarol === 'Aprovado' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {analise.alizarol}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">{analise.acidez}</td>
                      <td className="px-6 py-4">
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
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {analise.gordura?.toFixed(1) || '-'}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-medium ${
                            analise.aprovado ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {analise.aprovado ? 'Aprovado' : 'Reprovado'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setItemToDelete(analise.id);
                            setDeleteConfirmOpen(true);
                          }}
                          className="text-red-600 hover:text-red-900 relative z-10"
                          title="Excluir análise"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && selectedLote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-xl bg-white flex flex-col">
            <div className="border-b border-gray-200 p-6">
              <h3 className="text-xl font-bold text-gray-900">
                Analise laboratorial - {lotes.find((lote) => lote.id === selectedLote)?.codigo}
              </h3>
            </div>
            
            {step === 1 ? (
              <div className="p-8 flex flex-col items-center justify-center space-y-6">
                <div className="text-center">
                  <h4 className="text-lg font-bold text-gray-900 mb-2">Quantos compartimentos possui o caminhão?</h4>
                  <p className="text-gray-600">Cada compartimento será analisado de forma independente.</p>
                </div>
                
                <input 
                  type="number" 
                  min="1"
                  max="10"
                  value={compartmentsCount}
                  onChange={(e) => setCompartmentsCount(Number(e.target.value))}
                  className="w-32 text-center text-2xl font-bold rounded-lg border-2 border-blue-500 px-4 py-3 focus:outline-none focus:ring-4 focus:ring-blue-500/20"
                />

                <button
                  onClick={startAnalysis}
                  className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-white font-medium hover:bg-blue-700 transition-colors"
                >
                  Continuar
                  <ArrowRight className="h-5 w-5" />
                </button>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto p-6 space-y-8">
                  <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 flex gap-4 items-center">
                    <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 text-blue-600 font-bold">
                      {compartmentsCount}
                    </div>
                    <div>
                      <h4 className="font-bold text-blue-900">Análise de {compartmentsCount} Compartimento{compartmentsCount > 1 ? 's' : ''}</h4>
                      <p className="text-sm text-blue-800">Preencha os valores de cada compartimento lado a lado. O resultado final será calculado automaticamente.</p>
                    </div>
                  </div>

                  <div>
                    <h4 className="mb-4 font-bold text-gray-900 text-lg border-b pb-2">Testes Qualitativos</h4>
                    {renderSelectRow('alizarol', 'Alizarol', [
                      { value: 'Aprovado', label: 'Aprovado' },
                      { value: 'Reprovado', label: 'Reprovado' },
                    ], true)}
                    {renderSelectRow('antibioticos', 'Antibióticos', [
                      { value: 'Nao Detectado', label: 'Não Detectado' },
                      { value: 'Detectado', label: 'Detectado' },
                    ], true)}
                    {renderSelectRow('alcool', 'Álcool', [
                      { value: 'N/R', label: 'N/R' },
                      { value: 'Aprovado', label: 'Aprovado' },
                      { value: 'Reprovado', label: 'Reprovado' },
                    ])}
                  </div>

                  <div>
                    <h4 className="mb-4 font-bold text-gray-900 text-lg border-b pb-2">Análises Físico-Químicas</h4>
                    {renderInputRow('acidez', 'Acidez (°D) *', 'number', '0.1', 'Ex: 16.0')}
                    {renderInputRow('crioscopia', 'Crioscopia (°H) *', 'number', '0.001', 'Ex: -0.530')}
                    {renderInputRow('densidade', 'Densidade (g/mL) *', 'number', '0.001', 'Ex: 1.028')}
                    {renderInputRow('gordura', 'Gordura (%)', 'number', '0.1', 'Ex: 3.5')}
                    {renderInputRow('proteina', 'Proteína (%)', 'number', '0.1', 'Ex: 3.2')}
                    {renderInputRow('temperatura', 'Temperatura (°C) *', 'number', '0.1', 'Ex: 4.5')}
                    {renderInputRow('ph', 'pH', 'number', '0.01', 'Ex: 6.77')}
                    {renderInputRow('porcentagem_agua', 'Porcentagem de Água (%)', 'number', '0.01', 'Ex: 0.00')}
                    {renderInputRow('est', 'E.S.T. (%)', 'number', '0.01', 'Ex: 11.65')}
                    {renderInputRow('esd', 'E.S.D. (%)', 'number', '0.01', 'Ex: 8.45')}
                    
                    <div className="mb-4">
                      <label className="mb-2 block font-medium text-gray-900">Redutase (h:mm)</label>
                      <div className="flex gap-4 overflow-x-auto pb-2">
                        {formStates.map((state, i) => (
                          <div key={i} className="min-w-[150px] flex-1">
                            <span className="mb-1 block text-xs font-semibold text-gray-500">Comp. {i + 1}</span>
                            <input
                              type="text"
                              disabled={isReadOnly}
                              value={state.redutase}
                              onChange={(e) => updateCompartmentForm(i, 'redutase', e.target.value)}
                              placeholder="Ex: -"
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block font-medium text-gray-900">Observacoes Gerais</label>
                    <textarea
                      rows={3}
                      disabled={isReadOnly}
                      value={generalObservations}
                      onChange={(e) => setGeneralObservations(e.target.value)}
                      placeholder="Observacoes adicionais sobre a analise do lote..."
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
                    />
                  </div>

                  {rejectionReasons.length > 0 && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
                        <div>
                          <p className="mb-2 font-bold text-red-900">
                            {isReadOnly ? 'Motivos da reprovação / bloqueio' : 'Atenção! Esta análise reprovará o lote pelos seguintes motivos:'}
                          </p>
                          <ul className="space-y-1 text-sm text-red-800">
                            {rejectionReasons.map((reason, idx) => (
                              <li key={idx}>- {reason}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}

                  {!isReadOnly && rejectionReasons.length === 0 && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600" />
                        <div>
                          <p className="mb-2 font-bold text-blue-900">Regras de bloqueio automatico</p>
                          <ul className="space-y-1 text-sm text-blue-800">
                            <li>- Se <strong>qualquer</strong> compartimento for Reprovado no Alizarol, o lote é bloqueado</li>
                            <li>- Se <strong>qualquer</strong> compartimento tiver Antibiótico, o lote é bloqueado</li>
                            <li>- Acidez fora de 14 a 18 °D ou Crioscopia fora de -0.545 a -0.520 °H</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}

                  {formError && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                      {formError}
                    </div>
                  )}
                </div>
                
                <div className="flex justify-between gap-3 border-t border-gray-200 p-6 bg-gray-50">
                  <button
                    onClick={() => setStep(1)}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-white"
                  >
                    Voltar
                  </button>
                  <div className="flex gap-3">
                    <button
                      onClick={closeModal}
                      className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-white"
                    >
                      {isReadOnly ? 'Fechar' : 'Cancelar'}
                    </button>
                    {!isReadOnly && (
                      <button
                        onClick={() => void handleSubmit()}
                        disabled={saving}
                        className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                        Salvar Análise
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Análise</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta análise e todas as suas subanálises? 
              Esta ação não pode ser desfeita. O status do lote retornará para Aguardando Análise.
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
