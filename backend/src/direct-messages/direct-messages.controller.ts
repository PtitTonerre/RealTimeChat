import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { SessionGuard } from '../auth/session.guard.js';
import type { AuthenticatedRequest } from '../auth/session.guard.js';
import { UsersService } from '../auth/users.service.js';

import { DirectMessagesService } from './direct-messages.service.js';
import { CreateConversationDto } from './dto/create-conversation.dto.js';
import { SendDirectMessageDto } from './dto/send-direct-message.dto.js';

@UseGuards(SessionGuard)
@Controller('dm')
export class DirectMessagesController {
  constructor(
    private readonly users: UsersService,
    private readonly messages: DirectMessagesService,
  ) {}

  private checkOrigin(req: AuthenticatedRequest): void {
    const allowed =
      process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173';

    if (req.headers.origin !== allowed) {
      throw new ForbiddenException('Origin not allowed');
    }
  }

  @Get('users')
  searchUsers(
    @Req() req: AuthenticatedRequest,
    @Query('search') search?: string,
  ) {
    return this.users.search(
      req.authUser.id,
      typeof search === 'string' ? search : '',
    );
  }

  @Get('conversations')
  getConversations(@Req() req: AuthenticatedRequest) {
    return this.messages.getConversations(req.authUser.id);
  }

  @Post('conversations')
  createConversation(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateConversationDto,
  ) {
    this.checkOrigin(req);

    return this.messages.createConversation(
      req.authUser.id,
      dto.otherUserId,
    );
  }

  @Get('conversations/:id/messages')
  getMessages(
    @Req() req: AuthenticatedRequest,
    @Param('id') conversationId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.messages.getMessages(
      req.authUser.id,
      conversationId,
      typeof cursor === 'string' ? cursor : undefined,
    );
  }

  @Post('conversations/:id/messages')
  sendMessage(
    @Req() req: AuthenticatedRequest,
    @Param('id') conversationId: string,
    @Body() dto: SendDirectMessageDto,
  ) {
    this.checkOrigin(req);

    return this.messages.sendMessage(
      req.authUser.id,
      conversationId,
      dto.content,
    );
  }
}
