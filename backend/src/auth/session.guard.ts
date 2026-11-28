import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import type { Request } from 'express';
import { AuthService } from './auth.service.js';
import { SESSION_COOKIE } from './session.service.js';
import type { PublicUser } from './auth.types.js';

export type AuthenticatedRequest = Request & {
  authUser: PublicUser;
};

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    const cookie: unknown = request.cookies?.[SESSION_COOKIE];
    const token = typeof cookie === 'string'
      ? cookie
      : undefined;

    const user = await this.auth.getAuthenticatedUser(token);

    if (!user) {
      throw new UnauthorizedException();
    }

    (request as AuthenticatedRequest).authUser = user;

    return true;
  }
}
