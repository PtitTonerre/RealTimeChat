import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { DirectMessagesModule } from '../direct-messages/direct-messages.module.js';
import { DirectMessageEventsService } from '../direct-messages/direct-message-events.service.js';
import { ChatConnectionsService } from './chat-connections.service.js';
import { ChatGateway } from './chat.gateway.js';
import { ChatService } from './chat.service.js';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    DirectMessagesModule,
  ],
  providers: [
    ChatGateway,
    ChatService,
    ChatConnectionsService,
    DirectMessageEventsService,
  ],
})
export class ChatModule {}
