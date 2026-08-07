import { useState } from 'react';
import { Toaster } from 'sonner';
import AuthScreen from './components/AuthScreen';
import CadastrosBase from './components/CadastrosBase';
import Comercial from './components/Comercial';
import Compras from './components/Compras';
import Dashboard from './components/Dashboard';
import Financeiro from './components/Financeiro';
import FolhaLeite from './components/FolhaLeite';
import AnaliseLaboral from './components/AnaliseLaboral';
import Layout from './components/Layout';
import LotesEstoqueDetalhado from './components/LotesEstoqueDetalhado';
import DreGerencial from './components/DreGerencial';
import Producao from './components/Producao';
import RelatoriosOperacionais from './components/RelatoriosOperacionais';
import RecepcaoLeite from './components/RecepcaoLeite';
import ContasReceber from './components/financeiro/ContasReceber';
import ContasPagar from './components/financeiro/ContasPagar';
import GestaoUsuarios from './components/GestaoUsuarios';
import { useAuth } from './context/AuthContext';
import { CadastrosProvider } from './context/CadastrosContext';
import { PermissionsProvider, usePermissions } from './context/PermissionsContext';
import { ShieldAlert } from 'lucide-react';

// ─── Access Denied page ─────────────────────────────────────
function AccessDenied({ onGoHome }: { onGoHome: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-red-50">
        <ShieldAlert className="h-10 w-10 text-red-400" />
      </div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Acesso Negado</h2>
      <p className="text-gray-500 mb-6 max-w-md">
        Você não tem permissão para acessar esta página. Entre em contato com o administrador do sistema para solicitar acesso.
      </p>
      <button
        onClick={onGoHome}
        className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
      >
        Voltar ao Dashboard
      </button>
    </div>
  );
}

// ─── Page key mapping ───────────────────────────────────────
function getPageKey(currentPage: string): string {
  if (currentPage.startsWith('cadastros')) return 'cadastros';
  return currentPage;
}

// ─── Main App Content (inside PermissionsProvider) ──────────
function AppInner() {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const { canViewPage, isAdmin, loading: permLoading } = usePermissions();

  const renderPage = () => {
    const pageKey = getPageKey(currentPage);

    // Admin-only page
    if (currentPage === 'gestao-usuarios') {
      if (!isAdmin) return <AccessDenied onGoHome={() => setCurrentPage('dashboard')} />;
      return <GestaoUsuarios />;
    }

    // Permission check (skip during loading for graceful UX)
    if (!permLoading && !canViewPage(pageKey)) {
      return <AccessDenied onGoHome={() => setCurrentPage('dashboard')} />;
    }

    if (currentPage.startsWith('cadastros')) {
      const section = currentPage === 'cadastros' ? 'producers' : currentPage.replace('cadastros-', '');
      return <CadastrosBase section={section as any} />;
    }

    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />;
      case 'recepcao':
        return <RecepcaoLeite />;
      case 'analise':
        return <AnaliseLaboral />;
      case 'lotes':
        return <LotesEstoqueDetalhado />;
      case 'producao':
        return <Producao />;
      case 'custos':
        return <RelatoriosOperacionais />;
      case 'comercial':
        return <Comercial />;
      case 'compras':
        return <Compras />;
      case 'financeiro':
        return <Financeiro />;
      case 'contas-receber':
        return <ContasReceber />;
      case 'contas-pagar':
        return <ContasPagar />;
      case 'folha-leite':
        return <FolhaLeite />;
      case 'dre':
        return <DreGerencial />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <CadastrosProvider>
      <Toaster richColors position="top-right" />
      <Layout currentPage={currentPage} onNavigate={setCurrentPage}>
        {renderPage()}
      </Layout>
    </CadastrosProvider>
  );
}

// ─── Root App Content ───────────────────────────────────────
function AppContent() {
  const { loading, user } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-600">
        Carregando sessao...
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <PermissionsProvider>
      <AppInner />
    </PermissionsProvider>
  );
}

export default AppContent;
