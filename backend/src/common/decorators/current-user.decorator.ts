import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthenticatedUser {
  id: string;
  email?: string;
  role?: string;
  claims: Record<string, unknown>;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser | undefined => {
    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    return request.user;
  },
);
