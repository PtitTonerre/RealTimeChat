import { Injectable } from '@nestjs/common';

export const CHAT_ROOMS = [
  'general',
  'gaming',
  'development',
] as const;

export type ChatRoom = (typeof CHAT_ROOMS)[number];

export interface ChatMessage {
  content: string;
}

export interface RoomMessage extends ChatMessage {
  room: ChatRoom;
}

@Injectable()
export class ChatService {
  private readonly history = new Map<ChatRoom, RoomMessage[]>();

  private readonly maxHistory = 50;

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

  saveMessage(room: ChatRoom, message: ChatMessage): RoomMessage {
    const savedMessage: RoomMessage = {
      room,
      content: message.content,
    };

    const messages = this.history.get(room) ?? [];

    messages.push(savedMessage);

    if (messages.length > this.maxHistory) {
      messages.shift();
    }

    this.history.set(room, messages);

    return savedMessage;
  }

  getHistory(room: ChatRoom): RoomMessage[] {
    return [...(this.history.get(room) ?? [])];
  }
}
