import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ChatConnectionsService } from './chat-connections.service.js';
import { ChatGateway } from './chat.gateway.js';
import { ChatService } from './chat.service.js';

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [
    ChatGateway,
    ChatService,
    ChatConnectionsService,
  ],
})
export class ChatModule {}
