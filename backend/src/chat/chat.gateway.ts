import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';

import { WebSocket } from 'ws';
import { ChatService, type ChatRoom } from './chat.service.js';

@WebSocketGateway({ path: '/ws' })
export class ChatGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly clients = new Map<WebSocket, ChatRoom>();

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
    this.clients.set(client, 'general');

    this.send(client, 'connected', 'Welcome to Real-Time Chat!');

    this.send(client, 'chat.joined', {
      room: 'general',
    });

    this.sendHistory(client, 'general');
  }

  handleDisconnect(client: WebSocket): void {
    this.clients.delete(client);
  }

  @SubscribeMessage('chat.join')
  joinRoom(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() room: unknown,
  ): void {
    if (!this.clients.has(client)) {
      return;
    }

    const newRoom = this.chatService.parseRoom(room);

    if (!newRoom) {
      this.send(client, 'chat.error', {
        message: 'Unknown room',
      });
      return;
    }

    this.clients.set(client, newRoom);

    this.send(client, 'chat.joined', {
      room: newRoom,
    });

    this.sendHistory(client, newRoom);
  }

  @SubscribeMessage('chat.message')
  handleMessage(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() content: unknown,
  ): void {
    const senderRoom = this.clients.get(client);

    if (!senderRoom) {
      return;
    }

    const message = this.chatService.createMessage(content);

    if (!message) {
      return;
    }

    const savedMessage = this.chatService.saveMessage(
      senderRoom,
      message,
    );

    for (const [connection, room] of this.clients) {
      if (room === senderRoom) {
        this.send(connection, 'chat.message', savedMessage);
      }
    }
  }
}
