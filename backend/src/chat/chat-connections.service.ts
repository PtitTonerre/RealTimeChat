import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { parseCookie } from 'cookie';
import { WebSocket } from 'ws';
import { ChatService, type ChatRoom, type ChatSender } from './chat.service.js';
import { AuthService } from '../auth/auth.service.js';
import { SESSION_COOKIE } from '../auth/session.service.js';

export interface ClientSession {
  room: ChatRoom;
  sender: ChatSender;
  userId: string | null;
  sessionToken: string | null;
}

type RenameResult = { sender: ChatSender } | { error: string };

@Injectable()
export class ChatConnectionsService {
  private readonly logger = new Logger(ChatConnectionsService.name);
  private readonly clients = new Map<WebSocket, ClientSession>();
  private guestNumber = 0;

  constructor(
    private readonly auth: AuthService,
    private readonly chat: ChatService,
  ) {}

  private close(client: WebSocket, code: number, reason: string): void {
    this.clients.delete(client);
    client.close(code, reason);
  }

  get(client: WebSocket): ClientSession | undefined {
    return this.clients.get(client);
  }

  disconnect(client: WebSocket): void {
    this.clients.delete(client);
  }

  clientsInRoom(room: ChatRoom): WebSocket[] {
    return [...this.clients]
      .filter(([, session]) => session.room === room)
      .map(([client]) => client);
  }

  clientsForUsers(userIds: string[]): WebSocket[] {
    const allowed = new Set(userIds);

    return [...this.clients]
      .filter(([, session]) =>
        session.userId !== null &&
        allowed.has(session.userId),
      )
      .map(([client]) => client);
  }

  async connect(
    client: WebSocket,
    request: IncomingMessage,
  ): Promise<ClientSession | null> {
    if (request.headers.origin !== 'http://localhost:5173') {
      this.close(client, 1008, 'Origin not allowed');
      return null;
    }

    const token = parseCookie(request.headers.cookie ?? '')[SESSION_COOKIE];
    let user: Awaited<ReturnType<AuthService['getAuthenticatedUser']>>;

    try {
      user = await this.auth.getAuthenticatedUser(token);
    } catch (error) {
      this.logger.error('Authentication failed', error);
      this.close(client, 1011, 'Authentication unavailable');
      return null;
    }

    if (client.readyState !== WebSocket.OPEN) return null;

    if (token && !user) {
      this.close(client, 1008, 'Invalid session');
      return null;
    }

    const sender: ChatSender = user
      ? { id: user.id, username: user.username }
      : { id: randomUUID(), username: `Guest-${++this.guestNumber}` };

    const session: ClientSession = {
      room: 'general',
      sender,
      userId: user?.id ?? null,
      sessionToken: user ? token ?? null : null,
    };

    this.clients.set(client, session);
    return session;
  }

  async authorize(client: WebSocket): Promise<ClientSession | null> {
    const session = this.get(client);
    if (!session) return null;
    if (!session.sessionToken) return session;

    try {
      const user = await this.auth.getAuthenticatedUser(
        session.sessionToken,
      );

      if (!user || user.id !== session.userId) {
        this.close(client, 1008, 'Session expired');
        return null;
      }
    } catch (error) {
      this.logger.error('Session validation failed', error);
      this.close(client, 1011, 'Authentication unavailable');
      return null;
    }

    return this.get(client) === session ? session : null;
  }

  async changeGuestUsername(
    client: WebSocket,
    value: unknown,
  ): Promise<RenameResult | null> {
    const session = this.get(client);
    if (!session) return null;

    if (session.userId) {
      return { error: 'Account usernames cannot be changed from chat' };
    }

    const username = this.chat.parseUsername(value);
    if (!username) {
      return { error: 'Username must contain 2-20 letters, numbers, _ or -' };
    }

    if (await this.chat.usernameExists(username)) {
      return { error: 'Username is reserved by a registered account' };
    }

    if (this.get(client) !== session) return null;

    const taken = [...this.clients.values()].some(
      (other) =>
        other !== session &&
        other.sender.username.toLowerCase() === username.toLowerCase(),
    );

    if (taken) return { error: 'Username already in use' };

    session.sender = { ...session.sender, username };
    return { sender: session.sender };
  }
}
