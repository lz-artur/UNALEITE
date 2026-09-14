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
  ShieldCheck,
  FileCheck2,
  Smartphone,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../context/PermissionsContext';

interface LayoutProps {
  children: React.ReactNode;
  currentPage: string;
  onNavigate: (page: string) => void;
}

const menuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: Home },
  { id: 'recepcao', label: 'Recepcao de Leite', icon: Milk },
  { id: 'analise', label: 'Analise Laboratorial', icon: FlaskConical },
  {
    id: 'lotes',
    label: 'Estoque',
    icon: Package,
    subItems: [
      { id: 'lotes', label: 'Consulta de estoque' },
      { id: 'inventario', label: 'Inventário' },
      { id: 'almoxarifado', label: 'Almoxarifado' },
      { id: 'expedicao', label: 'Expedição' },
    ],
  },
  { id: 'producao', label: 'Producao', icon: Factory },
  { id: 'custos', label: 'Relatorios', icon: DollarSign },
  { id: 'comercial', label: 'Comercial', icon: TruckIcon },
  { id: 'vendedor-externo', label: 'Vendedor externo', icon: Smartphone },
  { id: 'faturamento', label: 'Faturamento NF-e', icon: FileCheck2 },
  { id: 'compras', label: 'Compras', icon: Package },
  {
    id: 'financeiro',
    label: 'Financeiro',
    icon: Wallet,
    subItems: [
      { id: 'contas-receber', label: 'Contas a receber' },
      { id: 'contas-pagar', label: 'Contas a pagar' },
      { id: 'contas-bancarias', label: 'Contas Bancárias' },
    ],
  },
  { id: 'folha-leite', label: 'Folha do Leite', icon: FileText },
  { id: 'dre', label: 'DRE Gerencial', icon: BarChart3 },
  {
    id: 'cadastros',
    label: 'Cadastros',
    icon: Users,
    subItems: [
      { id: 'cadastros-almoxarifado', label: 'Almoxarifado' },
      { id: 'cadastros-accountingCategories', label: 'Categorias Financeiras' },
      { id: 'cadastros-costCenters', label: 'Centros de Custo' },
      { id: 'cadastros-bankAccounts', label: 'Contas Bancárias' },
      { id: 'cadastros-productSpecs', label: 'Ficha Técnica' },
      { id: 'cadastros-suppliers', label: 'Fornecedores' },
      { id: 'cadastros-supplyItems', label: 'Insumos' },
      { id: 'cadastros-stockLocations', label: 'Locais de Estoque' },
      { id: 'cadastros-supplyLots', label: 'Lotes de Insumos' },
      { id: 'cadastros-blockReasons', label: 'Motivos de Bloqueio' },
      { id: 'cadastros-qualityParameters', label: 'Parâmetros de Qualidade' },
      { id: 'cadastros-finishedProducts', label: 'Produtos Acabados' },
      { id: 'cadastros-producers', label: 'Produtores' },
      { id: 'cadastros-milkPriceRules', label: 'Regras de Preço do Leite' },
      { id: 'cadastros-routes', label: 'Rotas' },
      { id: 'cadastros-accountingSubcategories', label: 'Subcategorias' },
      { id: 'cadastros-milkTypes', label: 'Tipos de Matéria-prima' },
      { id: 'cadastros-transporters', label: 'Transportadores' },
      { id: 'cadastros-units', label: 'Unidades de Medida' },
    ],
  },
  // Admin-only menu item — filtered below by permissions
  { id: 'gestao-usuarios', label: 'Gestão de Usuários', icon: ShieldCheck, adminOnly: true },
];

/**
 * Map a menu item id to the page_key used for permission checks.
 * Financeiro sub-items map to their own keys; cadastros sub-items map to 'cadastros'.
 */
function getPageKeyForItem(id: string): string {
  if (id === 'vendedor-externo') return 'comercial';
  if (id.startsWith('cadastros')) return 'cadastros';
  if (id === 'lotes') return 'lotes';
  if (id === 'almoxarifado') return 'inventario';
  if (id === 'financeiro') return 'contas-receber'; // parent entry
  return id;
}

