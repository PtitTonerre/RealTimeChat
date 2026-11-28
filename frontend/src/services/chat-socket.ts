export interface ChatSocketHandlers {
  onOpen: () => void;
  onMessage: (raw: string) => void;
  onClose: () => void;
  onRetry: (delayMs: number) => void;
  onRejected: (reason: string) => void;
}

interface ChatSocketOptions {
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export function createChatSocket(
  url: string,
  handlers: ChatSocketHandlers,
  options: ChatSocketOptions = {},
) {
  const baseDelay = options.baseDelayMs ?? 1000;
  const maxDelay = options.maxDelayMs ?? 10000;

  let socket: WebSocket | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let attempts = 0;
  let stopped = false;

  function scheduleRetry(): void {
    if (stopped || retryTimer !== null) return;

    const delay = Math.min(
      maxDelay,
      baseDelay * 2 ** Math.min(attempts, 8),
    );

    attempts += 1;
    handlers.onRetry(delay);

    retryTimer = setTimeout(() => {
      retryTimer = null;
      connect();
    }, delay);
  }

  function connect(): void {
    if (stopped) return;

    let current: WebSocket;

    try {
      current = new WebSocket(url);
    } catch {
      handlers.onClose();
      scheduleRetry();
      return;
    }

    socket = current;

    current.onopen = () => {
      if (stopped || socket !== current) return;

      attempts = 0;
      handlers.onOpen();
    };

    current.onmessage = (event: MessageEvent) => {
      if (stopped || socket !== current) return;

      if (typeof event.data === 'string') {
        handlers.onMessage(event.data);
      }
    };

    current.onclose = (event: CloseEvent) => {
      if (stopped || socket !== current) return;

      socket = null;
      handlers.onClose();

      // Session invalid, expired or forbidden Origin.
      if (event.code === 1008) {
        stopped = true;
        handlers.onRejected(event.reason);
        return;
      }

      scheduleRetry();
    };
  }

  connect();

  return {
    send(event: string, data: unknown): boolean {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return false;
      }

      try {
        socket.send(JSON.stringify({ event, data }));
        return true;
      } catch {
        return false;
      }
    },

    stop(): void {
      stopped = true;

      if (retryTimer !== null) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }

      const current = socket;
      socket = null;
      current?.close();
    },
  };
}
