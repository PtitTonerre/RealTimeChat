
import { ConflictException } from '@nestjs/common';
import argon2 from 'argon2';
import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';
import { SessionService } from './session.service.js';
import { UsersService } from './users.service.js';

describe('AuthService', () => {
  const input = {
    username: 'Alice',
    email: 'alice@example.com',
    password: 'ExamplePassword123!',
  };

  function setup() {
    const db = {
      user: {
        create: vi.fn().mockResolvedValue({
          id: 'user-1',
          username: 'Alice',
          email: 'alice@example.com',
          createdAt: new Date('2026-11-22T10:00:00.000Z'),
        }),
      },
    };

    const prisma = db as unknown as PrismaService;

    const service = new AuthService(
      new UsersService(prisma),
      new SessionService(prisma),
    );

    return { service, db };
  }

  it('should hash the password before saving', async () => {
    const { service, db } = setup();

    const result = await service.register(input);

    const savedData = db.user.create.mock.calls[0][0].data;

    expect(savedData.usernameKey).toBe('alice');
    expect(savedData.emailKey).toBe('alice@example.com');
    expect(savedData.passwordHash).not.toBe(input.password);

    expect(
      await argon2.verify(savedData.passwordHash, input.password),
    ).toBe(true);

    expect(result).not.toHaveProperty('passwordHash');
  });

  it('should reject duplicate accounts', async () => {
    const { service, db } = setup();

    db.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        {
          code: 'P2002',
          clientVersion: '7.10.1',
        },
      ),
    );

    await expect(
      service.register(input),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
