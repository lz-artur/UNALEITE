import { Injectable, UnauthorizedException } from '@nestjs/common';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class AuthService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async verifyToken(token: string): Promise<AuthenticatedUser> {
    const { data, error } = await this.supabaseService.admin.auth.getUser(token);

    if (error || !data.user) {
      throw new UnauthorizedException('Invalid or expired token', {
        cause: error ?? undefined,
      });
    }

    const decoded = jwt.decode(token);
    const claims =
      decoded && typeof decoded === 'object' ? (decoded as JwtPayload) : undefined;
    const id = String(data.user.id ?? claims?.sub ?? claims?.user_id ?? '');

    if (!id) {
      throw new UnauthorizedException('Token is missing subject');
    }

    return {
      id,
      email: data.user.email ?? (typeof claims?.email === 'string' ? claims.email : undefined),
      role:
        typeof claims?.role === 'string'
          ? claims.role
          : typeof data.user.role === 'string'
            ? data.user.role
            : undefined,
      claims: claims ? (claims as Record<string, unknown>) : {},
    };
  }
}
