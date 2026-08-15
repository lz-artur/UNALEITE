import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';

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

export const ALL_PAGE_KEYS = [
  'dashboard',
  'recepcao',
  'analise',
  'lotes',
  'producao',
  'custos',
  'comercial',
  'compras',
  'contas-receber',
  'contas-pagar',
  'folha-leite',
  'dre',
  'cadastros',
] as const;

@Injectable()
export class UsersService {
  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Auto-create or fetch app_user for a given Supabase auth user.
   * Called on every login to ensure the user exists in app_users.
   */
  async ensureAppUser(authUser: AuthenticatedUser): Promise<AppUser> {
    const sb = this.supabaseService.admin;

    // Try to find existing
    const { data: existing } = await sb
      .from('app_users')
      .select('*')
      .eq('auth_user_id', authUser.id)
      .single();

    if (existing) {
      return existing as AppUser;
    }

    // Auto-create as operacional (admin users are seeded by migration)
    const { data: created, error } = await sb
      .from('app_users')
      .insert({
        auth_user_id: authUser.id,
        email: authUser.email ?? '',
        display_name: authUser.email?.split('@')[0] ?? null,
        role: 'operacional',
        active: true,
      })
      .select('*')
      .single();

    if (error) {
      throw new ConflictException(`Failed to create app user: ${error.message}`);
    }

    return created as AppUser;
  }

  /**
   * Get the current user profile with permissions.
   */
  async getMyProfile(authUser: AuthenticatedUser) {
    const appUser = await this.ensureAppUser(authUser);
    const permissions = await this.getPermissions(appUser.id);

    return {
      ...appUser,
      permissions,
    };
  }

  /**
   * List all app_users (admin only).
   */
  async listUsers(): Promise<AppUser[]> {
    const { data, error } = await this.supabaseService.admin
      .from('app_users')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      throw new BadRequestException(`Failed to list users: ${error.message}`);
    }

    return (data ?? []) as AppUser[];
  }

  /**
   * Get a single user by id with permissions (admin only).
   */
  async getUserById(id: string) {
    const { data: user, error } = await this.supabaseService.admin
      .from('app_users')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !user) {
      throw new NotFoundException(`User ${id} not found`);
    }

    const permissions = await this.getPermissions(id);

    return {
      ...(user as AppUser),
      permissions,
    };
  }

  /**
   * Update user fields (role, display_name, active). Admin only.
   */
  async updateUser(
    id: string,
    payload: { role?: string; display_name?: string; active?: boolean },
  ): Promise<AppUser> {
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (payload.role !== undefined) {
      if (!['admin', 'operacional'].includes(payload.role)) {
        throw new BadRequestException('Role must be "admin" or "operacional"');
      }
      updateData.role = payload.role;
    }

    if (payload.display_name !== undefined) {
      updateData.display_name = payload.display_name;
    }

    if (payload.active !== undefined) {
      updateData.active = payload.active;
    }

    const { data, error } = await this.supabaseService.admin
      .from('app_users')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single();

    if (error || !data) {
      throw new NotFoundException(`User ${id} not found or update failed: ${error?.message}`);
    }

    return data as AppUser;
  }

  /**
   * Create a new user (admin only). Creates the auth user in Supabase first,
   * then the app_user record.
   */
  async createUser(payload: {
    email: string;
    password: string;
    display_name?: string;
    role: 'admin' | 'operacional';
  }): Promise<AppUser> {
    const sb = this.supabaseService.admin;

    // Create auth user in Supabase
    const { data: authData, error: authError } = await sb.auth.admin.createUser({
      email: payload.email,
      password: payload.password,
      email_confirm: true,
    });

    if (authError || !authData.user) {
      throw new ConflictException(
        `Failed to create auth user: ${authError?.message ?? 'Unknown error'}`,
      );
    }

    // Create app_user record
    const { data: appUser, error: appError } = await sb
      .from('app_users')
      .insert({
        auth_user_id: authData.user.id,
        email: payload.email,
        display_name: payload.display_name ?? payload.email.split('@')[0],
        role: payload.role,
        active: true,
      })
      .select('*')
      .single();

    if (appError) {
      // Rollback: delete the auth user if app_user creation fails
      await sb.auth.admin.deleteUser(authData.user.id);
      throw new ConflictException(`Failed to create app user: ${appError.message}`);
    }

    return appUser as AppUser;
  }

  /**
   * Get permissions for a user.
   */
  async getPermissions(appUserId: string): Promise<UserPermission[]> {
    const { data, error } = await this.supabaseService.admin
      .from('user_permissions')
      .select('*')
      .eq('app_user_id', appUserId)
      .order('page_key', { ascending: true });

    if (error) {
      return [];
    }

    return (data ?? []) as UserPermission[];
  }

  /**
   * Batch upsert permissions for a user (admin only).
   * Receives a full list of permissions — replaces all existing ones.
   */
  async setPermissions(
    appUserId: string,
    permissions: Array<{
      page_key: string;
      can_view: boolean;
      can_create: boolean;
      can_edit: boolean;
      can_delete: boolean;
    }>,
  ): Promise<UserPermission[]> {
    const sb = this.supabaseService.admin;

    // Validate user exists
    const { data: user } = await sb
      .from('app_users')
      .select('id')
      .eq('id', appUserId)
      .single();

    if (!user) {
      throw new NotFoundException(`User ${appUserId} not found`);
    }

    // Delete existing permissions
    await sb.from('user_permissions').delete().eq('app_user_id', appUserId);

    if (permissions.length === 0) {
      return [];
    }

    // Insert new permissions
    const rows = permissions.map((p) => ({
      app_user_id: appUserId,
      page_key: p.page_key,
      can_view: p.can_view,
      can_create: p.can_create,
      can_edit: p.can_edit,
      can_delete: p.can_delete,
    }));

    const { data, error } = await sb
      .from('user_permissions')
      .insert(rows)
      .select('*');

    if (error) {
      throw new BadRequestException(`Failed to set permissions: ${error.message}`);
    }

    return (data ?? []) as UserPermission[];
  }

  /**
   * Update a user's password (admin only).
   */
  async updatePassword(id: string, newPassword: string): Promise<{ success: boolean }> {
    const sb = this.supabaseService.admin;

    // Get auth_user_id from app_users
    const { data: user, error: fetchError } = await sb
      .from('app_users')
      .select('auth_user_id')
      .eq('id', id)
      .single();

    if (fetchError || !user) {
      throw new NotFoundException(`User ${id} not found`);
    }

    const { error } = await sb.auth.admin.updateUserById(user.auth_user_id, {
      password: newPassword,
    });

    if (error) {
      throw new BadRequestException(`Failed to update password: ${error.message}`);
    }

    return { success: true };
  }
}
