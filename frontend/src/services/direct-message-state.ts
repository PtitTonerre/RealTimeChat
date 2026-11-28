import type { DirectMessage } from '../types/direct-messages';

export interface ScopedDirectMessages {
  userId: string | null;
  messages: DirectMessage[];
}

export function messagesForUser(
  state: ScopedDirectMessages,
  userId: string | null,
): DirectMessage[] {
  return userId && state.userId === userId
    ? state.messages
    : [];
}

export function mergeDirectMessages(
  ...groups: DirectMessage[][]
): DirectMessage[] {
  const unique = new Map<string, DirectMessage>();

  for (const group of groups) {
    for (const message of group) {
      unique.set(message.id, message);
    }
  }

  return [...unique.values()].sort(
    (a, b) =>
      a.sentAt.localeCompare(b.sentAt) ||
      a.id.localeCompare(b.id),
  );
}
