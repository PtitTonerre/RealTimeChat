import {
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';

import { WebSocket } from 'ws';
import { ChatService } from './chat.service.js';

@WebSocketGateway({ path: '/ws' })
export class ChatGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly clients = new Set<WebSocket>();

  constructor(private readonly chatService: ChatService) {}

  handleConnection(client: WebSocket): void {
    this.clients.add(client);

    client.send(
      JSON.stringify({
        event: 'connected',
        data: 'Welcome to Real-Time Chat!',
      }),
    );
  }

  handleDisconnect(client: WebSocket): void {
    this.clients.delete(client);
  }

  @SubscribeMessage('chat.message')
  handleMessage(@MessageBody() content: unknown): void {
    const message = this.chatService.createMessage(content);

    if (!message) {
      return;
    }

    const payload = JSON.stringify({
      event: 'chat.message',
      data: message,
    });

    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }
}
