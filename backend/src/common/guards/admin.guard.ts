import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';
import { UsersService } from '../../users/users.service';

/**
 * Guard that checks if the authenticated user has the 'admin' role.
 * Must be used AFTER SupabaseAuthGuard (which sets request.user).
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly usersService: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
    }>();

    if (!request.user) {
      throw new ForbiddenException('User not authenticated');
    }

    const appUser = await this.usersService.ensureAppUser(request.user);

    if (appUser.role !== 'admin') {
      throw new ForbiddenException(
        'Acesso restrito. Apenas administradores podem acessar este recurso.',
      );
    }

    return true;
  }
}
