import { lotes, insumos, estoquesProdutos, getProdutoById } from '../data/mockData';
import { AlertTriangle, Package, Calendar } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';

export default function LotesEstoque() {
 const insumosAbaixoMinimo = insumos.filter(i => i.estoqueAtual < i.estoqueMinimo);

 return (
 <div className="space-y-6">
 <div>
 <h2 className="text-2xl font-bold text-gray-900">Lotes e Estoque</h2>
 <p className="text-gray-600">Gestão de lotes de leite, insumos e produtos acabados</p>
 </div>

 {/* Alertas */}
 {insumosAbaixoMinimo.length > 0 && (
 <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6">
 <div className="flex items-start gap-3">
 <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
 <div className="flex-1">
 <h3 className="font-bold text-yellow-900 mb-2">Alerta de Estoque Mínimo</h3>
 <div className="space-y-1">
 {insumosAbaixoMinimo.map(insumo => (
 <p key={insumo.id} className="text-sm text-yellow-800">
 • {insumo.nome}: {insumo.estoqueAtual} {insumo.unidade} (mínimo: {insumo.estoqueMinimo} {insumo.unidade})
 </p>
 ))}
 </div>
 </div>
 </div>
 </div>
 )}

 {/* Lotes de Leite */}
 <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
 <div className="p-4 border-b border-gray-200">
 <h3 className="font-bold text-gray-900">Lotes de Leite</h3>
 </div>
 <div className="overflow-x-auto">
 <table className="w-full">
 <thead className="bg-gray-50">
 <tr>
 <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Código</th>
 <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Volume (L)</th>
 <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Recebimento</th>
 <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
 <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Disponível</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-gray-200">
 {lotes.map(lote => (
 <tr key={lote.id} className="hover:bg-gray-50">
 <td className="px-6 py-4 font-medium">{lote.codigo}</td>
 <td className="px-6 py-4 ">{lote.volumeLitros.toLocaleString('pt-BR')}</td>
 <td className="px-6 py-4 text-sm">
 {format(lote.dataHoraRecebimento, 'dd/MM/yyyy')}
 </td>
 <td className="px-6 py-4 ">
 <span className={`px-2 py-1 text-xs font-medium rounded-full ${
 lote.status === 'Aprovado' ? 'bg-green-100 text-green-800' :
 lote.status === 'Aguardando Análise' ? 'bg-yellow-100 text-yellow-800' :
 'bg-red-100 text-red-800'
 }`}>
 {lote.status}
 </span>
 </td>
 <td className="px-6 py-4 ">
 {lote.status === 'Aprovado' ? '✓' : '—'}
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>

 {/* Insumos */}
 <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
 <div className="p-4 border-b border-gray-200">
 <h3 className="font-bold text-gray-900">Estoque de Insumos (FEFO)</h3>
 </div>
 <div className="overflow-x-auto">
 <table className="w-full">
 <thead className="bg-gray-50">
 <tr>
 <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Insumo</th>
 <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
 <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estoque</th>
 <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mínimo</th>
 <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Validade</th>
 <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-gray-200">
 {insumos.map(insumo => {
 const diasValidade = insumo.dataValidade ? differenceInDays(insumo.dataValidade, new Date()) : null;
 const abaixoMinimo = insumo.estoqueAtual < insumo.estoqueMinimo;
 const proximoVencimento = diasValidade !== null && diasValidade < 30;

 return (
 <tr key={insumo.id} className="hover:bg-gray-50">
 <td className="px-6 py-4 font-medium">{insumo.nome}</td>
 <td className="px-6 py-4 text-sm">{insumo.tipo}</td>
 <td className="px-6 py-4">
 <span className={abaixoMinimo ? 'text-red-600 font-medium' : ''}>
 {insumo.estoqueAtual} {insumo.unidade}
 </span>
 </td>
 <td className="px-6 py-4 text-sm text-gray-600">
 {insumo.estoqueMinimo} {insumo.unidade}
 </td>
 <td className="px-6 py-4 text-sm">
 {insumo.dataValidade ? format(insumo.dataValidade, 'dd/MM/yyyy') : '—'}
 </td>
 <td className="px-6 py-4">
 {abaixoMinimo && (
 <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
 Baixo
 </span>
 )}
 {proximoVencimento && !abaixoMinimo && (
 <span className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">
 Vence em {diasValidade}d
 </span>
 )}
 {!abaixoMinimo && !proximoVencimento && (
 <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
 OK
 </span>
 )}
 </td>
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>
 </div>

 {/* Produtos Acabados */}
 <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
 <div className="p-4 border-b border-gray-200">
 <h3 className="font-bold text-gray-900">Estoque de Produtos Acabados</h3>
 </div>
 <div className="overflow-x-auto">
 <table className="w-full">
 <thead className="bg-gray-50">
 <tr>
 <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Produto</th>
 <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Lote</th>
 <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Produzido</th>
 <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Disponível</th>
 <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Validade</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-gray-200">
 {estoquesProdutos.map(estoque => {
 const produto = getProdutoById(estoque.produtoId);
 const diasValidade = differenceInDays(estoque.dataValidade, new Date());

 return (
 <tr key={estoque.id} className="hover:bg-gray-50">
 <td className="px-6 py-4 font-medium">{produto?.nome}</td>
 <td className="px-6 py-4 text-sm">{estoque.lote}</td>
 <td className="px-6 py-4">{estoque.quantidade} {produto?.unidade}</td>
 <td className="px-6 py-4 font-medium text-green-600">
 {estoque.disponivel} {produto?.unidade}
 </td>
 <td className="px-6 py-4">
 <span className={`text-sm ${diasValidade < 3 ? 'text-red-600 font-medium' : diasValidade < 7 ? 'text-yellow-600' : ''}`}>
 {format(estoque.dataValidade, 'dd/MM/yyyy')}
 {diasValidade < 7 && ` (${diasValidade}d)`}
 </span>
 </td>
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>
 </div>
 </div>
 );
}
