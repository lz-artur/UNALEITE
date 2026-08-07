import { apiRequest } from './api';

export interface AppUser {
  id: string;
  auth_user_id: string;
  email: string;
  display_name: string | null;
  role: 'admin' | 'operacional';
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserPermission {
  id?: string;
  app_user_id: string;
  page_key: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

export interface UserWithPermissions extends AppUser {
  permissions: UserPermission[];
}

export function fetchMyProfile(): Promise<UserWithPermissions> {
  return apiRequest<UserWithPermissions>('/users/me');
}

export function fetchUsers(): Promise<AppUser[]> {
  return apiRequest<AppUser[]>('/users');
}

export function fetchUserById(id: string): Promise<UserWithPermissions> {
  return apiRequest<UserWithPermissions>(`/users/${id}`);
}

export function updateUser(
  id: string,
  data: { role?: string; display_name?: string; active?: boolean },
): Promise<AppUser> {
  return apiRequest<AppUser>(`/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function createUser(payload: {
  email: string;
  password: string;
  display_name?: string;
  role: 'admin' | 'operacional';
}): Promise<AppUser> {
  return apiRequest<AppUser>('/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchUserPermissions(userId: string): Promise<UserPermission[]> {
  return apiRequest<UserPermission[]>(`/users/${userId}/permissions`);
}

export function updateUserPermissions(
  userId: string,
  permissions: Array<{
    page_key: string;
    can_view: boolean;
    can_create: boolean;
    can_edit: boolean;
    can_delete: boolean;
  }>,
): Promise<UserPermission[]> {
  return apiRequest<UserPermission[]>(`/users/${userId}/permissions`, {
    method: 'PUT',
    body: JSON.stringify({ permissions }),
  });
}
