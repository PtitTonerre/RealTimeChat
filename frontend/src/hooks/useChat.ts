import { useEffect, useRef, useState } from 'react';

import type {
  ChatMessage,
  ChatSender,
  Room,
  ServerEvent,
} from '../types/chat';

export function useChat(
  userId: string | null,
  checkingSession: boolean,
) {
  const socketRef = useRef<WebSocket | null>(null);

  const [connected, setConnected] = useState(false);
  const [identity, setIdentity] = useState<ChatSender | null>(null);
  const [room, setRoom] = useState<Room>('general');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    // Wait until the HTTP session has been checked.
    if (checkingSession) {
      return;
    }

    const socket = new WebSocket('ws://localhost:3000/ws');
    socketRef.current = socket;

    let active = true;

    socket.onopen = () => {
      if (!active) return;

      setConnected(true);
      setIdentity(null);
      setRoom('general');
      setMessages([]);
      setError('');
    };

    socket.onmessage = (event: MessageEvent) => {
      if (!active) return;

      try {
        const message = JSON.parse(
          event.data as string,
        ) as ServerEvent;

        switch (message.event) {
          case 'chat.identity':
            setIdentity(message.data);
            setError('');
            break;

          case 'chat.joined':
            setRoom(message.data.room);
            break;

          case 'chat.message':
            setMessages((previous) =>
              previous.some((item) => item.id === message.data.id)
                ? previous
                : [...previous, message.data],
            );
            break;

          case 'chat.history':
            setMessages((previous) => {
              const otherRooms = previous.filter(
                (item) => item.room !== message.data.room,
              );

              const currentRoom = previous.filter(
                (item) => item.room === message.data.room,
              );

              const merged = new Map(
                [...message.data.messages, ...currentRoom].map(
                  (item) => [item.id, item],
                ),
              );

              return [...otherRooms, ...merged.values()];
            });
            break;

          case 'chat.error':
            setError(message.data.message);
            break;
        }
      } catch {
        setError('Invalid server message');
      }
    };

    socket.onerror = () => {
      if (active) {
        setError('WebSocket connection error');
      }
    };

    socket.onclose = () => {
      if (active) {
        setConnected(false);
        setIdentity(null);
      }
    };

    return () => {
      active = false;
      socket.close();

      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [userId, checkingSession]);

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

  function changeUsername(username: string): boolean {
    return sendEvent('chat.set_username', username.trim());
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
    identity,
    room,
    messages,
    error,
    joinRoom,
    changeUsername,
    sendMessage,
  };
}
