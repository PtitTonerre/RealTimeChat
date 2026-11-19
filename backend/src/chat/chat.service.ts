import { Injectable } from '@nestjs/common';

export interface ChatMessage {
  content: string;
}

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
}
