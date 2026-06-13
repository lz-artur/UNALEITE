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
import Placeholder from './components/Placeholder';
import Producao from './components/Producao';
import RelatoriosOperacionais from './components/RelatoriosOperacionais';
import RecepcaoLeite from './components/RecepcaoLeite';
import { useAuth } from './context/AuthContext';
import { CadastrosProvider } from './context/CadastrosContext';

function AppContent() {
  const { loading, user } = useAuth();
  const [currentPage, setCurrentPage] = useState('dashboard');

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

  const renderPage = () => {
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
      case 'folha-leite':
        return <FolhaLeite />;
      case 'dre':
        return <DreGerencial />;
      case 'cadastros':
        return <CadastrosBase />;
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

export default AppContent;
