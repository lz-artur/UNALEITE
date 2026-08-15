import { useCallback, useEffect, useState } from 'react';
import {
  Users,
  Shield,
  ShieldCheck,
  UserPlus,
  Pencil,
  Save,
  X,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  Plus,
  Edit3,
  Trash2,
  Search,
  Loader2,
  Key,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchUsers,
  fetchUserById,
  updateUser,
  updateUserPassword,
  createUser,
  updateUserPermissions,
  type AppUser,
  type UserWithPermissions,
} from '../services/usersApi';

// ─── Page definitions ───────────────────────────────────────
const PAGE_DEFINITIONS = [
  { key: 'dashboard', label: 'Dashboard', actions: ['view'] },
  { key: 'recepcao', label: 'Recepção de Leite', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'analise', label: 'Análise Laboratorial', actions: ['view', 'create', 'edit'] },
  { key: 'lotes', label: 'Lotes e Estoque', actions: ['view', 'edit'] },
  { key: 'producao', label: 'Produção', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'custos', label: 'Relatórios', actions: ['view'] },
  { key: 'comercial', label: 'Comercial', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'compras', label: 'Compras', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'contas-receber', label: 'Contas a Receber', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'contas-pagar', label: 'Contas a Pagar', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'folha-leite', label: 'Folha do Leite', actions: ['view', 'create'] },
  { key: 'dre', label: 'DRE Gerencial', actions: ['view'] },
  { key: 'cadastros', label: 'Cadastros', actions: ['view', 'create', 'edit', 'delete'] },
] as const;

type ActionKey = 'view' | 'create' | 'edit' | 'delete';

const ACTION_LABELS: Record<ActionKey, { label: string; icon: typeof Eye }> = {
  view: { label: 'Ver', icon: Eye },
  create: { label: 'Criar', icon: Plus },
  edit: { label: 'Editar', icon: Edit3 },
  delete: { label: 'Excluir', icon: Trash2 },
};

