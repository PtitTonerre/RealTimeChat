import {
  HttpException,
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';

import { Subscription } from 'rxjs';
import { WebSocket } from 'ws';
import { ChatConnectionsService } from '../chat/chat-connections.service.js';
import { DirectMessagesService } from './direct-messages.service.js';
import type { DirectMessageSavedEvent } from './direct-messages.service.js';

@Injectable()
export class DirectMessageEventsService
  implements OnModuleDestroy
{
  private readonly logger = new Logger(
    DirectMessageEventsService.name,
  );

  private readonly subscription: Subscription;

  constructor(
    private readonly messages: DirectMessagesService,
    private readonly connections: ChatConnectionsService,
  ) {
    this.subscription = this.messages.savedMessages$.subscribe(
      (event) => {
        void this.broadcast(event).catch((error: unknown) => {
          this.logger.error(
            'Failed to broadcast private message',
            error,
          );
        });
      },
    );
  }

  onModuleDestroy(): void {
    this.subscription.unsubscribe();
  }

  private send(
    client: WebSocket,
    event: string,
    data: unknown,
  ): void {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ event, data }));
    }
  }

  private error(client: WebSocket, message: string): void {
    this.send(client, 'dm.error', { message });
  }

  private async broadcast(
    event: DirectMessageSavedEvent,
  ): Promise<void> {
    const { participantIds, message } = event;

    for (const connection of this.connections.clientsForUsers(
      participantIds,
    )) {
      try {
        const recipient =
          await this.connections.authorize(connection);

        if (
          recipient?.userId &&
          participantIds.includes(recipient.userId)
        ) {
          this.send(connection, 'dm.message', message);
        }
      } catch (error) {
        this.logger.warn(
          'Failed to notify a private message recipient',
          error,
        );
      }
    }
  }

  async handle(
    client: WebSocket,
    value: unknown,
  ): Promise<void> {
    const session = await this.connections.authorize(client);
    if (!session) return;

    if (!session.userId) {
      this.error(client, 'Login required');
      return;
    }

    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value)
    ) {
      this.error(client, 'Invalid private message');
      return;
    }

    const { conversationId, content } =
      value as Record<string, unknown>;

    if (
      typeof conversationId !== 'string' ||
      typeof content !== 'string'
    ) {
      this.error(client, 'Invalid private message');
      return;
    }

    try {
      await this.messages.sendMessage(
        session.userId,
        conversationId,
        content,
      );
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

      this.logger.error(
        'Failed to send private message',
        error,
      );

      this.error(client, 'Could not send private message');
    }
  }
}
