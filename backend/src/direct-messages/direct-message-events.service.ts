import { HttpException, Injectable, Logger } from '@nestjs/common';
import { WebSocket } from 'ws';

import { ChatConnectionsService } from '../chat/chat-connections.service.js';
import { DirectMessagesService } from './direct-messages.service.js';

@Injectable()
export class DirectMessageEventsService {
  private readonly logger = new Logger(DirectMessageEventsService.name);

  constructor(
    private readonly messages: DirectMessagesService,
    private readonly connections: ChatConnectionsService,
  ) {}

  private send(client: WebSocket, event: string, data: unknown): void {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ event, data }));
    }
  }

  private error(client: WebSocket, message: string): void {
    this.send(client, 'dm.error', { message });
  }

  async handle(client: WebSocket, value: unknown): Promise<void> {
    const session = await this.connections.authorize(client);
    if (!session) return;

    if (!session.userId) {
      this.error(client, 'Login required');
      return;
    }

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      this.error(client, 'Invalid private message');
      return;
    }

    const { conversationId, content } = value as Record<string, unknown>;

    if (typeof conversationId !== 'string' || typeof content !== 'string') {
      this.error(client, 'Invalid private message');
      return;
    }

    try {
      const participantIds = await this.messages.getParticipantIds(
        session.userId,
        conversationId,
      );
      const saved = await this.messages.sendMessage(
        session.userId,
        conversationId,
        content,
      );

      for (const connection of this.connections.clientsForUsers(participantIds)) {
        const recipient = await this.connections.authorize(connection);
        if (recipient?.userId && participantIds.includes(recipient.userId)) {
          this.send(connection, 'dm.message', saved);
        }
      }
    } catch (error) {
      if (error instanceof HttpException) {
        this.error(
          client,
          error.getStatus() === 404
            ? 'Conversation not found'
            : 'Invalid private message',
        );
        return;
      }

      this.logger.error('Failed to send private message', error);
      this.error(client, 'Could not send private message');
    }
  }
}
