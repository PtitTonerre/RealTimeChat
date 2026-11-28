import { Test } from '@nestjs/testing';
import type { IncomingMessage } from 'node:http';
import { Subject } from 'rxjs';
import { vi } from 'vitest';
import { WebSocket } from 'ws';
import { AuthService } from '../../src/auth/auth.service.js';
import { DirectMessageEventsService } from '../../src/direct-messages/direct-message-events.service.js';
import { DirectMessagesService } from '../../src/direct-messages/direct-messages.service.js';
import type { DirectMessageSavedEvent } from '../../src/direct-messages/direct-messages.service.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { ChatConnectionsService } from '../../src/chat/chat-connections.service.js';
import { ChatGateway } from '../../src/chat/chat.gateway.js';
import { ChatService } from '../../src/chat/chat.service.js';

export const alice = {
  id: 'user-1',
  username: 'Alice',
  email: 'alice@example.com',
};

export const bob = {
  id: 'user-2',
  username: 'Bob',
  email: 'bob@example.com',
};

export const charlie = {
  id: 'user-3',
  username: 'Charlie',
  email: 'charlie@example.com',
};

export function mockClient() {
  const send = vi.fn();
  const close = vi.fn();

  const client = {
    send,
    close,
    readyState: WebSocket.OPEN,
  } as unknown as WebSocket;

  return { client, send, close };
}

export function mockRequest(
  token?: string,
  origin = 'http://localhost:5173',
): IncomingMessage {
  return {
    headers: {
      origin,
      ...(token
        ? { cookie: `rtc_session=${token}` }
        : {}),
    },
  } as IncomingMessage;
}

export function events(
  socket: ReturnType<typeof mockClient>,
) {
  return socket.send.mock.calls.map(([message]) =>
    JSON.parse(message as string) as {
      event: string;
      data: unknown;
    },
  );
}

export async function connect(
  gateway: ChatGateway,
  token?: string,
) {
  const socket = mockClient();

  await gateway.handleConnection(
    socket.client,
    mockRequest(token),
  );

  return socket;
}

export async function createGatewayFixture() {
  const db = {
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    room: {
      upsert: vi.fn().mockResolvedValue({
        id: 'room-1',
      }),
    },
    message: {
      findMany: vi.fn().mockResolvedValue([]),
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
          sentAt: new Date(
            '2026-11-24T12:00:00.000Z',
          ),
        }),
      ),
    },
  };

  const auth = {
    getAuthenticatedUser: vi.fn().mockResolvedValue(null),
  };

  const savedMessages =
    new Subject<DirectMessageSavedEvent>();

  const directMessages = {
    getParticipantIds: vi.fn(),
    sendMessage: vi.fn(),
    savedMessages$: savedMessages.asObservable(),
  };

  const module = await Test.createTestingModule({
    providers: [
      ChatGateway,
      ChatService,
      ChatConnectionsService,
      DirectMessageEventsService,
      {
        provide: PrismaService,
        useValue: db,
      },
      {
        provide: AuthService,
        useValue: auth,
      },
      {
        provide: DirectMessagesService,
        useValue: directMessages,
      },
    ],
  }).compile();

  return {
    gateway: module.get(ChatGateway),
    db,
    auth,
    directMessages,
    savedMessages,
    async close() {
      await module.close();
      savedMessages.complete();
    },
  };
}
