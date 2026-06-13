import { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  CheckCircle,
  DollarSign,
  FileText,
  FlaskConical,
  Loader2,
  Milk,
  Package,
  TrendingUp,
  Wallet,
  XCircle,
} from 'lucide-react';
import type { LoteLeite } from '../data/mockData';
import { useCadastros } from '../context/CadastrosContext';
import {
  loadDashboardStats,
  loadMilkLots,
  loadSupplyLots,
  type DashboardStats,
  type SupplyLotInventoryItem,
} from '../services/operationsApi';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: string;
  color: 'blue' | 'green' | 'red' | 'yellow' | 'purple' | 'orange';
}

const emptyStats: DashboardStats = {
  leiteRecebidoMes: 0,
  lotesAprovados: 0,
  lotesBloqueados: 0,
  analisesPendentes: 0,
  opsAbertas: 0,
  producaoFinalizada: 0,
  custoMedioKg: 0,
  folhaLeite: 0,
  contasPagar: 0,
  contasReceber: 0,
  titulosVencidos: 0,
  valorVencido: 0,
  insumosAbaixoMinimo: 0,
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Nao foi possivel carregar o dashboard.';
}

function StatCard({ title, value, icon, trend, color }: StatCardProps) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    red: 'bg-red-50 text-red-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    purple: 'bg-purple-50 text-purple-600',
    orange: 'bg-orange-50 text-orange-600',
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 transition-shadow hover:shadow-lg">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="mb-1 text-sm text-gray-600">{title}</p>
          <p className="mb-2 text-2xl font-bold text-gray-900">{value}</p>
          {trend ? <p className="text-xs text-gray-500">{trend}</p> : null}
        </div>
        <div className={`rounded-lg p-3 ${colorClasses[color]}`}>{icon}</div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>(emptyStats);
  const [milkLots, setMilkLots] = useState<LoteLeite[]>([]);
  const [supplyLots, setSupplyLots] = useState<SupplyLotInventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { supplyItems, getUnitSymbol } = useCadastros();

  const loadData = async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const [nextStats, nextMilkLots, nextSupplyLots] = await Promise.all([
        loadDashboardStats(),
        loadMilkLots(),
        loadSupplyLots(),
      ]);
      setStats(nextStats);
      setMilkLots(nextMilkLots);
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

  const blockedLot = useMemo(() => milkLots.find((lot) => lot.status === 'Bloqueado'), [milkLots]);

  const lowStockItems = useMemo(() => {
    return supplyItems
      .map((item) => {
        const totalFromLots = supplyLots
          .filter((lot) => lot.supplyItemId === item.id)
          .reduce((sum, lot) => sum + lot.availableQuantity, 0);
        const currentStock = totalFromLots > 0 ? totalFromLots : item.currentStock;

        return {
          item,
          currentStock,
        };
      })
      .filter(({ item, currentStock }) => currentStock < item.minimumStock);
  }, [supplyItems, supplyLots]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
          <p className="text-gray-600">Visao geral da operacao e do financeiro em tempo real</p>
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

      {loading ? (
        <div className="flex items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white p-10 text-sm text-gray-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          Carregando indicadores...
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Leite recebido no mes"
              value={`${stats.leiteRecebidoMes.toLocaleString('pt-BR')} L`}
              icon={<Milk className="h-6 w-6" />}
              trend="Recebimentos confirmados no banco"
              color="blue"
            />
            <StatCard
              title="Lotes aprovados"
              value={stats.lotesAprovados}
              icon={<CheckCircle className="h-6 w-6" />}
              trend={`${stats.analisesPendentes} aguardando analise`}
              color="green"
            />
            <StatCard
              title="Lotes bloqueados"
              value={stats.lotesBloqueados}
              icon={<XCircle className="h-6 w-6" />}
              trend="Bloqueios por qualidade"
              color="red"
            />
            <StatCard
              title="OPs abertas"
              value={stats.opsAbertas}
              icon={<FileText className="h-6 w-6" />}
              trend="Ordens em andamento"
              color="yellow"
            />
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Producao finalizada"
              value={stats.producaoFinalizada}
              icon={<Package className="h-6 w-6" />}
              trend="OPs concluidas"
              color="purple"
            />
            <StatCard
              title="Custo medio por litro"
              value={`R$ ${stats.custoMedioKg.toFixed(2)}`}
              icon={<DollarSign className="h-6 w-6" />}
              trend="Base de precificacao"
              color="orange"
            />
            <StatCard
              title="Folha do leite"
              value={`R$ ${stats.folhaLeite.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
              icon={<Wallet className="h-6 w-6" />}
              trend="Titulos vinculados aos produtores"
              color="blue"
            />
            <StatCard
              title="Contas a pagar"
              value={`R$ ${stats.contasPagar.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
              icon={<TrendingUp className="h-6 w-6" />}
              trend={`A receber: R$ ${stats.contasReceber.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
              color="red"
            />
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <StatCard
              title="Analises pendentes"
              value={stats.analisesPendentes}
              icon={<FlaskConical className="h-6 w-6" />}
              trend="Fila do laboratorio"
              color="yellow"
            />
            <StatCard
              title="Titulos vencidos"
              value={stats.titulosVencidos}
              icon={<CalendarClock className="h-6 w-6" />}
              trend={`Valor vencido: R$ ${stats.valorVencido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
              color="red"
            />
            <StatCard
              title="Insumos abaixo do minimo"
              value={stats.insumosAbaixoMinimo}
              icon={<Package className="h-6 w-6" />}
              trend="Reposicao recomendada"
              color="orange"
            />
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h3 className="mb-4 font-bold text-gray-900">Alertas operacionais</h3>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <AlertCard
                title="Estoque minimo"
                tone="yellow"
                icon={<Package className="h-5 w-5 text-yellow-600" />}
              >
                <p className="mb-2 text-sm text-yellow-800">
                  {lowStockItems.length} {lowStockItems.length === 1 ? 'item abaixo do minimo' : 'itens abaixo do minimo'}
                </p>
                {lowStockItems.length > 0 ? (
                  <div className="space-y-1 text-xs text-yellow-700">
                    {lowStockItems.slice(0, 3).map(({ item, currentStock }) => (
                      <p key={item.id}>
                        {item.name}: {currentStock.toLocaleString('pt-BR')} {getUnitSymbol(item.unitId)} / minimo{' '}
                        {item.minimumStock.toLocaleString('pt-BR')} {getUnitSymbol(item.unitId)}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-yellow-700">Nenhum item em nivel critico no momento.</p>
                )}
              </AlertCard>

              <AlertCard
                title="Bloqueio de qualidade"
                tone="red"
                icon={<XCircle className="h-5 w-5 text-red-600" />}
              >
                {blockedLot ? (
                  <>
                    <p className="mb-2 text-sm text-red-800">Lote {blockedLot.codigo} permanece bloqueado</p>
                    <p className="text-xs text-red-700">
                      Motivo: {blockedLot.motivoBloqueio || 'Verificar analise laboratorial'}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-red-800">Nao ha lotes bloqueados no momento.</p>
                )}
              </AlertCard>

              <AlertCard
                title="Financeiro vencido"
                tone="orange"
                icon={<CalendarClock className="h-5 w-5 text-orange-600" />}
              >
                <p className="mb-2 text-sm text-orange-800">
                  {stats.titulosVencidos} titulo(s) vencido(s)
                </p>
                <p className="text-xs text-orange-700">
                  Valor total: R$ {stats.valorVencido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </AlertCard>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function AlertCard({
  title,
  tone,
  icon,
  children,
}: {
  title: string;
  tone: 'yellow' | 'red' | 'orange';
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const toneClass =
    tone === 'yellow'
      ? 'border-yellow-200 bg-yellow-50'
      : tone === 'red'
        ? 'border-red-200 bg-red-50'
        : 'border-orange-200 bg-orange-50';
  const iconClass =
    tone === 'yellow'
      ? 'bg-yellow-100'
      : tone === 'red'
        ? 'bg-red-100'
        : 'bg-orange-100';

  return (
    <div className={`rounded-xl border p-6 ${toneClass}`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${iconClass}`}>
          {icon}
        </div>
        <div>
          <h4 className="mb-1 font-bold text-gray-900">{title}</h4>
          {children}
        </div>
      </div>
    </div>
  );
}
