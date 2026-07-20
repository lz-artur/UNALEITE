import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { differenceInDays, format } from 'date-fns';
import { AlertTriangle, Award, DollarSign, Loader2, TrendingUp, Trash2 } from 'lucide-react';
import type { AnaliseLaboral, EstoqueProduto, LoteLeite, PrecificacaoLeite } from '../data/mockData';
import { useCadastros } from '../context/CadastrosContext';
import {
 loadFinishedProductLots,
 loadMilkAnalyses,
 loadMilkLotDetail,
 loadMilkLots,
 loadMilkPricings,
 loadSupplyLots,
 deleteSupplyLot,
 deleteFinishedProductLot,
 type MilkLotDetail,
 type SupplyLotInventoryItem,
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

 return 'Nao foi possivel carregar os dados de estoque.';
}

export default function LotesEstoqueDetalhado() {
 const [selectedTab, setSelectedTab] = useState<'leite' | 'insumos' | 'produtos'>('leite');
 const [selectedLoteId, setSelectedLoteId] = useState<string | null>(null);
 const [lotes, setLotes] = useState<LoteLeite[]>([]);
 const [estoquesProdutos, setEstoquesProdutos] = useState<EstoqueProduto[]>([]);
 const [analises, setAnalises] = useState<AnaliseLaboral[]>([]);
 const [precificacoes, setPrecificacoes] = useState<PrecificacaoLeite[]>([]);
 const [supplyLots, setSupplyLots] = useState<SupplyLotInventoryItem[]>([]);
 const [selectedLoteDetail, setSelectedLoteDetail] = useState<MilkLotDetail | null>(null);
 const [loading, setLoading] = useState(true);
 const [detailLoading, setDetailLoading] = useState(false);
 const [errorMessage, setErrorMessage] = useState<string | null>(null);
 const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
 const [itemToDelete, setItemToDelete] = useState<string | null>(null);
 const [deleteType, setDeleteType] = useState<'supply' | 'product' | null>(null);
 const [isDeleting, setIsDeleting] = useState(false);
 const {
 producers,
 supplyItems,
 getProducerById,
 getSupplierById,
 getSupplyItemById,
 getFinishedProductById,
 getUnitSymbol,
 } = useCadastros();

 const loadData = async () => {
 setLoading(true);
 setErrorMessage(null);

 try {
 const [nextLotes, nextEstoquesProdutos, nextAnalises, nextPrecificacoes, nextSupplyLots] =
 await Promise.all([
 loadMilkLots(),
 loadFinishedProductLots(),
 loadMilkAnalyses(),
 loadMilkPricings(),
 loadSupplyLots(),
 ]);

 setLotes(nextLotes);
 setEstoquesProdutos(nextEstoquesProdutos);
 setAnalises(nextAnalises);
 setPrecificacoes(nextPrecificacoes);
 setSupplyLots(nextSupplyLots);
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
 if (!selectedLoteId) {
 setSelectedLoteDetail(null);
 return;
 }

 let active = true;
 setDetailLoading(true);

 void loadMilkLotDetail(selectedLoteId)
 .then((detail) => {
 if (active) {
 setSelectedLoteDetail(detail);
 }
 })
 .catch((error) => {
 if (active) {
 setSelectedLoteDetail(null);
 setErrorMessage(getErrorMessage(error));
 }
 })
 .finally(() => {
 if (active) {
 setDetailLoading(false);
 }
 });

 return () => {
 active = false;
 };
 }, [selectedLoteId]);

 const handleDelete = async () => {
    if (!itemToDelete || !deleteType) return;
    setIsDeleting(true);
    setErrorMessage(null);

    try {
      if (deleteType === 'supply') {
        await deleteSupplyLot(itemToDelete);
        setSupplyLots((current) => current.filter((l) => l.id !== itemToDelete));
      } else if (deleteType === 'product') {
        await deleteFinishedProductLot(itemToDelete);
        setEstoquesProdutos((current) => current.filter((l) => l.id !== itemToDelete));
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

 const getAnaliseByLoteId = (loteId: string) => analises.find((analise) => analise.loteId === loteId);
 const getPrecificacaoByLoteId = (loteId: string) =>
 precificacoes.find((precificacao) => precificacao.loteId === loteId);

 const selectedLote = selectedLoteDetail?.lot || lotes.find((lote) => lote.id === selectedLoteId) || null;
 const selectedAnalise =
 selectedLoteDetail?.analysis || (selectedLote ? getAnaliseByLoteId(selectedLote.id) : null);
 const selectedPrecificacao =
 selectedLoteDetail?.pricing || (selectedLote ? getPrecificacaoByLoteId(selectedLote.id) : null);

 const supplyItemSummaries = useMemo(() => {
 return supplyItems.map((item) => {
 const lotRows = supplyLots.filter((lot) => lot.supplyItemId === item.id);
 const totalAvailableFromLots = lotRows.reduce((sum, lot) => sum + lot.availableQuantity, 0);
 const currentStock = lotRows.length > 0 ? totalAvailableFromLots : item.currentStock;

 return {
 item,
 currentStock,
 };
 });
 }, [supplyItems, supplyLots]);

 const insumosAbaixoMinimo = useMemo(
 () =>
 supplyItemSummaries.filter(({ item, currentStock }) => currentStock < item.minimumStock),
 [supplyItemSummaries],
 );

 const lotesComAnalise = lotes.filter((lote) => lote.analiseId);
 const mediaGordura =
 lotesComAnalise.length > 0
 ? lotesComAnalise.reduce((sum, lote) => sum + (getAnaliseByLoteId(lote.id)?.gordura || 0), 0) /
 lotesComAnalise.length
 : 0;
 const mediaProteina =
 lotesComAnalise.length > 0
 ? lotesComAnalise.reduce((sum, lote) => sum + (getAnaliseByLoteId(lote.id)?.proteina || 0), 0) /
 lotesComAnalise.length
 : 0;
 const lotesComCusto = lotes.filter((lote) => lote.custoLitro != null);
 const custoMedioLitro =
 lotesComCusto.length > 0
 ? lotesComCusto.reduce((sum, lote) => sum + (lote.custoLitro || 0), 0) / lotesComCusto.length
 : 0;

 const rankingProdutores = producers
 .map((producer) => {
 const producerLotes = lotes.filter((lote) => lote.produtorId === producer.id && lote.analiseId);
 const producerAnalyses = producerLotes
 .map((lote) => getAnaliseByLoteId(lote.id))
 .filter(Boolean) as AnaliseLaboral[];
 const producerPricings = producerLotes
 .map((lote) => getPrecificacaoByLoteId(lote.id))
 .filter(Boolean) as PrecificacaoLeite[];
 const totalVolume = producerLotes.reduce((sum, lote) => sum + lote.volumeLitros, 0);
 const averageFat =
 producerAnalyses.length > 0
 ? producerAnalyses.reduce((sum, analysis) => sum + (analysis.gordura || 0), 0) /
 producerAnalyses.length
 : 0;
 const averageProtein =
 producerAnalyses.length > 0
 ? producerAnalyses.reduce((sum, analysis) => sum + (analysis.proteina || 0), 0) /
 producerAnalyses.length
 : 0;
 const averagePrice =
 producerPricings.length > 0
 ? producerPricings.reduce((sum, row) => sum + row.precoFinal, 0) / producerPricings.length
 : 0;
 const totalValue = producerPricings.reduce((sum, row) => sum + row.valorTotal, 0);

 return {
 producer,
 totalVolume,
 averageFat,
 averageProtein,
 averagePrice,
 totalValue,
 score: averageFat * 0.5 + averageProtein * 0.5,
 };
 })
 .filter((item) => item.totalVolume > 0)
 .sort((a, b) => b.score - a.score);

  const sortedLotes = useMemo(() => {
    return [...lotes].sort((a, b) => {
      const getTimestamp = (codigo: string) => {
        const parts = codigo.split('-');
        return parts.length >= 3 ? parseInt(parts[2], 10) : 0;
      };
      return getTimestamp(b.codigo) - getTimestamp(a.codigo);
    });
  }, [lotes]);

 return (
 <div className="space-y-6">
 <div className="flex items-start justify-between gap-4">
 <div>
 <h2 className="text-2xl font-bold text-gray-900">Lotes e estoque</h2>
 <p className="text-gray-600">Rastreabilidade de leite cru, insumos e produtos acabados</p>
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

 <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
 <div className="flex border-b border-gray-200">
 {[
 { key: 'leite', label: 'Lotes de leite cru' },
 { key: 'insumos', label: 'Lotes de insumos' },
 { key: 'produtos', label: 'Produtos acabados' },
 ].map((tab) => (
 <button
 key={tab.key}
 onClick={() => setSelectedTab(tab.key as typeof selectedTab)}
 className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
 selectedTab === tab.key
 ? 'border-b-2 border-blue-600 bg-blue-50 text-blue-700'
 : 'text-gray-600 hover:bg-gray-50'
 }`}
 >
 {tab.label}
 </button>
 ))}
 </div>
 </div>

 {insumosAbaixoMinimo.length > 0 ? (
 <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-6">
 <div className="flex items-start gap-3">
 <AlertTriangle className="mt-0.5 h-5 w-5 text-yellow-600" />
 <div className="flex-1">
 <h3 className="mb-2 font-bold text-yellow-900">Alerta de estoque minimo</h3>
 <div className="space-y-1">
 {insumosAbaixoMinimo.map(({ item, currentStock }) => (
 <p key={item.id} className="text-sm text-yellow-800">
 - {item.name}: {currentStock.toLocaleString('pt-BR')} {getUnitSymbol(item.unitId)}
 {' '} (minimo: {item.minimumStock.toLocaleString('pt-BR')} {getUnitSymbol(item.unitId)})
 </p>
 ))}
 </div>
 </div>
 </div>
 </div>
 ) : null}

 {loading ? (
 <div className="flex items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white p-10 text-sm text-gray-600">
 <Loader2 className="h-5 w-5 animate-spin" />
 Carregando rastreabilidade...
 </div>
 ) : null}

 {!loading && selectedTab === 'leite' ? (
 <div className="space-y-6">
 <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
 <MetricCard title="Gordura media" value={`${mediaGordura.toFixed(2)}%`} subtitle="Lotes com analise" />
 <MetricCard title="Proteina media" value={`${mediaProteina.toFixed(2)}%`} subtitle="Lotes com analise" />
 <MetricCard
 title="Custo medio por litro"
 value={`R$ ${custoMedioLitro.toFixed(2)}`}
 subtitle="Base de custo industrial"
 icon={<DollarSign className="h-6 w-6 text-blue-600" />}
 />
 </div>

 <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
 <div className="border-b border-gray-200 p-4">
 <h3 className="font-bold text-gray-900">Lotes de leite com qualidade e precificacao</h3>
 </div>
 {sortedLotes.length === 0 ? (
 <div className="p-8 text-center text-sm text-gray-600">Nenhum lote de leite encontrado.</div>
 ) : (
 <div className="overflow-x-auto">
 <table className="w-full">
 <thead className="bg-gray-50">
 <tr>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Lote</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Produtor</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Volume</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Gordura</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Proteina</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Custo/L</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Acoes</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-gray-200">
 {sortedLotes.map((lote) => {
 const producer = getProducerById(lote.produtorId);
 const analysis = getAnaliseByLoteId(lote.id);

 return (
 <tr key={lote.id} className="hover:bg-gray-50">
 <td className="px-6 py-4 font-medium">{lote.codigo}</td>
 <td className="px-6 py-4 text-sm">{producer?.name || '-'}</td>
 <td className="px-6 py-4 text-sm">
 <div className="font-medium">{lote.volumeLitros.toLocaleString('pt-BR')} L</div>
 <div className="text-xs text-gray-500">
 Disp: {(lote.volumeDisponivel || 0).toLocaleString('pt-BR')} L
 </div>
 </td>
 <td className="px-6 py-4">
 {analysis?.gordura != null ? `${analysis.gordura.toFixed(1)}%` : '-'}
 </td>
 <td className="px-6 py-4">
 {analysis?.proteina != null ? `${analysis.proteina.toFixed(1)}%` : '-'}
 </td>
 <td className="px-6 py-4 font-medium">
 {lote.custoLitro != null ? `R$ ${lote.custoLitro.toFixed(2)}` : '-'}
 </td>
 <td className="px-6 py-4">
 <LoteStatusBadge status={lote.status} />
 </td>
 <td className="px-6 py-4">
 <button
 onClick={() => setSelectedLoteId(lote.id)}
 className="text-sm font-medium text-blue-600 hover:text-blue-800"
 >
 Ver detalhes
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

 <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
 <div className="border-b border-gray-200 p-4">
 <h3 className="font-bold text-gray-900">Ranking de produtores por qualidade</h3>
 </div>
 {rankingProdutores.length === 0 ? (
 <div className="p-8 text-center text-sm text-gray-600">Ainda nao ha ranking com base em analises reais.</div>
 ) : (
 <div className="overflow-x-auto">
 <table className="w-full">
 <thead className="bg-gray-50">
 <tr>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Ranking</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Produtor</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Volume</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Gordura</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Proteina</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Preco medio</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Total pago</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-gray-200">
 {rankingProdutores.map((row, index) => (
 <tr key={row.producer.id} className="hover:bg-gray-50">
 <td className="px-6 py-4">
 <div className="flex items-center gap-2">
 {index === 0 ? <Award className="h-5 w-5 text-yellow-500" /> : null}
 <span className="font-bold">{index + 1}o</span>
 </div>
 </td>
 <td className="px-6 py-4 font-medium">{row.producer.name}</td>
 <td className="px-6 py-4">{row.totalVolume.toLocaleString('pt-BR')} L</td>
 <td className="px-6 py-4">{row.averageFat.toFixed(2)}%</td>
 <td className="px-6 py-4">{row.averageProtein.toFixed(2)}%</td>
 <td className="px-6 py-4">R$ {row.averagePrice.toFixed(2)}</td>
 <td className="px-6 py-4 font-medium text-green-600">
 R$ {row.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 )}
 </div>
 </div>
 ) : null}

 {!loading && selectedTab === 'insumos' ? (
 <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
 <div className="border-b border-gray-200 p-4">
 <h3 className="font-bold text-gray-900">Lotes de insumos</h3>
 </div>
 {supplyLots.length === 0 ? (
 <div className="p-8 text-center text-sm text-gray-600">Nenhum lote de insumo encontrado.</div>
 ) : (
 <div className="overflow-x-auto">
 <table className="w-full">
 <thead className="bg-gray-50">
 <tr>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Insumo</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Lote interno</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Fornecedor</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Origem</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Disponivel</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Validade</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
 <th className="px-6 py-3 text-right text-xs font-medium uppercase text-gray-500">Ações</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-gray-200">
 {supplyLots.map((lot) => {
 const supplyItem = getSupplyItemById(lot.supplyItemId);
 const supplierName = lot.supplierName || getSupplierById(lot.supplierId)?.name || '-';
 const unitSymbol = getUnitSymbol(lot.unitId || supplyItem?.unitId);
 const minimumStock = lot.minimumStock ?? supplyItem?.minimumStock ?? 0;

 return (
 <tr key={lot.id} className="hover:bg-gray-50">
 <td className="px-6 py-4 font-medium">{lot.supplyItemName || supplyItem?.name || '-'}</td>
 <td className="px-6 py-4 text-sm">{lot.internalLotCode}</td>
 <td className="px-6 py-4 text-sm">{supplierName}</td>
 <td className="px-6 py-4 text-sm">{lot.purchaseNumber || 'Entrada direta'}</td>
 <td className="px-6 py-4">
 <div className="font-medium">
 {lot.availableQuantity.toLocaleString('pt-BR')} {unitSymbol}
 </div>
 <div className="text-xs text-gray-500">
 Minimo do item: {minimumStock.toLocaleString('pt-BR')} {unitSymbol}
 </div>
 </td>
 <td className="px-6 py-4 text-sm">
 {lot.expirationDate ? format(lot.expirationDate, 'dd/MM/yyyy') : '-'}
 </td>
 <td className="px-6 py-4">
 <SupplyLotStatusBadge status={lot.status} />
 </td>
 <td className="px-6 py-4 text-right">
    <button
      onClick={() => {
        setItemToDelete(lot.id);
        setDeleteType('supply');
        setDeleteConfirmOpen(true);
      }}
      className="text-red-600 hover:text-red-900"
      title="Excluir lote"
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
 ) : null}

 {!loading && selectedTab === 'produtos' ? (
 <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
 <div className="border-b border-gray-200 p-4">
 <h3 className="font-bold text-gray-900">Estoque de produtos acabados</h3>
 </div>
 {estoquesProdutos.length === 0 ? (
 <div className="p-8 text-center text-sm text-gray-600">Nenhum lote de produto acabado encontrado.</div>
 ) : (
 <div className="overflow-x-auto">
 <table className="w-full">
 <thead className="bg-gray-50">
 <tr>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Produto</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Lote</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Produzido</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Disponivel</th>
 <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Validade</th>
 <th className="px-6 py-3 text-right text-xs font-medium uppercase text-gray-500">Ações</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-gray-200">
 {estoquesProdutos.map((stock) => {
 const product = getFinishedProductById(stock.produtoId);
 const daysToExpire = differenceInDays(stock.dataValidade, new Date());

 return (
 <tr key={stock.id} className="hover:bg-gray-50">
 <td className="px-6 py-4 font-medium">{product?.name || '-'}</td>
 <td className="px-6 py-4 text-sm">{stock.lote}</td>
 <td className="px-6 py-4">
 {stock.quantidade} {getUnitSymbol(product?.unitId)}
 </td>
 <td className="px-6 py-4 font-medium text-green-600">
 {stock.disponivel} {getUnitSymbol(product?.unitId)}
 </td>
 <td className="px-6 py-4">
 <span
 className={`text-sm ${
 daysToExpire < 3
 ? 'font-medium text-red-600'
 : daysToExpire < 7
 ? 'text-yellow-600'
 : ''
 }`}
 >
 {format(stock.dataValidade, 'dd/MM/yyyy')}
 {daysToExpire < 7 ? ` (${daysToExpire}d)` : ''}
 </span>
 </td>
 <td className="px-6 py-4 text-right">
    <button
      onClick={() => {
        setItemToDelete(stock.id);
        setDeleteType('product');
        setDeleteConfirmOpen(true);
      }}
      className="text-red-600 hover:text-red-900"
      title="Excluir lote"
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
 ) : null}

 {selectedLote ? (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
 <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white">
 <div className="flex items-start justify-between border-b border-gray-200 p-6">
 <div>
 <h3 className="text-xl font-bold text-gray-900">Detalhes do lote {selectedLote.codigo}</h3>
 <p className="text-sm text-gray-600">
 Produtor: {getProducerById(selectedLote.produtorId)?.name || '-'}
 </p>
 </div>
 <button
 onClick={() => setSelectedLoteId(null)}
 className="text-gray-500 hover:text-gray-900"
 >
 Fechar
 </button>
 </div>

 {detailLoading ? (
 <div className="flex items-center justify-center gap-3 p-10 text-sm text-gray-600">
 <Loader2 className="h-5 w-5 animate-spin" />
 Carregando detalhe do lote...
 </div>
 ) : (
 <div className="space-y-6 p-6">
 <SectionBlock title="Entrada do lote">
 <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
 <InfoPair label="Volume total" value={`${selectedLote.volumeLitros.toLocaleString('pt-BR')} L`} />
 <InfoPair
 label="Volume disponivel"
 value={`${(selectedLote.volumeDisponivel || 0).toLocaleString('pt-BR')} L`}
 />
 <InfoPair label="Temperatura" value={`${selectedLote.temperatura.toFixed(1)} C`} />
 <InfoPair
 label="Recebimento"
 value={format(selectedLote.dataHoraRecebimento, 'dd/MM/yyyy HH:mm')}
 />
 <InfoPair label="Status atual" value={selectedLote.status} />
 <InfoPair label="Motivo de bloqueio" value={selectedLote.motivoBloqueio || '-'} />
 </div>
 </SectionBlock>

 {selectedAnalise ? (
 <SectionBlock title="Analise de qualidade">
 <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
 <MetricTile label="Gordura" value={`${selectedAnalise.gordura?.toFixed(2) || '-'}%`} />
 <MetricTile label="Proteina" value={`${selectedAnalise.proteina?.toFixed(2) || '-'}%`} />
 <MetricTile label="Acidez" value={`${selectedAnalise.acidez} D`} />
 <MetricTile label="CBT" value={selectedAnalise.cbt?.toLocaleString('pt-BR') || '-'} />
 <MetricTile label="CCS" value={selectedAnalise.ccs?.toLocaleString('pt-BR') || '-'} />
 <MetricTile label="Crioscopia" value={`${selectedAnalise.crioscopia} H`} />
 </div>
 </SectionBlock>
 ) : null}

 {selectedPrecificacao ? (
 <SectionBlock title="Precificacao aplicada">
 <div className="space-y-2 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm">
 <PriceLine label="Preco base" value={`R$ ${selectedPrecificacao.precoBase.toFixed(2)}/L`} />
 <PriceLine label="Bonus gordura" value={`R$ ${selectedPrecificacao.bonusGordura.toFixed(2)}/L`} positive />
 <PriceLine label="Bonus proteina" value={`R$ ${selectedPrecificacao.bonusProteina.toFixed(2)}/L`} positive />
 <PriceLine
 label="Penalizacao acidez"
 value={`R$ ${selectedPrecificacao.penalizacaoAcidez.toFixed(2)}/L`}
 negative={selectedPrecificacao.penalizacaoAcidez < 0}
 />
 <PriceLine
 label="Penalizacao CBT"
 value={`R$ ${selectedPrecificacao.penalizacaoCBT.toFixed(2)}/L`}
 negative={selectedPrecificacao.penalizacaoCBT < 0}
 />
 <PriceLine
 label="Penalizacao CCS"
 value={`R$ ${selectedPrecificacao.penalizacaoCCS.toFixed(2)}/L`}
 negative={selectedPrecificacao.penalizacaoCCS < 0}
 />
 <div className="flex justify-between border-t border-blue-200 pt-2 font-semibold">
 <span>Preco final</span>
 <span>R$ {selectedPrecificacao.precoFinal.toFixed(2)}/L</span>
 </div>
 <div className="flex justify-between font-bold text-green-700">
 <span>Valor total do lote</span>
 <span>
 R$ {selectedPrecificacao.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
 </span>
 </div>
 </div>
 </SectionBlock>
 ) : null}

 <SectionBlock title="Bloqueios e eventos">
 {selectedLoteDetail?.blockEvents?.length ? (
 <div className="space-y-2">
 {selectedLoteDetail.blockEvents.map((event) => (
 <div key={event.id} className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm">
 <p className="font-medium text-red-800">{event.reasonSnapshot || 'Bloqueio registrado'}</p>
 <p className="text-red-700">{event.notes || 'Sem observacoes adicionais.'}</p>
 <p className="mt-1 text-xs text-red-600">
 {event.createdAt ? format(event.createdAt, 'dd/MM/yyyy HH:mm') : '-'}
 </p>
 </div>
 ))}
 </div>
 ) : (
 <p className="text-sm text-gray-600">Nenhum evento de bloqueio registrado.</p>
 )}
 </SectionBlock>

 <SectionBlock title="Consumo e producao vinculados">
 {selectedLoteDetail?.productionOrders?.length ? (
 <div className="space-y-3">
 {selectedLoteDetail.productionOrders.map((order) => {
 const product = getFinishedProductById(order.produtoId);
 const consumption = selectedLoteDetail.milkConsumptions.find(
 (item) => item.productionOrderId === order.id,
 );
 const generatedLots = selectedLoteDetail.finishedProductLots.filter(
 (item) => item.ordemProducaoId === order.id,
 );

 return (
 <div key={order.id} className="rounded-xl border border-gray-200 p-4">
 <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
 <InfoPair label="OP" value={order.numero} />
 <InfoPair label="Produto" value={product?.name || '-'} />
 <InfoPair
 label="Leite consumido"
 value={`${consumption?.litersConsumed.toLocaleString('pt-BR') || order.litrosUtilizados.toLocaleString('pt-BR')} L`}
 />
 <InfoPair label="Status" value={order.status} />
 </div>
 {generatedLots.length > 0 ? (
 <div className="mt-3 rounded-lg bg-gray-50 p-3 text-sm">
 <p className="mb-2 font-medium text-gray-900">Lotes acabados gerados</p>
 <div className="space-y-1">
 {generatedLots.map((lot) => (
 <p key={lot.id} className="text-gray-700">
 - {lot.lote}: {lot.quantidade} {getUnitSymbol(product?.unitId)} produzidos,{' '}
 {lot.disponivel} disponiveis
 </p>
 ))}
 </div>
 </div>
 ) : null}
 </div>
 );
 })}
 </div>
 ) : (
 <p className="text-sm text-gray-600">Esse lote ainda nao foi consumido em producao.</p>
 )}
 </SectionBlock>
 </div>
 )}
 </div>
 </div>
 ) : null}

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Lote</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este lote de {deleteType === 'supply' ? 'insumo' : 'produto acabado'}? Esta ação não pode ser desfeita.
              A exclusão não será permitida se o lote tiver sido parcial ou totalmente utilizado/vendido.
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

function MetricCard({
 title,
 value,
 subtitle,
 icon,
}: {
 title: string;
 value: string;
 subtitle: string;
 icon?: ReactNode;
}) {
 return (
 <div className="rounded-xl border border-gray-200 bg-white p-6">
 <div className="flex items-start justify-between">
 <div>
 <p className="mb-1 text-sm text-gray-600">{title}</p>
 <p className="text-2xl font-bold text-gray-900">{value}</p>
 <p className="mt-1 text-xs text-gray-500">{subtitle}</p>
 </div>
 <div className="rounded-lg bg-blue-50 p-3">
 {icon || <TrendingUp className="h-6 w-6 text-blue-600" />}
 </div>
 </div>
 </div>
 );
}

function LoteStatusBadge({ status }: { status: string }) {
 const classes =
 status === 'Aprovado' || status === 'Parcialmente Utilizado'
 ? 'bg-green-100 text-green-800'
 : status === 'Aguardando Análise' || status === 'Aguardando Analise'
 ? 'bg-yellow-100 text-yellow-800'
 : 'bg-red-100 text-red-800';

 return <span className={`rounded-full px-2 py-1 text-xs font-medium ${classes}`}>{status}</span>;
}

function SupplyLotStatusBadge({ status }: { status: string }) {
 const classes =
 status === 'Disponivel'
 ? 'bg-green-100 text-green-800'
 : status === 'Parcialmente Utilizado'
 ? 'bg-yellow-100 text-yellow-800'
 : status === 'Vencido' || status === 'Bloqueado'
 ? 'bg-red-100 text-red-800'
 : 'bg-gray-100 text-gray-800';

 return <span className={`rounded-full px-2 py-1 text-xs font-medium ${classes}`}>{status}</span>;
}

function SectionBlock({
 title,
 children,
}: {
 title: string;
 children: ReactNode;
}) {
 return (
 <div>
 <h4 className="mb-3 font-bold text-gray-900">{title}</h4>
 {children}
 </div>
 );
}

function InfoPair({ label, value }: { label: string; value: string }) {
 return (
 <div>
 <span className="text-gray-600">{label}</span>
 <p className="font-medium text-gray-900">{value}</p>
 </div>
 );
}

function MetricTile({ label, value }: { label: string; value: string }) {
 return (
 <div className="rounded-lg bg-gray-50 p-3">
 <p className="mb-1 text-xs text-gray-600">{label}</p>
 <p className="text-lg font-bold text-gray-900">{value}</p>
 </div>
 );
}

function PriceLine({
 label,
 value,
 positive,
 negative,
}: {
 label: string;
 value: string;
 positive?: boolean;
 negative?: boolean;
}) {
 return (
 <div
 className={`flex justify-between ${
 positive ? 'text-green-700' : negative ? 'text-red-700' : 'text-gray-700'
 }`}
 >
 <span>{label}</span>
 <span className="font-medium">{value}</span>
 </div>
 );
}
