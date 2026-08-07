import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { fetchMyProfile, type UserWithPermissions } from '../services/usersApi';
import { useAuth } from './AuthContext';

type PermissionAction = 'view' | 'create' | 'edit' | 'delete';

interface PermissionsContextValue {
  /** The full user profile from app_users */
  profile: UserWithPermissions | null;
  /** 'admin' | 'operacional' */
  role: 'admin' | 'operacional' | null;
  /** Whether the current user is an admin */
  isAdmin: boolean;
  /** Loading state */
  loading: boolean;
  /** Error message if profile fetch failed */
  error: string | null;
  /**
   * Check if the user has a specific permission on a page.
   * Admins always return true.
   */
  hasPermission: (pageKey: string, action: PermissionAction) => boolean;
  /**
   * Check if the user can at least view a page.
   * Admins always return true.
   */
  canViewPage: (pageKey: string) => boolean;
  /** Refresh the profile/permissions from backend */
  refresh: () => Promise<void>;
}

const PermissionsContext = createContext<PermissionsContextValue | undefined>(undefined);

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserWithPermissions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await fetchMyProfile();
      setProfile(data);
    } catch (err) {
      console.error('Failed to load user profile:', err);
      setError(err instanceof Error ? err.message : 'Failed to load profile');
      // If profile fetch fails, allow the user to continue as if they're admin
      // (graceful degradation for first-time setup before migration is applied)
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const value = useMemo<PermissionsContextValue>(() => {
    const role = profile?.role ?? null;
    const isAdmin = role === 'admin';

    // Build a permissions lookup map
    const permMap = new Map<string, {
      can_view: boolean;
      can_create: boolean;
      can_edit: boolean;
      can_delete: boolean;
    }>();

    if (profile?.permissions) {
      for (const p of profile.permissions) {
        permMap.set(p.page_key, {
          can_view: p.can_view,
          can_create: p.can_create,
          can_edit: p.can_edit,
          can_delete: p.can_delete,
        });
      }
    }

    function hasPermission(pageKey: string, action: PermissionAction): boolean {
      // Admins can do everything
      if (isAdmin) return true;
      // If profile hasn't loaded yet, deny by default (except for graceful degradation)
      if (!profile) return true; // graceful degradation
      const perm = permMap.get(pageKey);
      if (!perm) return false;
      switch (action) {
        case 'view': return perm.can_view;
        case 'create': return perm.can_create;
        case 'edit': return perm.can_edit;
        case 'delete': return perm.can_delete;
        default: return false;
      }
    }

    function canViewPage(pageKey: string): boolean {
      return hasPermission(pageKey, 'view');
    }

    return {
      profile,
      role,
      isAdmin,
      loading,
      error,
      hasPermission,
      canViewPage,
      refresh: loadProfile,
    };
  }, [profile, loading, error, loadProfile]);

  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  const context = useContext(PermissionsContext);

  if (!context) {
    throw new Error('usePermissions must be used inside PermissionsProvider');
  }

  return context;
}
