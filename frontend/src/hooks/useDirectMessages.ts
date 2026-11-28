import { useEffect, useRef, useState } from 'react';

import {
  createConversation,
  getConversations,
} from '../services/direct-messages';

import type {
  DirectConversation,
  DirectMessage,
} from '../types/direct-messages';

import { useDirectMessageHistory } from './useDirectMessageHistory';

export function useDirectMessages(
  incoming: DirectMessage[],
  connected: boolean,
) {
  const [conversations, setConversations] =
    useState<DirectConversation[]>([]);
  const [selectedId, setSelectedId] =
    useState<string | null>(null);
  const [error, setError] = useState('');
  const [listVersion, setListVersion] = useState(0);

  const listRequest = useRef<AbortController | null>(null);
  const creating = useRef(false);
  const lastIncomingId = incoming.at(-1)?.id;

  // Refresh after incoming messages, reconnection or creation.
  useEffect(() => {
    const controller = new AbortController();
    listRequest.current = controller;

    void getConversations(controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return;

        setConversations(items);
        setError('');
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError('Could not load conversations.');
        }
      });

    return () => {
      controller.abort();

      if (listRequest.current === controller) {
        listRequest.current = null;
      }
    };
  }, [lastIncomingId, connected, listVersion]);

  const history = useDirectMessageHistory(
    selectedId,
    incoming,
    connected,
  );

  function selectConversation(id: string): void {
    setSelectedId(id);
    setError('');
  }

  async function startConversation(
    otherUserId: string,
  ): Promise<boolean> {
    if (creating.current) return false;

    creating.current = true;
    setError('');

    try {
      const created = await createConversation(otherUserId);

      // Prevent an old list request from overwriting this chat.
      listRequest.current?.abort();

      setConversations((previous) => {
        const existing = previous.find(
          (item) => item.id === created.id,
        );

        const conversation: DirectConversation = {
          ...created,
          lastMessage: existing?.lastMessage ?? null,
        };

        return [
          conversation,
          ...previous.filter(
            (item) => item.id !== conversation.id,
          ),
        ];
      });

      setSelectedId(created.id);

      // Fetch the complete list again after creation.
      setListVersion((version) => version + 1);

      return true;
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not start conversation.',
      );

      return false;
    } finally {
      creating.current = false;
    }
  }

  return {
    conversations,
    selectedId,
    selected: conversations.find(
      (item) => item.id === selectedId,
    ),
    ...history,
    error: history.error || error,
    selectConversation,
    startConversation,
  };
}
