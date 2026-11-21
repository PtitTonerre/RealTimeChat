import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';

import { PrismaService } from '../prisma/prisma.service.js';
import { ChatGateway } from './chat.gateway.js';
import { ChatService } from './chat.service.js';

function createMockClient() {
  const send = vi.fn();

  const client = {
    send,
    readyState: WebSocket.OPEN,
  } as unknown as WebSocket;

  return { client, send };
}

function createMockDatabase() {
  return {
    room: {
      upsert: vi.fn().mockResolvedValue({ id: 'room-1' }),
    },
    message: {
      create: vi.fn().mockImplementation(
        async ({
          data,
        }: {
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
          sentAt: new Date('2026-11-21T12:00:00.000Z'),
        }),
      ),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

describe('ChatGateway', () => {
  let gateway: ChatGateway;

  beforeEach(async () => {
    const db = createMockDatabase();

    const module = await Test.createTestingModule({
      providers: [
        ChatGateway,
        ChatService,
        {
          provide: PrismaService,
          useValue: db,
        },
      ],
    }).compile();

    gateway = module.get(ChatGateway);
  });

  it('welcomes clients and sends their history', async () => {
    const { client, send } = createMockClient();

    await gateway.handleConnection(client);

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

    expect(events).toContainEqual({
      event: 'chat.history',
      data: {
        room: 'general',
        messages: [],
      },
    });
  });

  it('sends history when joining a room', async () => {
    const { client, send } = createMockClient();

    await gateway.handleConnection(client);
    send.mockClear();

    await gateway.joinRoom(client, 'gaming');

    expect(send).toHaveBeenCalledWith(
      JSON.stringify({
        event: 'chat.joined',
        data: { room: 'gaming' },
      }),
    );

    expect(send).toHaveBeenCalledWith(
      JSON.stringify({
        event: 'chat.history',
        data: { room: 'gaming', messages: [] },
      }),
    );
  });

  it('updates usernames', async () => {
    const { client, send } = createMockClient();

    await gateway.handleConnection(client);
    send.mockClear();

    gateway.setUsername(client, 'Alice');

    expect(send).toHaveBeenCalledWith(
      expect.stringContaining('"username":"Alice"'),
    );
  });

  it('rejects duplicate usernames regardless of case', async () => {
    const first = createMockClient();
    const second = createMockClient();

    await gateway.handleConnection(first.client);
    await gateway.handleConnection(second.client);

    gateway.setUsername(first.client, 'Alice');
    second.send.mockClear();

    gateway.setUsername(second.client, 'ALICE');

    expect(second.send).toHaveBeenCalledWith(
      JSON.stringify({
        event: 'chat.error',
        data: { message: 'Username already in use' },
      }),
    );
  });

  it('broadcasts saved messages to the room', async () => {
    const first = createMockClient();
    const second = createMockClient();

    await gateway.handleConnection(first.client);
    await gateway.handleConnection(second.client);

    gateway.setUsername(first.client, 'Alice');

    first.send.mockClear();
    second.send.mockClear();

    await gateway.handleMessage(first.client, 'Hello!');

    const received = JSON.parse(
      first.send.mock.calls[0][0] as string,
    );

    expect(received).toMatchObject({
      event: 'chat.message',
      data: {
        id: 'message-1',
        room: 'general',
        content: 'Hello!',
        sender: {
          username: 'Alice',
        },
        sentAt: '2026-11-21T12:00:00.000Z',
      },
    });

    expect(second.send).toHaveBeenCalledWith(
      first.send.mock.calls[0][0],
    );
  });

  it('isolates messages between rooms', async () => {
    const first = createMockClient();
    const second = createMockClient();

    await gateway.handleConnection(first.client);
    await gateway.handleConnection(second.client);
    await gateway.joinRoom(second.client, 'gaming');

    first.send.mockClear();
    second.send.mockClear();

    await gateway.handleMessage(first.client, 'Hello!');

    expect(first.send).toHaveBeenCalledOnce();
    expect(second.send).not.toHaveBeenCalled();
  });

  it('rejects empty messages', async () => {
    const { client, send } = createMockClient();

    await gateway.handleConnection(client);
    send.mockClear();

    await gateway.handleMessage(client, '   ');

    expect(send).not.toHaveBeenCalled();
  });

  it('stops broadcasting to disconnected clients', async () => {
    const first = createMockClient();
    const second = createMockClient();

    await gateway.handleConnection(first.client);
    await gateway.handleConnection(second.client);

    first.send.mockClear();
    second.send.mockClear();

    gateway.handleDisconnect(second.client);
    await gateway.handleMessage(first.client, 'Hello!');

    expect(first.send).toHaveBeenCalledOnce();
    expect(second.send).not.toHaveBeenCalled();
  });
});
