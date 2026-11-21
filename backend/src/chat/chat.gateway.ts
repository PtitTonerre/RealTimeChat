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
  private readonly clients = new Map<WebSocket, ClientSession>();
  private guestNumber = 0;

  constructor(private readonly chatService: ChatService) {}

  private send(client: WebSocket, event: string, data: unknown): void {
    if (client.readyState !== WebSocket.OPEN) {
      return;
    }

    client.send(JSON.stringify({ event, data }));
  }

  private sendHistory(client: WebSocket, room: ChatRoom): void {
    this.send(client, 'chat.history', {
      room,
      messages: this.chatService.getHistory(room),
    });
  }

  handleConnection(client: WebSocket): void {
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
    this.sendHistory(client, 'general');
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
  joinRoom(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() value: unknown,
  ): void {
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
    this.sendHistory(client, room);
  }

  @SubscribeMessage('chat.message')
  handleMessage(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() content: unknown,
  ): void {
    const session = this.clients.get(client);

    if (!session) {
      return;
    }

    const message = this.chatService.createMessage(content);

    if (!message) {
      return;
    }

    const savedMessage = this.chatService.saveMessage(
      session.room,
      message,
      session.sender,
    );

    for (const [connection, otherSession] of this.clients) {
      if (otherSession.room === session.room) {
        this.send(connection, 'chat.message', savedMessage);
      }
    }
  }
}
