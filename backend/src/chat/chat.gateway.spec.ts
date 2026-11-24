import { Test } from '@nestjs/testing';
import type { IncomingMessage } from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { AuthService } from '../auth/auth.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ChatGateway } from './chat.gateway.js';
import { ChatService } from './chat.service.js';

function createMockClient() {
  const send = vi.fn();
  const close = vi.fn();

  const client = {
    send,
    close,
    readyState: WebSocket.OPEN,
  } as unknown as WebSocket;

  return { client, send, close };
}

function createRequest(cookie?: string): IncomingMessage {
  return {
    headers: {
      origin: 'http://localhost:5173',
      cookie,
    },
  } as IncomingMessage;
}

function createMockDatabase() {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    room: {
      upsert: vi.fn().mockResolvedValue({ id: 'room-1' }),
    },
    message: {
      create: vi.fn().mockImplementation(
        async ({ data }: {
          data: {
            content: string;
            senderId: string;
            senderUsername: string;
          };
        }) => ({
          id: 'message-1',
          content: data.content,
          senderId: data.senderId,
          senderUsername: data.senderUsername,
          sentAt: new Date('2026-11-22T12:00:00.000Z'),
        }),
      ),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

describe('ChatGateway', () => {
  let gateway: ChatGateway;
  let db: ReturnType<typeof createMockDatabase>;
  let auth: {
    getAuthenticatedUser: ReturnType<typeof vi.fn>;
  };

  const alice = {
    id: 'user-1',
    username: 'Alice',
    email: 'alice@example.com',
  };

  beforeEach(async () => {
    db = createMockDatabase();

    auth = {
      getAuthenticatedUser: vi.fn().mockResolvedValue(null),
    };

    const module = await Test.createTestingModule({
      providers: [
        ChatGateway,
        ChatService,
        { provide: PrismaService, useValue: db },
        { provide: AuthService, useValue: auth },
      ],
    }).compile();

    gateway = module.get(ChatGateway);
  });

  it('creates a guest without a session', async () => {
    const { client, send } = createMockClient();

    await gateway.handleConnection(client, createRequest());

    const events = send.mock.calls.map(([value]) =>
      JSON.parse(value as string),
    );

    expect(events).toContainEqual({
      event: 'chat.identity',
      data: {
        id: expect.any(String),
        username: 'Guest-1',
      },
    });
  });

  it('uses the authenticated account identity', async () => {
    auth.getAuthenticatedUser.mockResolvedValue(alice);

    const { client, send } = createMockClient();

    await gateway.handleConnection(
      client,
      createRequest('rtc_session=test-token'),
    );

    expect(auth.getAuthenticatedUser)
      .toHaveBeenCalledWith('test-token');

    expect(send).toHaveBeenCalledWith(
      JSON.stringify({
        event: 'chat.identity',
        data: {
          id: 'user-1',
          username: 'Alice',
        },
      }),
    );
  });

  it('rejects another browser origin', async () => {
    const { client, close } = createMockClient();

    const request = {
      headers: { origin: 'https://example.org' },
    } as IncomingMessage;

    await gateway.handleConnection(client, request);

    expect(close).toHaveBeenCalledWith(
      1008,
      'Origin not allowed',
    );
  });

  it('prevents registered users from changing their chat name', async () => {
    auth.getAuthenticatedUser.mockResolvedValue(alice);

    const { client, send } = createMockClient();

    await gateway.handleConnection(
      client,
      createRequest('rtc_session=test-token'),
    );

    send.mockClear();

    await gateway.setUsername(client, 'SomeoneElse');

    expect(send).toHaveBeenCalledWith(
      JSON.stringify({
        event: 'chat.error',
        data: {
          message: 'Account usernames cannot be changed from chat',
        },
      }),
    );
  });

  it('prevents guests from using a registered name', async () => {
    db.user.findUnique.mockResolvedValue({ id: 'user-1' });

    const { client, send } = createMockClient();

    await gateway.handleConnection(client, createRequest());
    send.mockClear();

    await gateway.setUsername(client, 'Alice');

    expect(send).toHaveBeenCalledWith(
      JSON.stringify({
        event: 'chat.error',
        data: {
          message: 'Username is reserved by a registered account',
        },
      }),
    );
  });

  it('broadcasts messages to the current room', async () => {
    const first = createMockClient();
    const second = createMockClient();

    await gateway.handleConnection(first.client, createRequest());
    await gateway.handleConnection(second.client, createRequest());

    first.send.mockClear();
    second.send.mockClear();

    await gateway.handleMessage(first.client, 'Hello!');

    const message = JSON.parse(
      first.send.mock.calls[0][0] as string,
    );

    expect(message).toMatchObject({
      event: 'chat.message',
      data: {
        room: 'general',
        content: 'Hello!',
        sender: { username: 'Guest-1' },
      },
    });

    expect(second.send).toHaveBeenCalledWith(
      first.send.mock.calls[0][0],
    );
  });

  it('links authenticated messages to the account', async () => {
    auth.getAuthenticatedUser.mockResolvedValue(alice);

    const { client } = createMockClient();

    await gateway.handleConnection(
      client,
      createRequest('rtc_session=test-token'),
    );

    await gateway.handleMessage(client, 'Hello!');

    expect(db.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        senderId: 'user-1',
        senderUsername: 'Alice',
        user: {
          connect: { id: 'user-1' },
        },
      }),
    });
  });

  it('keeps rooms isolated', async () => {
    const first = createMockClient();
    const second = createMockClient();

    await gateway.handleConnection(first.client, createRequest());
    await gateway.handleConnection(second.client, createRequest());

    await gateway.joinRoom(second.client, 'gaming');

    first.send.mockClear();
    second.send.mockClear();

    await gateway.handleMessage(first.client, 'Hello general!');

    expect(first.send).toHaveBeenCalledOnce();
    expect(second.send).not.toHaveBeenCalled();
  });

  it('closes a connection after its session is revoked', async () => {
    auth.getAuthenticatedUser
      .mockResolvedValueOnce(alice)
      .mockResolvedValueOnce(null);

    const { client, close } = createMockClient();

    await gateway.handleConnection(
      client,
      createRequest('rtc_session=test-token'),
    );

    await gateway.handleMessage(client, 'Hello!');

    expect(close).toHaveBeenCalledWith(
      1008,
      'Session expired',
    );

    expect(db.message.create).not.toHaveBeenCalled();
  });

  it('stops broadcasting to disconnected clients', async () => {
    const first = createMockClient();
    const second = createMockClient();

    await gateway.handleConnection(first.client, createRequest());
    await gateway.handleConnection(second.client, createRequest());

    first.send.mockClear();
    second.send.mockClear();

    gateway.handleDisconnect(second.client);
    await gateway.handleMessage(first.client, 'Hello!');

    expect(first.send).toHaveBeenCalledOnce();
    expect(second.send).not.toHaveBeenCalled();
  });
});