interface PermissionRow {
  page_key: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

function buildDefaultPermissions(): PermissionRow[] {
  return PAGE_DEFINITIONS.map((p) => ({
    page_key: p.key,
    can_view: false,
    can_create: false,
    can_edit: false,
    can_delete: false,
  }));
}

function mergePermissions(existing: PermissionRow[]): PermissionRow[] {
  const map = new Map(existing.map((p) => [p.page_key, p]));
  return PAGE_DEFINITIONS.map((def) => {
    const ex = map.get(def.key);
    return ex ?? {
      page_key: def.key,
      can_view: false,
      can_create: false,
      can_edit: false,
      can_delete: false,
    };
  });
}

// ─── Main Component ─────────────────────────────────────────
export default function GestaoUsuarios() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Modal states
  const [editingUser, setEditingUser] = useState<UserWithPermissions | null>(null);
  const [editPermissions, setEditPermissions] = useState<PermissionRow[]>([]);
  const [editRole, setEditRole] = useState<'admin' | 'operacional'>('operacional');
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editActive, setEditActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPermModal, setShowPermModal] = useState(false);

  // Password Reset states
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordUser, setPasswordUser] = useState<AppUser | null>(null);
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);

  // Create user modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'operacional'>('operacional');
  const [creating, setCreating] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchUsers();
      setUsers(data);
    } catch (err) {
      toast.error('Erro ao carregar usuários');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const handleOpenPermissions = async (userId: string) => {
    try {
      const userDetail = await fetchUserById(userId);
      setEditingUser(userDetail);
      setEditRole(userDetail.role);
      setEditDisplayName(userDetail.display_name ?? '');
      setEditActive(userDetail.active);
      setEditPermissions(mergePermissions(userDetail.permissions as PermissionRow[]));
      setShowPermModal(true);
    } catch (err) {
      toast.error('Erro ao carregar detalhes do usuário');
      console.error(err);
    }
  };

  const handleSavePermissions = async () => {
    if (!editingUser) return;
    setSaving(true);
    try {
      // Update user fields
      await updateUser(editingUser.id, {
        role: editRole,
        display_name: editDisplayName,
        active: editActive,
      });

      // Update permissions (only for operacional)
      if (editRole === 'operacional') {
        await updateUserPermissions(editingUser.id, editPermissions);
      }

      toast.success('Permissões salvas com sucesso!');
      setShowPermModal(false);
      setEditingUser(null);
      void loadUsers();
    } catch (err) {
      toast.error('Erro ao salvar permissões');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateUser = async () => {
    if (!newEmail || !newPassword) {
      toast.error('Email e senha são obrigatórios');
      return;
    }
    setCreating(true);
    try {
      await createUser({
        email: newEmail,
        password: newPassword,
        display_name: newDisplayName || undefined,
        role: newRole,
      });
      toast.success('Usuário criado com sucesso!');
      setShowCreateModal(false);
      setNewEmail('');
      setNewPassword('');
      setNewDisplayName('');
      setNewRole('operacional');
      void loadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao criar usuário');
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  const handleResetPassword = async () => {
    if (!passwordUser) return;
    if (!resetNewPassword || !resetConfirmPassword) {
      toast.error('Preencha os dois campos de senha');
      return;
    }
    if (resetNewPassword !== resetConfirmPassword) {
      toast.error('As senhas não coincidem');
      return;
    }
    if (resetNewPassword.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres');
      return;
    }

    setResettingPassword(true);
    try {
      await updateUserPassword(passwordUser.id, resetNewPassword);
      toast.success('Senha atualizada com sucesso!');
      setShowPasswordModal(false);
      setPasswordUser(null);
      setResetNewPassword('');
      setResetConfirmPassword('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao atualizar senha');
      console.error(err);
    } finally {
      setResettingPassword(false);
    }
  };

  const togglePermission = (pageKey: string, action: ActionKey) => {
    setEditPermissions((prev) =>
      prev.map((p) => {
        if (p.page_key !== pageKey) return p;
        const field = `can_${action}` as keyof PermissionRow;
        return { ...p, [field]: !p[field] };
      }),
    );
  };

  const toggleAllForPage = (pageKey: string, value: boolean) => {
    const pageDef = PAGE_DEFINITIONS.find((d) => d.key === pageKey);
    if (!pageDef) return;
    setEditPermissions((prev) =>
      prev.map((p) => {
        if (p.page_key !== pageKey) return p;
        const updated = { ...p };
        for (const action of pageDef.actions) {
          (updated as any)[`can_${action}`] = value;
        }
        return updated;
      }),
    );
  };

  const toggleAll = (value: boolean) => {
    setEditPermissions(
      PAGE_DEFINITIONS.map((def) => ({
        page_key: def.key,
        can_view: value && def.actions.includes('view'),
        can_create: value && (def.actions as readonly string[]).includes('create'),
        can_edit: value && (def.actions as readonly string[]).includes('edit'),
        can_delete: value && (def.actions as readonly string[]).includes('delete'),
      })),
    );
  };

  const filteredUsers = users.filter(
    (u) =>
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.display_name ?? '').toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-200">
            <Users className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Gestão de Usuários</h1>
            <p className="text-sm text-gray-500">Gerencie usuários e permissões do sistema</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-violet-200 transition-all hover:shadow-lg hover:shadow-violet-300 hover:-translate-y-0.5 active:translate-y-0"
        >
          <UserPlus className="h-4 w-4" />
          Novo Usuário
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar por nome ou email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-11 pr-4 text-sm text-gray-900 outline-none transition-colors focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
        />
      </div>

      {/* Users Table */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Users className="mb-3 h-12 w-12" />
            <p className="text-lg font-medium">Nenhum usuário encontrado</p>
            <p className="text-sm">Crie um novo usuário para começar</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/80">
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Usuário
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Email
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Role
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Status
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredUsers.map((u) => (
                  <tr
                    key={u.id}
                    className="transition-colors hover:bg-violet-50/40"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-violet-100 to-purple-100 text-sm font-bold text-violet-700">
                          {(u.display_name ?? u.email)[0]?.toUpperCase() ?? '?'}
                        </div>
                        <span className="font-medium text-gray-900">
                          {u.display_name ?? u.email.split('@')[0]}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{u.email}</td>
                    <td className="px-6 py-4 text-center">
                      {u.role === 'admin' ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 px-3 py-1 text-xs font-semibold text-amber-700">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          Admin
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-700">
                          <Shield className="h-3.5 w-3.5" />
                          Operacional
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {u.active ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-700">
                          <Check className="h-3 w-3" />
                          Ativo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-3 py-1 text-xs font-semibold text-red-600">
                          <X className="h-3 w-3" />
                          Inativo
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => {
                            setPasswordUser(u);
                            setShowPasswordModal(true);
                            setResetNewPassword('');
                            setResetConfirmPassword('');
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition-all hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700"
                        >
                          <Key className="h-3.5 w-3.5" />
                          Senha
                        </button>
                        <button
                          onClick={() => void handleOpenPermissions(u.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition-all hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Editar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── Permissions Modal ──────────────────────────────────── */}
      {showPermModal && editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="mx-4 flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  Editar Permissões
                </h2>
                <p className="text-sm text-gray-500">
                  {editingUser.display_name ?? editingUser.email}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowPermModal(false);
                  setEditingUser(null);
                }}
                className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
              {/* User fields */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                  <input
                    type="text"
                    value={editDisplayName}
                    onChange={(e) => setEditDisplayName(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as 'admin' | 'operacional')}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                  >
                    <option value="admin">Admin</option>
                    <option value="operacional">Operacional</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm transition-colors hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={editActive}
                      onChange={(e) => setEditActive(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                    />
                    <span className="font-medium text-gray-700">Ativo</span>
                  </label>
                </div>
              </div>

              {/* Permissions grid */}
              {editRole === 'operacional' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-800">Permissões por Tela</h3>
                    <div className="flex gap-2">
                      <button
                        onClick={() => toggleAll(true)}
                        className="rounded-lg bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-100"
                      >
                        Marcar Tudo
                      </button>
                      <button
                        onClick={() => toggleAll(false)}
                        className="rounded-lg bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100"
                      >
                        Desmarcar Tudo
                      </button>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-xl border border-gray-200">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50/80 border-b border-gray-200">
                          <th className="px-4 py-3 text-left font-semibold text-gray-600">
                            Módulo
                          </th>
                          {Object.entries(ACTION_LABELS).map(([key, { label, icon: Icon }]) => (
                            <th
                              key={key}
                              className="px-3 py-3 text-center font-semibold text-gray-600"
                            >
                              <div className="flex flex-col items-center gap-1">
                                <Icon className="h-3.5 w-3.5" />
                                <span className="text-[11px]">{label}</span>
                              </div>
                            </th>
                          ))}
                          <th className="px-3 py-3 text-center font-semibold text-gray-600">
                            <span className="text-[11px]">Tudo</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {PAGE_DEFINITIONS.map((pageDef) => {
                          const perm = editPermissions.find(
                            (p) => p.page_key === pageDef.key,
                          );
                          const allChecked = pageDef.actions.every((a) =>
                            perm ? perm[`can_${a}` as keyof PermissionRow] : false,
                          );

                          return (
                            <tr
                              key={pageDef.key}
                              className="transition-colors hover:bg-violet-50/30"
                            >
                              <td className="px-4 py-3 font-medium text-gray-800">
                                {pageDef.label}
                              </td>
                              {(Object.keys(ACTION_LABELS) as ActionKey[]).map((action) => {
                                const available = (pageDef.actions as readonly string[]).includes(action);
                                const checked = perm
                                  ? !!perm[`can_${action}` as keyof PermissionRow]
                                  : false;

                                return (
                                  <td key={action} className="px-3 py-3 text-center">
                                    {available ? (
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => togglePermission(pageDef.key, action)}
                                        className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500 cursor-pointer"
                                      />
                                    ) : (
                                      <span className="text-gray-300">—</span>
                                    )}
                                  </td>
                                );
                              })}
                              <td className="px-3 py-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={allChecked}
                                  onChange={(e) =>
                                    toggleAllForPage(pageDef.key, e.target.checked)
                                  }
                                  className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500 cursor-pointer"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {editRole === 'admin' && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4" />
                    <span className="font-medium">
                      Administradores têm acesso total a todas as telas e funcionalidades.
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
              <button
                onClick={() => {
                  setShowPermModal(false);
                  setEditingUser(null);
                }}
                className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => void handleSavePermissions()}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Create User Modal ─────────────────────────────────── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-lg rounded-2xl bg-white shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Novo Usuário</h2>
                <p className="text-sm text-gray-500">
                  Crie uma conta de acesso ao sistema
                </p>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="space-y-4 px-6 py-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="usuario@empresa.com"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition-colors focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Senha <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Senha de acesso"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition-colors focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome de exibição
                </label>
                <input
                  type="text"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  placeholder="Nome do usuário"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition-colors focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as 'admin' | 'operacional')}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition-colors focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100"
                >
                  <option value="operacional">Operacional</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              {newRole === 'operacional' && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                  Após criar o usuário, você poderá configurar suas permissões de acesso na listagem.
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
              <button
                onClick={() => setShowCreateModal(false)}
                className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => void handleCreateUser()}
                disabled={creating || !newEmail || !newPassword}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
                Criar Usuário
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Reset Password Modal ─────────────────────────────────── */}
      {showPasswordModal && passwordUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-white shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Recuperar Senha</h2>
                <p className="text-sm text-gray-500">
                  {passwordUser.display_name ?? passwordUser.email}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowPasswordModal(false);
                  setPasswordUser(null);
                  setResetNewPassword('');
                  setResetConfirmPassword('');
                }}
                className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="space-y-4 px-6 py-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nova Senha
                </label>
                <input
                  type="password"
                  value={resetNewPassword}
                  onChange={(e) => setResetNewPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition-colors focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Confirmação de Senha
                </label>
                <input
                  type="password"
                  value={resetConfirmPassword}
                  onChange={(e) => setResetConfirmPassword(e.target.value)}
                  placeholder="Confirme a nova senha"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition-colors focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
              <button
                onClick={() => {
                  setShowPasswordModal(false);
                  setPasswordUser(null);
                  setResetNewPassword('');
                  setResetConfirmPassword('');
                }}
                className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => void handleResetPassword()}
                disabled={resettingPassword || !resetNewPassword || !resetConfirmPassword}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {resettingPassword ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Key className="h-4 w-4" />
                )}
                Salvar Senha
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
