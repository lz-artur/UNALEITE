import { useState } from 'react';
import {
  BarChart3,
  DollarSign,
  Factory,
  FileText,
  FlaskConical,
  Home,
  Menu,
  Milk,
  Package,
  TruckIcon,
  Users,
  Wallet,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface LayoutProps {
  children: React.ReactNode;
  currentPage: string;
  onNavigate: (page: string) => void;
}

const menuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: Home },
  { id: 'recepcao', label: 'Recepcao de Leite', icon: Milk },
  { id: 'analise', label: 'Analise Laboratorial', icon: FlaskConical },
  { id: 'lotes', label: 'Lotes e Estoque', icon: Package },
  { id: 'producao', label: 'Producao', icon: Factory },
  { id: 'custos', label: 'Relatorios', icon: DollarSign },
  { id: 'comercial', label: 'Comercial', icon: TruckIcon },
  { id: 'compras', label: 'Compras', icon: Package },
  {
    id: 'financeiro',
    label: 'Financeiro',
    icon: Wallet,
    subItems: [
      { id: 'contas-receber', label: 'Contas a receber' },
      { id: 'contas-pagar', label: 'Contas a pagar' },
    ],
  },
  { id: 'folha-leite', label: 'Folha do Leite', icon: FileText },
  { id: 'dre', label: 'DRE Gerencial', icon: BarChart3 },
  { id: 'cadastros', label: 'Cadastros', icon: Users },
];

export default function Layout({ children, currentPage, onNavigate }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({
    financeiro: currentPage === 'contas-receber' || currentPage === 'contas-pagar' || currentPage === 'financeiro',
  });
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="fixed left-0 right-0 top-0 z-20 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="rounded-lg p-2 transition-colors hover:bg-gray-100"
            >
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600">
                <Milk className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">UNA Laticinios</h1>
                <p className="text-xs text-gray-500">Sistema de Gestao Industrial</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden text-right md:block">
              <p className="text-sm font-medium text-gray-900">{user?.email?.split('@')[0] || 'Usuario'}</p>
              <p className="text-xs text-gray-500">{user?.email || 'Sem e-mail'}</p>
            </div>
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      <aside
        className={`fixed bottom-0 left-0 top-16 z-10 border-r border-gray-200 bg-white transition-all duration-300 ${
          sidebarOpen ? 'w-64' : 'w-0 -translate-x-full'
        }`}
      >
        <nav className="h-full space-y-1 overflow-y-auto p-4">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const hasSubItems = item.subItems && item.subItems.length > 0;
            const isActiveParent = currentPage === item.id || (hasSubItems && item.subItems!.some(sub => sub.id === currentPage));
            const isExpanded = expandedMenus[item.id] || false;

            return (
              <div key={item.id} className="w-full">
                <button
                  onClick={() => {
                    if (hasSubItems) {
                      setExpandedMenus((prev) => ({ ...prev, [item.id]: !prev[item.id] }));
                    } else {
                      onNavigate(item.id);
                    }
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-4 py-3 transition-colors ${
                    isActiveParent && !hasSubItems ? 'bg-blue-50 font-medium text-blue-700' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`h-5 w-5 flex-shrink-0 ${isActiveParent && !hasSubItems ? 'text-blue-700' : ''}`} />
                    <span className={`text-sm ${isActiveParent && hasSubItems ? 'font-medium' : ''}`}>{item.label}</span>
                  </div>
                  {hasSubItems && (
                    isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                  )}
                </button>
                
                {hasSubItems && isExpanded && (
                  <div className="mt-1 space-y-1 pl-4">
                    {item.subItems!.map((sub) => {
                      const isSubActive = currentPage === sub.id;
                      return (
                        <button
                          key={sub.id}
                          onClick={() => onNavigate(sub.id)}
                          className={`flex w-full items-center gap-3 rounded-lg py-2 pl-8 pr-4 transition-colors relative ${
                            isSubActive ? 'bg-blue-50/50 font-medium text-blue-700' : 'text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          <div className={`absolute left-4 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full ${isSubActive ? 'bg-blue-600' : 'bg-gray-300'}`} />
                          <span className="text-sm">{sub.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      <main className={`pt-16 transition-all duration-300 overflow-x-hidden ${sidebarOpen ? 'ml-64' : 'ml-0'}`}>
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
