import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../src/prisma/prisma.service.js';
import { UsersService } from '../../src/auth/users.service.js';

describe('UsersService search', () => {
  function setup() {
    const db = {
      user: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    const service = new UsersService(
      db as unknown as PrismaService,
    );

    return { service, db };
  }

  it('searches usernames without including the current user', async () => {
    const { service, db } = setup();

    await service.search('user-1', '  AL  ');

    expect(db.user.findMany).toHaveBeenCalledWith({
      where: {
        id: { not: 'user-1' },
        usernameKey: { contains: 'al' },
      },
      select: {
        id: true,
        username: true,
      },
      orderBy: {
        usernameKey: 'asc',
      },
      take: 20,
    });
  });

  it('ignores searches shorter than two characters', async () => {
    const { service, db } = setup();

    expect(await service.search('user-1', 'a')).toEqual([]);
    expect(db.user.findMany).not.toHaveBeenCalled();
  });
});
