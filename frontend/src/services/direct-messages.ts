import type {
  DirectConversation,
  DirectMessagePage,
  DirectUser,
} from '../types/direct-messages';

const API_URL = 'http://localhost:3000';

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...options.headers,
    },
  });

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    let message = `Request failed (${response.status})`;

    if (
      body &&
      typeof body === 'object' &&
      'message' in body
    ) {
      const details = body.message;

      if (typeof details === 'string') {
        message = details;
      } else if (Array.isArray(details)) {
        message = details
          .filter(
            (item): item is string =>
              typeof item === 'string',
          )
          .join(', ');
      }
    }

    throw new Error(message);
  }

  return body as T;
}

export function searchUsers(
  search: string,
): Promise<DirectUser[]> {
  return request<DirectUser[]>(
    `/dm/users?search=${encodeURIComponent(search)}`,
  );
}

export function getConversations(
  signal?: AbortSignal,
): Promise<DirectConversation[]> {
  return request<DirectConversation[]>(
    '/dm/conversations',
    { signal },
  );
}

export function createConversation(
  otherUserId: string,
): Promise<Omit<DirectConversation, 'lastMessage'>> {
  return request<Omit<DirectConversation, 'lastMessage'>>(
    '/dm/conversations',
    {
      method: 'POST',
      body: JSON.stringify({ otherUserId }),
    },
  );
}

export function getMessages(
  conversationId: string,
  cursor?: string,
  signal?: AbortSignal,
): Promise<DirectMessagePage> {
  const query = cursor
    ? `?cursor=${encodeURIComponent(cursor)}`
    : '';

  return request<DirectMessagePage>(
    `/dm/conversations/${encodeURIComponent(conversationId)}/messages${query}`,
    { signal },
  );
}
