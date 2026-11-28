import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type { PrismaService } from '../../src/prisma/prisma.service.js';
import { DirectMessagesService } from '../../src/direct-messages/direct-messages.service.js';

describe('DirectMessagesService', () => {
  let service: DirectMessagesService;

  const db = {
    user: {
      findUnique: vi.fn(),
    },
    directConversation: {
      findFirst: vi.fn(),
      upsert: vi.fn(),
    },
    directMessage: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    service = new DirectMessagesService(
      db as unknown as PrismaService,
    );
  });


  it('returns 30 messages and a cursor for older ones', async () => {
    db.directConversation.findFirst.mockResolvedValue({
      id: 'conversation-1',
      userAId: 'user-1',
      userBId: 'user-2',
    });

    const rows = Array.from({ length: 31 }, (_, index) => ({
      id: `message-${31 - index}`,
      content: `Message ${31 - index}`,
    }));

    db.directMessage.findMany.mockResolvedValue(rows);

    const result = await service.getMessages(
      'user-1',
      'conversation-1',
    );

    expect(result.messages).toHaveLength(30);
    expect(result.messages[0].id).toBe('message-2');
    expect(result.messages[29].id).toBe('message-31');
    expect(result.nextCursor).toBe('message-2');

    expect(db.directMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 31,
        orderBy: [
          { sentAt: 'desc' },
          { id: 'desc' },
        ],
      }),
    );
  });

  it('rejects a cursor from another conversation', async () => {
    db.directConversation.findFirst.mockResolvedValue({
      id: 'conversation-1',
      userAId: 'user-1',
      userBId: 'user-2',
    });

    db.directMessage.findFirst.mockResolvedValue(null);

    await expect(
      service.getMessages(
        'user-1',
        'conversation-1',
        'invalid-cursor',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(db.directMessage.findMany).not.toHaveBeenCalled();
  });

  it('prevents messaging yourself', async () => {
    await expect(
      service.createConversation('user-1', 'user-1'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(db.directConversation.upsert).not.toHaveBeenCalled();
  });

  it('uses the same conversation for both directions', async () => {
    db.user.findUnique.mockResolvedValue({
      id: 'user-2',
      username: 'Bob',
    });

    db.directConversation.upsert.mockResolvedValue({
      id: 'conversation-1',
      createdAt: new Date(),
    });

    await service.createConversation('user-2', 'user-1');

    expect(db.directConversation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userAId_userBId: {
            userAId: 'user-1',
            userBId: 'user-2',
          },
        },
      }),
    );
  });

  it('prevents outsiders from reading messages', async () => {
    db.directConversation.findFirst.mockResolvedValue(null);

    await expect(
      service.getMessages('outsider', 'conversation-1'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(db.directMessage.findMany).not.toHaveBeenCalled();
  });

  it('prevents outsiders from sending messages', async () => {
    db.directConversation.findFirst.mockResolvedValue(null);

    await expect(
      service.sendMessage(
        'outsider',
        'conversation-1',
        'Hello!',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(db.directMessage.create).not.toHaveBeenCalled();
  });

  it('allows a participant to send a message', async () => {
    db.directConversation.findFirst.mockResolvedValue({
      id: 'conversation-1',
      userAId: 'user-1',
      userBId: 'user-2',
    });

    db.directMessage.create.mockResolvedValue({
      id: 'message-1',
      content: 'Hello!',
    });

    await service.sendMessage(
      'user-1',
      'conversation-1',
      'Hello!',
    );

    expect(db.directMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          conversationId: 'conversation-1',
          senderId: 'user-1',
          content: 'Hello!',
        },
      }),
    );
  });
});
