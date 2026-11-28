import { useEffect, useMemo, useRef, useState } from 'react';
import { getMessages } from '../services/direct-messages';
import { mergeDirectMessages } from '../services/direct-message-state';
import type { DirectMessage } from '../types/direct-messages';

interface HistoryPage {
  conversationId: string;
  messages: DirectMessage[];
  nextCursor: string | null;
}

interface HistoryError {
  conversationId: string;
  message: string;
}

interface OlderRequest {
  conversationId: string;
  controller: AbortController;
}

export function useDirectMessageHistory(
  conversationId: string | null,
  incoming: DirectMessage[],
  connected: boolean,
) {
  const [page, setPage] = useState<HistoryPage | null>(null);

  const [historyError, setHistoryError] =
    useState<HistoryError | null>(null);

  const [olderError, setOlderError] =
    useState<HistoryError | null>(null);

  const [loadingOlderRequest, setLoadingOlderRequest] =
    useState<OlderRequest | null>(null);

  const olderRequest = useRef<AbortController | null>(null);

  // Fetch the latest page on selection and after reconnection.
  useEffect(() => {
    if (!conversationId || !connected) return;

    const controller = new AbortController();

    void getMessages(
      conversationId,
      undefined,
      controller.signal,
    )
      .then((result) => {
        if (controller.signal.aborted) return;

        setPage((previous) => {
          const latest: HistoryPage = {
            conversationId,
            messages: result.messages,
            nextCursor: result.nextCursor,
          };

          if (previous?.conversationId !== conversationId) {
            return latest;
          }

          const knownIds = new Set(
            previous.messages.map((message) => message.id),
          );

          const hasOverlap = result.messages.some(
            (message) => knownIds.has(message.id),
          );

          // If both ranges overlap, keep older pages already loaded.
          if (hasOverlap) {
            return {
              ...previous,
              messages: mergeDirectMessages(
                previous.messages,
                result.messages,
              ),
            };
          }

          // No overlap: use the new page and allow pagination
          // to retrieve messages from the intervening period.
          return latest;
        });

        setHistoryError(null);
        setOlderError(null);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setHistoryError({
            conversationId,
            message: 'Could not load messages.',
          });
        }
      });

    return () => {
      controller.abort();
      olderRequest.current?.abort();
      olderRequest.current = null;
    };
  }, [conversationId, connected]);

  // A page is only visible for the conversation that owns it.
  const current =
    page?.conversationId === conversationId
      ? page
      : null;

  const messages = useMemo(() => {
    if (!conversationId) return [];

    return mergeDirectMessages(
      current?.messages ?? [],
      incoming.filter(
        (message) =>
          message.conversationId === conversationId,
      ),
    );
  }, [conversationId, current, incoming]);

  async function loadOlder(): Promise<void> {
    if (
      !connected ||
      !conversationId ||
      !current?.nextCursor ||
      olderRequest.current
    ) {
      return;
    }

    const id = conversationId;
    const cursor = current.nextCursor;
    const controller = new AbortController();

    olderRequest.current = controller;

    setLoadingOlderRequest({
      conversationId: id,
      controller,
    });
    setOlderError(null);

    try {
      const result = await getMessages(
        id,
        cursor,
        controller.signal,
      );

      if (controller.signal.aborted) return;

      setPage((previous) => {
        if (
          previous?.conversationId !== id ||
          previous.nextCursor !== cursor
        ) {
          return previous;
        }

        return {
          conversationId: id,
          messages: mergeDirectMessages(
            result.messages,
            previous.messages,
          ),
          nextCursor: result.nextCursor,
        };
      });
    } catch {
      if (!controller.signal.aborted) {
        setOlderError({
          conversationId: id,
          message: 'Could not load older messages.',
        });
      }
    } finally {
      if (olderRequest.current === controller) {
        olderRequest.current = null;
      }

      setLoadingOlderRequest((previous) =>
        previous?.controller === controller
          ? null
          : previous,
      );
    }
  }

  const error =
    !connected && conversationId && !current
      ? 'Offline: messages unavailable until reconnection.'
      : [historyError, olderError].find(
          (item) => item?.conversationId === conversationId,
        )?.message ?? '';

  return {
    messages,
    cursor: current?.nextCursor ?? null,
    loading: Boolean(
      conversationId &&
      connected &&
      !current &&
      historyError?.conversationId !== conversationId,
    ),
    loadingOlder:
      loadingOlderRequest?.conversationId === conversationId,
    error,
    loadOlder,
  };
}
