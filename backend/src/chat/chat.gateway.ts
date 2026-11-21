import { Logger } from '@nestjs/common';

import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';

import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';

import {
  ChatService,
  type ChatRoom,
  type ChatSender,
} from './chat.service.js';

interface ClientSession {
  room: ChatRoom;
  sender: ChatSender;
}

@WebSocketGateway({ path: '/ws' })
export class ChatGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(ChatGateway.name);
  private readonly clients = new Map<WebSocket, ClientSession>();
  private guestNumber = 0;

  constructor(private readonly chatService: ChatService) {}

  private send(client: WebSocket, event: string, data: unknown): void {
    if (client.readyState !== WebSocket.OPEN) {
      return;
    }

    client.send(JSON.stringify({ event, data }));
  }

  private async sendHistory(
    client: WebSocket,
    room: ChatRoom,
  ): Promise<void> {
    try {
      const messages = await this.chatService.getHistory(room);

      // The client might have changed rooms while the query ran.
      if (this.clients.get(client)?.room !== room) {
        return;
      }

      this.send(client, 'chat.history', {
        room,
        messages,
      });
    } catch (error) {
      this.logger.error('Failed to load chat history', error);

      this.send(client, 'chat.error', {
        message: 'Could not load chat history',
      });
    }
  }

  async handleConnection(client: WebSocket): Promise<void> {
    const sender: ChatSender = {
      id: randomUUID(),
      username: `Guest-${++this.guestNumber}`,
    };

    this.clients.set(client, {
      room: 'general',
      sender,
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
  setUsername(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() value: unknown,
  ): void {
    const session = this.clients.get(client);

    if (!session) {
      return;
    }

    const username = this.chatService.parseUsername(value);

    if (!username) {
      this.send(client, 'chat.error', {
        message: 'Username must contain 2-20 letters, numbers, _ or -',
      });
      return;
    }

    const usernameTaken = [...this.clients.values()].some(
      (other) =>
        other.sender.id !== session.sender.id &&
        other.sender.username.toLowerCase() === username.toLowerCase(),
    );

    if (usernameTaken) {
      this.send(client, 'chat.error', {
        message: 'Username already in use',
      });
      return;
    }

    session.sender = {
      ...session.sender,
      username,
    };

    this.send(client, 'chat.identity', session.sender);
  }

  @SubscribeMessage('chat.join')
  async joinRoom(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() value: unknown,
  ): Promise<void> {
    const session = this.clients.get(client);

    if (!session) {
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

    if (!session) {
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
