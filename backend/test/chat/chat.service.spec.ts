import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../../src/prisma/prisma.service.js';
import { ChatService } from '../../src/chat/chat.service.js';

function createMockDatabase() {
  return {
    room: {
      upsert: vi.fn().mockResolvedValue({
        id: 'room-1',
        name: 'general',
      }),
    },
    message: {
      create: vi.fn().mockResolvedValue({
        id: 'message-1',
        content: 'Hello!',
        senderId: 'user-1',
        senderUsername: 'Alice',
        sentAt: new Date('2026-11-21T12:00:00.000Z'),
      }),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

describe('ChatService', () => {
  let service: ChatService;
  let db: ReturnType<typeof createMockDatabase>;

  const sender = {
    id: 'user-1',
    username: 'Alice',
  };

  beforeEach(() => {
    db = createMockDatabase();
    service = new ChatService(db as unknown as PrismaService);
  });

  it('creates a valid message', () => {
    expect(service.createMessage('Hello!')).toEqual({
      content: 'Hello!',
    });
  });

  it('trims whitespace', () => {
    expect(service.createMessage('  Hello!  ')).toEqual({
      content: 'Hello!',
    });
  });

  it('rejects empty messages', () => {
    expect(service.createMessage('   ')).toBeNull();
  });

  it('rejects non-string messages', () => {
    expect(service.createMessage(42)).toBeNull();
  });

  it('rejects messages over 500 characters', () => {
    expect(service.createMessage('a'.repeat(501))).toBeNull();
  });

  it('accepts valid rooms', () => {
    expect(service.parseRoom(' gaming ')).toBe('gaming');
  });

  it('rejects unknown rooms', () => {
    expect(service.parseRoom('unknown')).toBeNull();
  });

  it('accepts valid usernames', () => {
    expect(service.parseUsername(' Alice_2 ')).toBe('Alice_2');
  });

  it('rejects invalid usernames', () => {
    expect(service.parseUsername('A')).toBeNull();
    expect(service.parseUsername('Alice Bob')).toBeNull();
    expect(service.parseUsername(42)).toBeNull();
  });

  it('saves a message through Prisma', async () => {
    const result = await service.saveMessage(
      'general',
      { content: 'Hello!' },
      sender,
    );

    expect(db.room.upsert).toHaveBeenCalledWith({
      where: { name: 'general' },
      update: {},
      create: { name: 'general' },
    });

    expect(db.message.create).toHaveBeenCalledWith({
      data: {
        content: 'Hello!',
        senderId: 'user-1',
        senderUsername: 'Alice',
        room: {
          connect: { id: 'room-1' },
        },
      },
    });

    expect(result).toEqual({
      id: 'message-1',
      room: 'general',
      content: 'Hello!',
      sender,
      sentAt: '2026-11-21T12:00:00.000Z',
    });
  });

  it('returns history in chronological order', async () => {
    db.message.findMany.mockResolvedValue([
      {
        id: 'new',
        content: 'Second',
        senderId: 'user-1',
        senderUsername: 'Alice',
        sentAt: new Date('2026-11-21T12:01:00.000Z'),
      },
      {
        id: 'old',
        content: 'First',
        senderId: 'user-1',
        senderUsername: 'Alice',
        sentAt: new Date('2026-11-21T12:00:00.000Z'),
      },
    ]);

    const history = await service.getHistory('general');

    expect(history.map((message) => message.content)).toEqual([
      'First',
      'Second',
    ]);
  });

  it('requests only the latest 50 messages', async () => {
    await service.getHistory('general');

    expect(db.message.findMany).toHaveBeenCalledWith({
      where: {
        room: { is: { name: 'general' } },
      },
      orderBy: [
        { sentAt: 'desc' },
        { id: 'desc' },
      ],
      take: 50,
    });
  });
});
