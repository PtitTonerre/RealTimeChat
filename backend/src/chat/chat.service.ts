import { Injectable } from '@nestjs/common';

export interface ChatMessage {
  content: string;
}

export const CHAT_ROOMS = [
  'general',
  'gaming',
  'development',
] as const;

export type ChatRoom = (typeof CHAT_ROOMS)[number];

@Injectable()
export class ChatService {
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
}
