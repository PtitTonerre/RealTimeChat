import type { DirectMessage } from './direct-messages';

export const ROOMS = [
  'general',
  'gaming',
  'development',
] as const;

export type Room = (typeof ROOMS)[number];

export interface ChatSender {
  id: string;
  username: string;
}

export interface ChatMessage {
  id: string;
  room: Room;
  content: string;
  sender: ChatSender;
  sentAt: string;
}

export type ServerEvent =
  | { event: 'connected'; data: string }
  | { event: 'chat.identity'; data: ChatSender }
  | { event: 'chat.joined'; data: { room: Room } }
  | { event: 'chat.message'; data: ChatMessage }
  | {
      event: 'chat.history';
      data: {
        room: Room;
        messages: ChatMessage[];
      };
    }
  | { event: 'chat.error'; data: { message: string } }
  | { event: 'dm.message'; data: DirectMessage }
  | { event: 'dm.error'; data: { message: string } };
