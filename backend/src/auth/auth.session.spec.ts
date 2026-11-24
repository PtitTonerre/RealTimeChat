import { UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import argon2 from 'argon2';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';
import { SessionService } from './session.service.js';
import { UsersService } from './users.service.js';

function setup() {
  const db = {
    user: {
      findUnique: vi.fn(),
    },
    session: {
      create: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };

  const prisma = db as unknown as PrismaService;

  const service = new AuthService(
    new UsersService(prisma),
    new SessionService(prisma),
  );

  return { service, db };
}

describe('AuthService sessions', () => {
  const credentials = {
    email: 'alice@example.com',
    password: 'ExamplePassword123!',
  };

  it('creates a session after successful login', async () => {
    const { service, db } = setup();

    db.user.findUnique.mockResolvedValue({
      id: 'user-1',
      username: 'Alice',
      email: 'alice@example.com',
      passwordHash: await argon2.hash(credentials.password),
    });

    const result = await service.login(credentials);

    expect(result.user).toEqual({
      id: 'user-1',
      username: 'Alice',
      email: 'alice@example.com',
    });

    expect(result.token).toMatch(/^[a-f0-9]{64}$/);

    const tokenHash = createHash('sha256')
      .update(result.token)
      .digest('hex');

    expect(db.session.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        tokenHash,
        expiresAt: expect.any(Date),
      },
    });
  });

  it('rejects an unknown email', async () => {
    const { service, db } = setup();

    db.user.findUnique.mockResolvedValue(null);

    await expect(
      service.login(credentials),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(db.session.create).not.toHaveBeenCalled();
  });

  it('rejects an incorrect password', async () => {
    const { service, db } = setup();

    db.user.findUnique.mockResolvedValue({
      id: 'user-1',
      username: 'Alice',
      email: 'alice@example.com',
      passwordHash: await argon2.hash('CorrectPassword123!'),
    });

    await expect(
      service.login(credentials),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(db.session.create).not.toHaveBeenCalled();
  });

  it('retrieves the user from a valid session', async () => {
    const { service, db } = setup();

    const user = {
      id: 'user-1',
      username: 'Alice',
      email: 'alice@example.com',
    };

    db.session.findUnique.mockResolvedValue({
      user,
      expiresAt: new Date(Date.now() + 60_000),
    });

    expect(
      await service.getAuthenticatedUser('test-token'),
    ).toEqual(user);
  });

  it('rejects an expired session', async () => {
    const { service, db } = setup();

    db.session.findUnique.mockResolvedValue({
      user: {
        id: 'user-1',
        username: 'Alice',
        email: 'alice@example.com',
      },
      expiresAt: new Date(Date.now() - 60_000),
    });

    expect(
      await service.getAuthenticatedUser('expired-token'),
    ).toBeNull();
  });

  it('revokes a session on logout', async () => {
    const { service, db } = setup();

    await service.logout('test-token');

    const tokenHash = createHash('sha256')
      .update('test-token')
      .digest('hex');

    expect(db.session.deleteMany).toHaveBeenCalledWith({
      where: { tokenHash },
    });
  });
});
