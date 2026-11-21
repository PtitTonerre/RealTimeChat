import { useEffect, useRef, useState } from 'react';

import type {
  ChatMessage,
  Room,
  ServerEvent,
} from '../types/chat';

export function useChat() {
  const socketRef = useRef<WebSocket | null>(null);

  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState<Room>('general');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const socket = new WebSocket('ws://localhost:3000/ws');

    socketRef.current = socket;

    let active = true;

    socket.onopen = () => {
      if (active) {
        setConnected(true);
      }
    };

    socket.onmessage = (event: MessageEvent) => {
      if (!active) {
        return;
      }

      try {
        const message = JSON.parse(
          event.data as string,
        ) as ServerEvent;

        switch (message.event) {
          case 'chat.joined':
            setRoom(message.data.room);
            setError('');
            break;

          case 'chat.message':
            setMessages((previous) => [
              ...previous,
              message.data,
            ]);
            break;

          case 'chat.history':
            setMessages((previous) => [
              ...previous.filter(
                (item) => item.room !== message.data.room,
              ),
              ...message.data.messages,
            ]);
            break;

          case 'chat.error':
            setError(message.data.message);
            break;
        }
      } catch {
        setError('Invalid server message');
      }
    };

    socket.onclose = () => {
      if (active) {
        setConnected(false);
      }
    };

    return () => {
      active = false;
      socket.close();

      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, []);

  function sendEvent(event: string, data: string): boolean {
    const socket = socketRef.current;

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    socket.send(JSON.stringify({ event, data }));

    return true;
  }

  function joinRoom(nextRoom: Room): void {
    sendEvent('chat.join', nextRoom);
  }

  function sendMessage(content: string): boolean {
    const message = content.trim();

    if (!message || message.length > 500) {
      return false;
    }

    return sendEvent('chat.message', message);
  }

  return {
    connected,
    room,
    messages,
    error,
    joinRoom,
    sendMessage,
  };
}
