import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  mergeDirectMessages,
  messagesForUser,
} from '../src/services/direct-message-state.ts';

function dm(id, sentAt) {
  return {
    id,
    conversationId: 'conversation-1',
    content: id,
    sentAt,
    sender: {
      id: 'alice',
      username: 'Alice',
    },
  };
}

test('messages are never displayed to a different account', () => {
  const cached = {
    userId: 'alice',
    messages: [dm('1', '2026-11-26T14:00:00Z')],
  };

  assert.equal(messagesForUser(cached, 'alice').length, 1);
  assert.deepEqual(messagesForUser(cached, 'bob'), []);
  assert.deepEqual(messagesForUser(cached, null), []);
});

test('reloading history does not duplicate WebSocket messages', () => {
  const a = dm('a', '2026-11-26T14:00:00Z');
  const b = dm('b', '2026-11-26T14:01:00Z');
  const c = dm('c', '2026-11-26T14:02:00Z');

  const result = mergeDirectMessages(
    [a, b],
    [b, c],
    [c],
  );

  assert.deepEqual(
    result.map((message) => message.id),
    ['a', 'b', 'c'],
  );
});

test('messages sort deterministically when timestamps match', () => {
  const a = dm('a', '2026-11-26T14:00:00Z');
  const b = dm('b', '2026-11-26T14:00:00Z');

  const result = mergeDirectMessages([b], [a]);

  assert.deepEqual(
    result.map((message) => message.id),
    ['a', 'b'],
  );
});
