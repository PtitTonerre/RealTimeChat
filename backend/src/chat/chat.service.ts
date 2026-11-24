import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export const CHAT_ROOMS = [
  'general',
  'gaming',
  'development',
] as const;

export type ChatRoom = (typeof CHAT_ROOMS)[number];

export interface ChatSender {
  id: string;
  username: string;
}

export interface ChatMessage {
  content: string;
}

export interface RoomMessage extends ChatMessage {
  id: string;
  room: ChatRoom;
  sender: ChatSender;
  sentAt: string;
}

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  createMessage(content: unknown): ChatMessage | null {
    if (typeof content !== 'string') {
      return null;
    }

    const message = content.trim();

    if (!message || message.length > 500) {
      return null;
    }

    return { content: message };
  }

  parseRoom(value: unknown): ChatRoom | null {
    if (typeof value !== 'string') {
      return null;
    }

    const room = value.trim();

    return CHAT_ROOMS.find((name) => name === room) ?? null;
  }

  parseUsername(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const username = value.trim();

    if (!/^[\p{L}\p{N}_-]{2,20}$/u.test(username)) {
      return null;
    }

    return username;
  }

  async usernameExists(username: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: {
        usernameKey: username.toLowerCase(),
      },
      select: {
        id: true,
      },
    });

    return user !== null;
  }

  async saveMessage(
    room: ChatRoom,
    message: ChatMessage,
    sender: ChatSender,
    userId: string | null = null,
  ): Promise<RoomMessage> {
    const databaseRoom = await this.prisma.room.upsert({
      where: {
        name: room,
      },
      update: {},
      create: {
        name: room,
      },
    });

    const saved = await this.prisma.message.create({
      data: {
        content: message.content,
        senderId: sender.id,
        senderUsername: sender.username,

        room: {
          connect: {
            id: databaseRoom.id,
          },
        },

        ...(userId
          ? {
              user: {
                connect: {
                  id: userId,
                },
              },
            }
          : {}),
      },
    });

    return {
      id: saved.id,
      room,
      content: saved.content,
      sender: {
        id: saved.senderId,
        username: saved.senderUsername,
      },
      sentAt: saved.sentAt.toISOString(),
    };
  }

  async getHistory(room: ChatRoom): Promise<RoomMessage[]> {
    const messages = await this.prisma.message.findMany({
      where: {
        room: {
          is: {
            name: room,
          },
        },
      },
      orderBy: [
        { sentAt: 'desc' },
        { id: 'desc' },
      ],
      take: 50,
    });

    return messages.reverse().map((message) => ({
      id: message.id,
      room,
      content: message.content,
      sender: {
        id: message.senderId,
        username: message.senderUsername,
      },
      sentAt: message.sentAt.toISOString(),
    }));
  }
}
