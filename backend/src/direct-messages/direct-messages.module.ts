import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { DirectMessagesController } from './direct-messages.controller.js';
import { DirectMessagesService } from './direct-messages.service.js';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [DirectMessagesController],
  providers: [DirectMessagesService],
  exports: [DirectMessagesService],
})
export class DirectMessagesModule {}
