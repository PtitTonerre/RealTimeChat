export const ROOMS = [
  'general',
  'gaming',
  'development',
] as const;

export type Room = (typeof ROOMS)[number];

export interface ChatMessage {
  room: Room;
  content: string;
}

export type ServerEvent =
  | { event: 'connected'; data: string }
  | { event: 'chat.joined'; data: { room: Room } }
  | { event: 'chat.message'; data: ChatMessage }
  | {
      event: 'chat.history';
      data: {
        room: Room;
        messages: ChatMessage[];
      };
    }
  | { event: 'chat.error'; data: { message: string } };
