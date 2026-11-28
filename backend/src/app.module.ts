import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ChatModule } from './chat/chat.module.js';
import { DirectMessagesModule } from './direct-messages/direct-messages.module.js';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    ChatModule,
    DirectMessagesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
