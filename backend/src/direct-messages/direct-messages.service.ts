import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Subject } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service.js';

export interface DirectMessageSavedEvent {
  participantIds: string[];
  message: {
    id: string;
    conversationId: string;
    content: string;
    sentAt: Date;
    sender: {
      id: string;
      username: string;
    };
  };
}

@Injectable()
export class DirectMessagesService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly messageSaved =
    new Subject<DirectMessageSavedEvent>();

  readonly savedMessages$ =
    this.messageSaved.asObservable();

  async createConversation(userId: string, otherUserId: string) {
    if (userId === otherUserId) {
      throw new BadRequestException('You cannot message yourself');
    }

    const otherUser = await this.prisma.user.findUnique({
      where: { id: otherUserId },
      select: { id: true, username: true },
    });

    if (!otherUser) {
      throw new NotFoundException('User not found');
    }

    const [userAId, userBId] = [userId, otherUserId].sort();

    const conversation = await this.prisma.directConversation.upsert({
      where: {
        userAId_userBId: { userAId, userBId },
      },
      update: {},
      create: { userAId, userBId },
      select: {
        id: true,
        createdAt: true,
      },
    });

    return {
      ...conversation,
      otherUser,
    };
  }

  async getConversations(userId: string) {
    const conversations =
      await this.prisma.directConversation.findMany({
        where: {
          OR: [
            { userAId: userId },
            { userBId: userId },
          ],
        },
        include: {
          userA: {
            select: { id: true, username: true },
          },
          userB: {
            select: { id: true, username: true },
          },
          messages: {
            orderBy: [
              { sentAt: 'desc' },
              { id: 'desc' },
            ],
            take: 1,
            select: {
              id: true,
              content: true,
              senderId: true,
              sentAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

    return conversations.map((conversation) => ({
      id: conversation.id,
      createdAt: conversation.createdAt,
      otherUser:
        conversation.userAId === userId
          ? conversation.userB
          : conversation.userA,
      lastMessage: conversation.messages[0] ?? null,
    }));
  }

  private async requireParticipant(
    userId: string,
    conversationId: string,
  ) {
    const conversation =
      await this.prisma.directConversation.findFirst({
        where: {
          id: conversationId,
          OR: [
            { userAId: userId },
            { userBId: userId },
          ],
        },
        select: {
          id: true,
          userAId: true,
          userBId: true,
        },
      });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    return conversation;
  }

  async getParticipantIds(
    userId: string,
    conversationId: string,
  ): Promise<string[]> {
    const conversation = await this.requireParticipant(
        userId,
        conversationId,
    );

    return [
        conversation.userAId,
        conversation.userBId,
    ];
  }

  async getMessages(
    userId: string,
    conversationId: string,
    cursor?: string,
  ) {
    await this.requireParticipant(userId, conversationId);

    if (cursor) {
      const cursorMessage = await this.prisma.directMessage.findFirst({
        where: { id: cursor, conversationId },
        select: { id: true },
      });

      if (!cursorMessage) {
        throw new BadRequestException('Invalid cursor');
      }
    }

    const messages = await this.prisma.directMessage.findMany({
      where: { conversationId },
      orderBy: [
        { sentAt: 'desc' },
        { id: 'desc' },
      ],
      take: 31,
      ...(cursor
        ? { cursor: { id: cursor }, skip: 1 }
        : {}),
      select: {
        id: true,
        conversationId: true,
        content: true,
        sentAt: true,
        sender: {
          select: { id: true, username: true },
        },
      },
    });

    const hasMore = messages.length > 30;
    const page = messages.slice(0, 30);

    return {
      messages: page.reverse(),
      nextCursor: hasMore ? page[0].id : null,
    };
  }

  
  async sendMessage(
    userId: string,
    conversationId: string,
    content: string,
  ) {
    const conversation = await this.requireParticipant(
      userId,
      conversationId,
    );

    const text = content.trim();

    if (!text || text.length > 500) {
      throw new BadRequestException('Invalid message content');
    }

    const saved = await this.prisma.directMessage.create({
      data: {
        conversationId,
        senderId: userId,
        content: text,
      },
      select: {
        id: true,
        conversationId: true,
        content: true,
        sentAt: true,
        sender: {
          select: { id: true, username: true },
        },
      },
    });

    this.messageSaved.next({
      participantIds: [
        conversation.userAId,
        conversation.userBId,
      ],
      message: saved,
    });

    return saved;
  }
}