export default function Layout({ children, currentPage, onNavigate }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768);
  const navigate = (page: string) => {
    onNavigate(page);
    if (window.innerWidth < 768) setSidebarOpen(false);
  };
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({
    lotes: currentPage === 'lotes' || currentPage === 'inventario' || currentPage === 'expedicao' || currentPage === 'almoxarifado',
    financeiro: currentPage === 'contas-receber' || currentPage === 'contas-pagar' || currentPage === 'contas-bancarias' || currentPage === 'financeiro',
    cadastros: currentPage.startsWith('cadastros'),
  });
  const { user, signOut } = useAuth();
  const { isAdmin, canViewPage } = usePermissions();

  // Filter menu items based on permissions
  const visibleMenuItems = (menuItems as any[])
    .map((item) => item.subItems
      ? { ...item, subItems: item.subItems.filter((sub: { id: string }) => canViewPage(getPageKeyForItem(sub.id))) }
      : item)
    .filter((item) => {
      if (item.adminOnly) return isAdmin;
      // Um grupo aparece quando há pelo menos um submenu permitido. Assim, um
      // estoquista pode acessar Inventário sem precisar da tela de consulta.
      if (item.subItems) return item.subItems.length > 0;
      return canViewPage(getPageKeyForItem(item.id));
    });

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="fixed left-0 right-0 top-0 z-20 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            <button
              aria-label={sidebarOpen ? 'Fechar menu' : 'Abrir menu'}
              aria-expanded={sidebarOpen}
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
                <h1 className="text-base font-bold text-gray-900 sm:text-xl">UNA Laticinios</h1>
                <p className="text-xs text-gray-500">{currentPage === 'vendedor-externo' ? 'Vendas externas' : 'Sistema de Gestao Industrial'}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden text-right md:block">
              <div className="flex items-center gap-2 justify-end">
                <p className="text-sm font-medium text-gray-900">{user?.email?.split('@')[0] || 'Usuario'}</p>
                {isAdmin && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                    <ShieldCheck className="h-3 w-3" />
                    Admin
                  </span>
                )}
              </div>
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

      {sidebarOpen && <button aria-label="Fechar menu lateral" onClick={() => setSidebarOpen(false)} className="fixed inset-0 top-16 z-30 bg-black/40 md:hidden" />}
      <aside
        aria-hidden={!sidebarOpen}
        hidden={!sidebarOpen}
        className={`fixed bottom-0 left-0 top-[72px] z-30 border-r border-gray-200 bg-white transition-all duration-300 md:z-10 ${
          sidebarOpen ? 'w-64' : 'w-0 -translate-x-full'
        }`}
      >
        <nav className="h-full space-y-1 overflow-y-auto p-4">
          {visibleMenuItems.map((item) => {
            const Icon = item.icon;
            const hasSubItems = 'subItems' in item && item.subItems && item.subItems.length > 0;
            const subItems = hasSubItems ? (item as any).subItems as { id: string; label: string }[] : [];
            const isActiveParent = currentPage === item.id || (hasSubItems && subItems.some((sub: any) => sub.id === currentPage));
            const isExpanded = expandedMenus[item.id] || false;

            return (
              <div key={item.id} className="w-full">
                <button
                  onClick={() => {
                    if (hasSubItems) {
                      setExpandedMenus((prev) => ({ ...prev, [item.id]: !prev[item.id] }));
                    } else {
                      navigate(item.id);
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
                    {subItems.map((sub: any) => {
                      const isSubActive = currentPage === sub.id;
                      return (
                        <button
                          key={sub.id}
                          onClick={() => navigate(sub.id)}
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

      <main className={`pt-[72px] transition-all duration-300 ${currentPage === 'vendedor-externo' ? '' : 'overflow-x-hidden'} ${sidebarOpen ? 'md:ml-64' : 'ml-0'}`}>
        <div className="p-4 sm:p-6">{children}</div>
      </main>
    </div>
  );
}
