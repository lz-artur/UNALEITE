import { useState } from 'react';
import { Lock, Milk, UserRound, History, ShieldCheck, TrendingUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function AuthScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);

    try {
      await signIn(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao autenticar');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.18),_transparent_30%),linear-gradient(135deg,#f6f8fc_0%,#eef5f1_42%,#fffaf1_100%)] flex items-center justify-center">
      <div className="w-full min-h-screen grid lg:grid-cols-[1.1fr_0.9fr] bg-white/85 backdrop-blur">
        <section className="p-10 lg:p-20 bg-[linear-gradient(160deg,rgba(30,64,175,0.96)_0%,rgba(29,78,216,0.92)_38%,rgba(8,145,178,0.9)_100%)] text-white relative flex flex-col justify-center">
          <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_20%_20%,white_0,transparent_18%),radial-gradient(circle_at_80%_0%,white_0,transparent_22%),radial-gradient(circle_at_70%_70%,white_0,transparent_25%)]" />
          <div className="relative space-y-10">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center">
                <Milk className="w-8 h-8" />
              </div>
              <div>
                <p className="text-sm uppercase tracking-[0.28em] text-blue-100/90">UNA Laticínios</p>
                <h1 className="text-3xl lg:text-4xl font-black leading-tight">Gestão Industrial Inteligente para Laticínios</h1>
              </div>
            </div>

            <p className="text-blue-50/95 text-lg leading-8 max-w-xl">
              Uma solução completa e integrada para gerenciar a captação, processos produtivos, análises de laboratório, estoque e controle financeiro de ponta a ponta.
            </p>

            <div className="grid sm:grid-cols-3 gap-4">
              {[
                {
                  title: 'Rastreabilidade',
                  description: 'Acompanhe lotes, consumo de insumos e análises no mesmo fluxo operacional.',
                  icon: History,
                },
                {
                  title: 'Qualidade',
                  description: 'Bloqueio automático de não conformidades e histórico detalhado por lote.',
                  icon: ShieldCheck,
                },
                {
                  title: 'Operação',
                  description: 'Dashboards, estoque e financeiro unificados para tomadas de decisão ágeis.',
                  icon: TrendingUp,
                },
              ].map(({ title, description, icon: Icon }) => (
                <div
                  key={title}
                  className="group relative rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 p-5 transition-all duration-300 hover:-translate-y-1.5 hover:bg-white/15 hover:border-white/35 hover:shadow-[0_12px_30px_rgba(30,64,175,0.2)]"
                >
                  <div className="flex flex-col items-start gap-3 mb-4">
                    <div className="p-2 rounded-xl bg-white/10 group-hover:bg-white/20 transition-colors">
                      <Icon className="w-5 h-5 text-white shrink-0" />
                    </div>
                    <p className="font-bold text-white tracking-wide text-base break-words w-full">{title}</p>
                  </div>
                  <p className="text-sm text-blue-100/90 leading-relaxed font-light">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="p-8 lg:p-20 flex items-center">
          <div className="w-full max-w-md mx-auto">
            <div className="space-y-2 mb-8">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-blue-700">
                Acesso ao sistema
              </p>
              <h2 className="text-3xl font-black text-slate-900">
                Entrar na operação
              </h2>
              <p className="text-slate-500 leading-7">
                Digite seu e-mail e senha para acessar a plataforma.
              </p>
            </div>

            <div className="space-y-5">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">E-mail</span>
                <div className="mt-2 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 focus-within:border-blue-500 focus-within:bg-white">
                  <UserRound className="w-5 h-5 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="voce@empresa.com"
                    className="w-full bg-transparent outline-none text-slate-900 placeholder:text-slate-400"
                  />
                </div>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">Senha</span>
                <div className="mt-2 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 focus-within:border-blue-500 focus-within:bg-white">
                  <Lock className="w-5 h-5 text-slate-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Digite sua senha"
                    className="w-full bg-transparent outline-none text-slate-900 placeholder:text-slate-400"
                  />
                </div>
              </label>

              {error ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={submitting || !email || !password}
                className="w-full rounded-2xl bg-slate-900 text-white py-3.5 font-semibold hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? 'Processando...' : 'Entrar'}
              </button>
            </div>

            <div className="mt-6 pt-6 border-t border-slate-200 text-center text-sm text-slate-400">
              Acesso restrito. Solicite suas credenciais ao administrador.
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
