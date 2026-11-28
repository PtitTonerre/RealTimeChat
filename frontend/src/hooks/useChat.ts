import { useEffect, useRef, useState } from 'react';
import { createChatSocket } from '../services/chat-socket';

import {
  messagesForUser,
  type ScopedDirectMessages,
} from '../services/direct-message-state';

import type {
  ChatMessage,
  ChatSender,
  Room,
  ServerEvent,
} from '../types/chat';

export function useChat(
  userId: string | null,
  checkingSession: boolean,
  onSessionInvalid: () => void,
) {
  const socketRef =
    useRef<ReturnType<typeof createChatSocket> | null>(null);

  const desiredRoom = useRef<Room>('general');
  const scope = userId ?? 'guest';

  const [connected, setConnected] = useState(false);

  const [identityState, setIdentityState] = useState<{
    scope: string;
    sender: ChatSender | null;
  }>({
    scope: '',
    sender: null,
  });

  const [room, setRoom] = useState<Room>('general');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState('');

  const [dmState, setDmState] = useState<ScopedDirectMessages>({
    userId: null,
    messages: [],
  });
  const [directError, setDirectError] = useState('');

  // An old account's identity must never be shown in a new account.
  const identity =
    identityState.scope === scope
      ? identityState.sender
      : null;

  const directMessages = messagesForUser(dmState, userId);

  useEffect(() => {
    if (checkingSession) return;

    let firstOpen = true;
    let connection: ReturnType<typeof createChatSocket> | null = null;

    connection = createChatSocket('ws://localhost:3000/ws', {
      onOpen: () => {
        setConnected(true);
        setIdentityState({ scope, sender: null });
        setError('');
        setDirectError('');

        if (firstOpen) {
          firstOpen = false;
          desiredRoom.current = 'general';
          setRoom('general');
          setMessages([]);

          // Clear messages when opening a different account.
          setDmState({ userId, messages: [] });
        }
      },

      onMessage: (raw) => {
        try {
          const message = JSON.parse(raw) as ServerEvent;

          switch (message.event) {
            case 'chat.identity':
              if (userId && message.data.id !== userId) {
                connection?.stop();
                setConnected(false);
                setIdentityState({ scope, sender: null });

                onSessionInvalid();
                return;
              }

              setIdentityState({
                scope,
                sender: message.data,
              });
              setError('');

              if (desiredRoom.current !== 'general') {
                connection?.send(
                  'chat.join',
                  desiredRoom.current,
                );
              }
              break;

            case 'chat.joined':
              if (message.data.room === desiredRoom.current) {
                setRoom(message.data.room);
              }
              break;

            case 'chat.message':
              setMessages((previous) =>
                previous.some(
                  (item) => item.id === message.data.id,
                )
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

                const combined = new Map(
                  [
                    ...message.data.messages,
                    ...currentRoom,
                  ].map((item) => [item.id, item]),
                );

                const sorted = [...combined.values()].sort(
                  (a, b) =>
                    a.sentAt.localeCompare(b.sentAt) ||
                    a.id.localeCompare(b.id),
                );

                return [...otherRooms, ...sorted];
              });
              break;

            case 'chat.error':
              setError(message.data.message);
              break;

            case 'dm.message':
              if (!userId) return;

              setDmState((previous) => {
                const current = messagesForUser(previous, userId);

                if (
                  current.some(
                    (item) => item.id === message.data.id,
                  )
                ) {
                  return previous;
                }

                return {
                  userId,
                  messages: [
                    ...current.slice(-199),
                    message.data,
                  ],
                };
              });

              setDirectError('');
              break;

            case 'dm.error':
              setDirectError(message.data.message);
              break;
          }
        } catch {
          setError('Invalid server message');
        }
      },

      onClose: () => {
        setConnected(false);
        setIdentityState({ scope, sender: null });
      },

      onRetry: () => {
        setError(
          'Connexion interrompue : reconnexion automatique...',
        );
        setDirectError(
          'Connexion interrompue : reconnexion...',
        );
      },

      onRejected: (reason) => {
        if (
          reason === 'Invalid session' ||
          reason === 'Session expired'
        ) {
          onSessionInvalid();
          return;
        }

        setError(
          `Connexion refusée : ${reason || 'erreur inconnue'}`,
        );
        setDirectError('Connexion refusée.');
      },
    });

    socketRef.current = connection;

    return () => {
      connection?.stop();

      if (socketRef.current === connection) {
        socketRef.current = null;
      }
    };
  }, [userId, checkingSession, onSessionInvalid, scope]);

  function sendEvent(
    event: string,
    data: unknown,
  ): boolean {
    // Do not send through a socket whose identity is still unknown.
    if (!identity) return false;

    return socketRef.current?.send(event, data) ?? false;
  }

  function joinRoom(nextRoom: Room): void {
    if (sendEvent('chat.join', nextRoom)) {
      desiredRoom.current = nextRoom;
    }
  }

  function changeUsername(username: string): boolean {
    return sendEvent(
      'chat.set_username',
      username.trim(),
    );
  }

  function sendMessage(content: string): boolean {
    const text = content.trim();

    if (!text || text.length > 500) {
      return false;
    }

    return sendEvent('chat.message', text);
  }

  function sendDirectMessage(
    conversationId: string,
    content: string,
  ): boolean {
    const text = content.trim();

    if (
      !userId ||
      identity?.id !== userId ||
      !conversationId ||
      !text ||
      text.length > 500
    ) {
      return false;
    }

    setDirectError('');

    return sendEvent('dm.send', {
      conversationId,
      content: text,
    });
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
    directMessages,
    directError,
    sendDirectMessage,
  };
}
