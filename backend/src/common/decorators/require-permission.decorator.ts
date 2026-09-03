import { SetMetadata } from '@nestjs/common';

export type PermissionAction =
  | 'view'
  | 'create'
  | 'edit'
  | 'delete'
  | 'authorize'
  | 'cancel'
  | 'configure';

export const REQUIRED_PERMISSION = 'required_permission';

export const RequirePermission = (pageKey: string, action: PermissionAction) =>
  SetMetadata(REQUIRED_PERMISSION, { pageKey, action });
