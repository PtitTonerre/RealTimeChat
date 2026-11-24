import { Logger } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { randomUUID } from 'node:crypto';
import { parseCookie } from 'cookie';
import { WebSocket } from 'ws';

import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';

import {
  AuthService,
  SESSION_COOKIE,
} from '../auth/auth.service.js';

import {
  ChatService,
  type ChatRoom,
  type ChatSender,
} from './chat.service.js';

interface ClientSession {
  room: ChatRoom;
  sender: ChatSender;
  userId: string | null;
  sessionToken: string | null;
}

@WebSocketGateway({ path: '/ws' })
export class ChatGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(ChatGateway.name);
  private readonly clients = new Map<WebSocket, ClientSession>();
  private guestNumber = 0;

  constructor(
    private readonly chatService: ChatService,
    private readonly authService: AuthService,
  ) {}

  private send(
    client: WebSocket,
    event: string,
    data: unknown,
  ): void {
    if (client.readyState !== WebSocket.OPEN) {
      return;
    }

    client.send(JSON.stringify({ event, data }));
  }

  private async checkSession(
    client: WebSocket,
    session: ClientSession,
  ): Promise<boolean> {
    if (!session.sessionToken) {
      return true;
    }

    try {
      const user = await this.authService.getAuthenticatedUser(
        session.sessionToken,
      );

      if (!user || user.id !== session.userId) {
        this.clients.delete(client);
        client.close(1008, 'Session expired');
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error('Session validation failed', error);
      this.clients.delete(client);
      client.close(1011, 'Authentication unavailable');
      return false;
    }
  }

  private async sendHistory(
    client: WebSocket,
    room: ChatRoom,
  ): Promise<void> {
    try {
      const messages = await this.chatService.getHistory(room);

      if (this.clients.get(client)?.room !== room) {
        return;
      }

      this.send(client, 'chat.history', { room, messages });
    } catch (error) {
      this.logger.error('Failed to load chat history', error);

      this.send(client, 'chat.error', {
        message: 'Could not load chat history',
      });
    }
  }

  async handleConnection(
    client: WebSocket,
    request: IncomingMessage,
  ): Promise<void> {
    // Only accept connections from our local React frontend.
    if (request.headers.origin !== 'http://localhost:5173') {
      client.close(1008, 'Origin not allowed');
      return;
    }

    const cookies = parseCookie(request.headers.cookie ?? '');
    const token = cookies[SESSION_COOKIE];

    let user: Awaited<
      ReturnType<AuthService['getAuthenticatedUser']>
    >;

    try {
      user = await this.authService.getAuthenticatedUser(token);
    } catch (error) {
      this.logger.error('WebSocket authentication failed', error);
      client.close(1011, 'Authentication unavailable');
      return;
    }

    if (client.readyState !== WebSocket.OPEN) {
      return;
    }

    if (token && !user) {
      client.close(1008, 'Invalid session');
      return;
    }

    const sender: ChatSender = user
      ? {
          id: user.id,
          username: user.username,
        }
      : {
          id: randomUUID(),
          username: `Guest-${++this.guestNumber}`,
        };

    this.clients.set(client, {
      room: 'general',
      sender,
      userId: user?.id ?? null,
      sessionToken: user ? token ?? null : null,
    });

    this.send(client, 'connected', 'Welcome to Real-Time Chat!');
    this.send(client, 'chat.identity', sender);
    this.send(client, 'chat.joined', { room: 'general' });

    await this.sendHistory(client, 'general');
  }

  handleDisconnect(client: WebSocket): void {
    this.clients.delete(client);
  }

  @SubscribeMessage('chat.set_username')
  async setUsername(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() value: unknown,
  ): Promise<void> {
    const session = this.clients.get(client);

    if (!session) {
      return;
    }

    if (session.userId) {
      this.send(client, 'chat.error', {
        message: 'Account usernames cannot be changed from chat',
      });
      return;
    }

    const username = this.chatService.parseUsername(value);

    if (!username) {
      this.send(client, 'chat.error', {
        message: 'Username must contain 2-20 letters, numbers, _ or -',
      });
      return;
    }

    try {
      if (await this.chatService.usernameExists(username)) {
        this.send(client, 'chat.error', {
          message: 'Username is reserved by a registered account',
        });
        return;
      }
    } catch (error) {
      this.logger.error('Username validation failed', error);
      this.send(client, 'chat.error', {
        message: 'Could not validate username',
      });
      return;
    }

    if (this.clients.get(client) !== session) {
      return;
    }

    const usernameTaken = [...this.clients.values()].some(
      (other) =>
        other.sender.id !== session.sender.id &&
        other.sender.username.toLowerCase() ===
          username.toLowerCase(),
    );

    if (usernameTaken) {
      this.send(client, 'chat.error', {
        message: 'Username already in use',
      });
      return;
    }

    session.sender = { ...session.sender, username };

    this.send(client, 'chat.identity', session.sender);
  }

  @SubscribeMessage('chat.join')
  async joinRoom(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() value: unknown,
  ): Promise<void> {
    const session = this.clients.get(client);

    if (!session || !(await this.checkSession(client, session))) {
      return;
    }

    if (this.clients.get(client) !== session) {
      return;
    }

    const room = this.chatService.parseRoom(value);

    if (!room) {
      this.send(client, 'chat.error', {
        message: 'Unknown room',
      });
      return;
    }

    session.room = room;

    this.send(client, 'chat.joined', { room });
    await this.sendHistory(client, room);
  }

  @SubscribeMessage('chat.message')
  async handleMessage(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() content: unknown,
  ): Promise<void> {
    const session = this.clients.get(client);

    if (!session || !(await this.checkSession(client, session))) {
      return;
    }

    if (this.clients.get(client) !== session) {
      return;
    }

    const message = this.chatService.createMessage(content);

    if (!message) {
      return;
    }

    const room = session.room;
    const sender = { ...session.sender };

    try {
      const savedMessage = await this.chatService.saveMessage(
        room,
        message,
        sender,
        session.userId,
      );

      for (const [connection, otherSession] of this.clients) {
        if (otherSession.room === room) {
          this.send(connection, 'chat.message', savedMessage);
        }
      }
    } catch (error) {
      this.logger.error('Failed to save chat message', error);

      this.send(client, 'chat.error', {
        message: 'Could not save your message',
      });
    }
  }
}
