import { beforeEach, describe, expect, it } from 'vitest';
import {
  alice, connect, createGatewayFixture, events,
} from './chat-gateway.fixture.js';

describe('ChatGateway - public rooms', () => {
  let f: Awaited<ReturnType<typeof createGatewayFixture>>;

  beforeEach(async () => {
    f = await createGatewayFixture();
  });

  it('broadcasts messages to the current room', async () => {
    const first = await connect(f.gateway);
    const second = await connect(f.gateway);

    first.send.mockClear();
    second.send.mockClear();

    await f.gateway.handleMessage(first.client, 'Hello!');

    expect(events(first)[0]).toMatchObject({
      event: 'chat.message',
      data: {
        room: 'general',
        content: 'Hello!',
        sender: { username: 'Guest-1' },
      },
    });

    expect(events(second)).toEqual(events(first));
  });

  it('links authenticated messages to their account', async () => {
    f.auth.getAuthenticatedUser.mockResolvedValue(alice);
    const user = await connect(f.gateway, 'alice-token');

    await f.gateway.handleMessage(user.client, 'Hello!');

    expect(f.db.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        senderId: alice.id,
        senderUsername: alice.username,
        user: { connect: { id: alice.id } },
      }),
    });
  });

  it('keeps public rooms isolated', async () => {
    const first = await connect(f.gateway);
    const second = await connect(f.gateway);

    await f.gateway.joinRoom(second.client, 'gaming');

    first.send.mockClear();
    second.send.mockClear();

    await f.gateway.handleMessage(first.client, 'General message');

    expect(events(first)).toHaveLength(1);
    expect(events(second)).toHaveLength(0);
  });
});
