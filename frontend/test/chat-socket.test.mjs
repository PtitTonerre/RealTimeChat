import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { createChatSocket } from '../src/services/chat-socket.ts';

const previousWebSocket = globalThis.WebSocket;

class FakeWebSocket {
  static OPEN = 1;
  static instances = [];

  readyState = 0;
  sent = [];

  constructor(url) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  open() {
    this.readyState = 1;
    this.onopen?.();
  }

  receive(value) {
    this.onmessage?.({ data: value });
  }

  send(value) {
    this.sent.push(value);
  }

  close(code = 1000, reason = '') {
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }
}

function createHandlers() {
  const calls = {
    opens: 0,
    messages: [],
    closes: 0,
    retries: [],
    rejected: [],
  };

  return {
    calls,
    handlers: {
      onOpen: () => { calls.opens += 1; },
      onMessage: (message) => { calls.messages.push(message); },
      onClose: () => { calls.closes += 1; },
      onRetry: (delay) => { calls.retries.push(delay); },
      onRejected: (reason) => { calls.rejected.push(reason); },
    },
  };
}

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function waitForSockets(count) {
  const deadline = Date.now() + 1000;

  while (
    FakeWebSocket.instances.length < count &&
    Date.now() < deadline
  ) {
    await sleep(5);
  }

  assert.equal(FakeWebSocket.instances.length, count);
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  globalThis.WebSocket = FakeWebSocket;
});

afterEach(() => {
  globalThis.WebSocket = previousWebSocket;
});

test('sends only when connected', () => {
  const { handlers } = createHandlers();
  const socket = createChatSocket('ws://test/ws', handlers);
  const connection = FakeWebSocket.instances[0];

  assert.equal(
    socket.send('chat.message', 'before open'),
    false,
  );

  connection.open();

  assert.equal(
    socket.send('chat.message', 'hello'),
    true,
  );

  assert.deepEqual(JSON.parse(connection.sent[0]), {
    event: 'chat.message',
    data: 'hello',
  });

  socket.stop();
});

test('reconnects after an unexpected disconnect', async () => {
  const { handlers, calls } = createHandlers();

  const socket = createChatSocket(
    'ws://test/ws',
    handlers,
    { baseDelayMs: 5 },
  );

  const first = FakeWebSocket.instances[0];
  first.open();
  first.close(1006);

  assert.equal(socket.send('dm.send', {}), false);

  await waitForSockets(2);

  const second = FakeWebSocket.instances[1];
  second.open();
  second.receive('hello');

  assert.equal(
    socket.send('chat.join', 'gaming'),
    true,
  );

  assert.deepEqual(calls.messages, ['hello']);
  assert.deepEqual(calls.retries, [5]);
  assert.equal(calls.opens, 2);
  assert.equal(first.sent.length, 0);
  assert.equal(second.sent.length, 1);

  socket.stop();
});

test('does not retry after an authentication rejection', async () => {
  const { handlers, calls } = createHandlers();

  const socket = createChatSocket(
    'ws://test/ws',
    handlers,
    { baseDelayMs: 5 },
  );

  FakeWebSocket.instances[0].close(
    1008,
    'Invalid session',
  );

  await sleep(20);

  assert.equal(FakeWebSocket.instances.length, 1);
  assert.deepEqual(calls.rejected, ['Invalid session']);

  socket.stop();
});

test('stopping cancels pending retries', async () => {
  const { handlers } = createHandlers();

  const socket = createChatSocket(
    'ws://test/ws',
    handlers,
    { baseDelayMs: 5 },
  );

  FakeWebSocket.instances[0].close(1006);
  socket.stop();

  await sleep(20);

  assert.equal(FakeWebSocket.instances.length, 1);
});

test('retry delay resets after a successful connection', async () => {
  const { handlers, calls } = createHandlers();

  const socket = createChatSocket(
    'ws://test/ws',
    handlers,
    {
      baseDelayMs: 5,
      maxDelayMs: 10,
    },
  );

  FakeWebSocket.instances[0].close(1006);
  await waitForSockets(2);

  FakeWebSocket.instances[1].close(1006);
  await waitForSockets(3);

  FakeWebSocket.instances[2].open();
  FakeWebSocket.instances[2].close(1006);

  assert.deepEqual(calls.retries, [5, 10, 5]);

  socket.stop();
});

test('ignores late events from a stopped socket', () => {
  const { handlers, calls } = createHandlers();

  const socket = createChatSocket(
    'ws://test/ws',
    handlers,
  );

  const connection = FakeWebSocket.instances[0];
  connection.open();

  socket.stop();

  // Simulate a message arriving from an obsolete connection.
  connection.receive('old account message');

  assert.deepEqual(calls.messages, []);
});
