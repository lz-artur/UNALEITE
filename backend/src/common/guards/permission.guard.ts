import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';
import {
  REQUIRED_PERMISSION,
  type PermissionAction,
} from '../decorators/require-permission.decorator';
import { UsersService } from '../../users/users.service';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement = this.reflector.getAllAndOverride<{
      pageKey: string;
      action: PermissionAction;
    }>(REQUIRED_PERMISSION, [context.getHandler(), context.getClass()]);

    if (!requirement) return true;

    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
    }>();
    if (!request.user) throw new ForbiddenException('Usuário não autenticado.');

    const appUser = await this.usersService.ensureAppUser(request.user);
    if (appUser.role === 'admin') return true;

    const permissions = await this.usersService.getPermissions(appUser.id);
    const permission = permissions.find((item) => item.page_key === requirement.pageKey);
    const field = `can_${requirement.action}` as keyof NonNullable<typeof permission>;

    if (!permission || permission[field] !== true) {
      throw new ForbiddenException('Você não possui permissão para esta operação.');
    }

    return true;
  }
}
