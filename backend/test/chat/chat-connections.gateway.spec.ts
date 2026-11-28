import { beforeEach, describe, expect, it } from 'vitest';
import {
  alice, connect, createGatewayFixture, events, mockClient, mockRequest,
} from './chat-gateway.fixture.js';

describe('ChatGateway - connections', () => {
  let f: Awaited<ReturnType<typeof createGatewayFixture>>;

  beforeEach(async () => {
    f = await createGatewayFixture();
  });

  it('creates a guest without a session', async () => {
    const guest = await connect(f.gateway);

    expect(events(guest)).toContainEqual({
      event: 'chat.identity',
      data: {
        id: expect.any(String),
        username: 'Guest-1',
      },
    });
  });

  it('recognizes an authenticated account', async () => {
    f.auth.getAuthenticatedUser.mockResolvedValue(alice);
    const user = await connect(f.gateway, 'alice-token');

    expect(f.auth.getAuthenticatedUser)
      .toHaveBeenCalledWith('alice-token');

    expect(events(user)).toContainEqual({
      event: 'chat.identity',
      data: {
        id: alice.id,
        username: alice.username,
      },
    });
  });

  it('rejects an unauthorized origin', async () => {
    const user = mockClient();

    await f.gateway.handleConnection(
      user.client,
      mockRequest(undefined, 'https://example.com'),
    );

    expect(user.close).toHaveBeenCalledWith(
      1008,
      'Origin not allowed',
    );
  });

  it('stops sending messages to disconnected clients', async () => {
    const first = await connect(f.gateway);
    const second = await connect(f.gateway);

    first.send.mockClear();
    second.send.mockClear();

    f.gateway.handleDisconnect(second.client);
    await f.gateway.handleMessage(first.client, 'Hello!');

    expect(events(first)).toHaveLength(1);
    expect(events(second)).toHaveLength(0);
  });

  it('prevents accounts from changing their username', async () => {
    f.auth.getAuthenticatedUser.mockResolvedValue(alice);
    const user = await connect(f.gateway, 'alice-token');

    user.send.mockClear();
    await f.gateway.setUsername(user.client, 'NewAlice');

    expect(events(user)).toContainEqual({
      event: 'chat.error',
      data: {
        message: 'Account usernames cannot be changed from chat',
      },
    });
  });

  it('reserves registered usernames', async () => {
    f.db.user.findUnique.mockResolvedValue({ id: alice.id });
    const guest = await connect(f.gateway);

    guest.send.mockClear();
    await f.gateway.setUsername(guest.client, 'Alice');

    expect(events(guest)).toContainEqual({
      event: 'chat.error',
      data: {
        message: 'Username is reserved by a registered account',
      },
    });
  });

  it('rejects revoked sessions', async () => {
    f.auth.getAuthenticatedUser
      .mockResolvedValueOnce(alice)
      .mockResolvedValueOnce(null);

    const user = await connect(f.gateway, 'alice-token');

    await f.gateway.handleMessage(user.client, 'Hello!');

    expect(user.close).toHaveBeenCalledWith(
      1008,
      'Session expired',
    );

    expect(f.db.message.create).not.toHaveBeenCalled();
  });
});
