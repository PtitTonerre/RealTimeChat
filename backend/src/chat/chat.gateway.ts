import { Logger } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { WebSocket } from 'ws';

import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';

import { DirectMessageEventsService } from '../direct-messages/direct-message-events.service.js';
import { ChatConnectionsService } from './chat-connections.service.js';
import { ChatService, type ChatRoom } from './chat.service.js';

@WebSocketGateway({ path: '/ws' })
export class ChatGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly chat: ChatService,
    private readonly connections: ChatConnectionsService,
    private readonly directEvents: DirectMessageEventsService,
  ) {}

  private send(
    client: WebSocket,
    event: string,
    data: unknown,
  ): void {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ event, data }));
    }
  }

  private error(
    client: WebSocket,
    message: string,
    event = 'chat.error',
  ): void {
    this.send(client, event, { message });
  }

  private async sendHistory(
    client: WebSocket,
    room: ChatRoom,
  ): Promise<void> {
    try {
      const messages = await this.chat.getHistory(room);

      if (this.connections.get(client)?.room === room) {
        this.send(client, 'chat.history', { room, messages });
      }
    } catch (error) {
      this.logger.error('Failed to load chat history', error);
      this.error(client, 'Could not load chat history');
    }
  }

  async handleConnection(
    client: WebSocket,
    request: IncomingMessage,
  ): Promise<void> {
    const session = await this.connections.connect(client, request);
    if (!session) return;

    this.send(client, 'connected', 'Welcome to Real-Time Chat!');
    this.send(client, 'chat.identity', session.sender);
    this.send(client, 'chat.joined', { room: 'general' });

    await this.sendHistory(client, 'general');
  }

  handleDisconnect(client: WebSocket): void {
    this.connections.disconnect(client);
  }

  @SubscribeMessage('chat.set_username')
  async setUsername(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() value: unknown,
  ): Promise<void> {
    try {
      const result = await this.connections.changeGuestUsername(
        client,
        value,
      );

      if (!result) return;

      if ('error' in result) {
        this.error(client, result.error);
      } else {
        this.send(client, 'chat.identity', result.sender);
      }
    } catch (error) {
      this.logger.error('Username validation failed', error);
      this.error(client, 'Could not validate username');
    }
  }

  @SubscribeMessage('chat.join')
  async joinRoom(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() value: unknown,
  ): Promise<void> {
    const session = await this.connections.authorize(client);
    if (!session) return;

    const room = this.chat.parseRoom(value);

    if (!room) {
      this.error(client, 'Unknown room');
      return;
    }

    session.room = room;

    this.send(client, 'chat.joined', { room });
    await this.sendHistory(client, room);
  }

  @SubscribeMessage('chat.message')
  async handleMessage(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() value: unknown,
  ): Promise<void> {
    const session = await this.connections.authorize(client);
    if (!session) return;

    const message = this.chat.createMessage(value);
    if (!message) return;

    const room = session.room;
    const sender = { ...session.sender };

    try {
      const saved = await this.chat.saveMessage(
        room,
        message,
        sender,
        session.userId,
      );

      for (const connection of this.connections.clientsInRoom(room)) {
        this.send(connection, 'chat.message', saved);
      }
    } catch (error) {
      this.logger.error('Failed to save chat message', error);
      this.error(client, 'Could not save your message');
    }
  }

  @SubscribeMessage('dm.send')
  sendDirectMessage(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() value: unknown,
  ): Promise<void> {
    return this.directEvents.handle(client, value);
  }
}
