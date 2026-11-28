import {
  type ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

import { describe, expect, it, vi } from 'vitest';
import type { AuthService } from '../../src/auth/auth.service.js';

import {
  SessionGuard,
  type AuthenticatedRequest,
} from '../../src/auth/session.guard.js';

function setup(token?: string) {
  const auth = {
    getAuthenticatedUser: vi.fn(),
  };

  const guard = new SessionGuard(
    auth as unknown as AuthService,
  );

  const request = {
    cookies: token ? { rtc_session: token } : {},
  } as AuthenticatedRequest;

  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;

  return { auth, guard, request, context };
}

describe('SessionGuard', () => {
  it('allows authenticated users', async () => {
    const { auth, guard, request, context } = setup('valid-token');

    const user = {
      id: 'user-1',
      username: 'Alice',
      email: 'alice@example.com',
    };

    auth.getAuthenticatedUser.mockResolvedValue(user);

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(auth.getAuthenticatedUser)
      .toHaveBeenCalledWith('valid-token');

    expect(request.authUser).toEqual(user);
  });

  it('rejects requests without a cookie', async () => {
    const { auth, guard, context } = setup();

    auth.getAuthenticatedUser.mockResolvedValue(null);

    await expect(
      guard.canActivate(context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects invalid sessions', async () => {
    const { auth, guard, context } = setup('invalid-token');

    auth.getAuthenticatedUser.mockResolvedValue(null);

    await expect(
      guard.canActivate(context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
