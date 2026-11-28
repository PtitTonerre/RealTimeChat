import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  alice, bob, charlie, connect, createGatewayFixture, events,
} from './chat-gateway.fixture.js';

describe('ChatGateway - direct messages', () => {
  let f: Awaited<ReturnType<typeof createGatewayFixture>>;

  beforeEach(async () => {
    f = await createGatewayFixture();
  });

  it('rejects private messages after session revocation', async () => {
    f.auth.getAuthenticatedUser
      .mockResolvedValueOnce(alice)
      .mockResolvedValueOnce(null);

    const user = await connect(f.gateway, 'alice-token');

    user.send.mockClear();

    await f.gateway.sendDirectMessage(user.client, {
      conversationId: 'conversation-1',
      content: 'This message must not be sent',
    });

    expect(user.close).toHaveBeenCalledWith(
      1008,
      'Session expired',
    );

    expect(f.directMessages.getParticipantIds)
      .not.toHaveBeenCalled();

    expect(f.directMessages.sendMessage)
      .not.toHaveBeenCalled();
  });

  it('rejects messages from guests', async () => {
    const guest = await connect(f.gateway);
    guest.send.mockClear();

    await f.gateway.sendDirectMessage(guest.client, {
      conversationId: 'conversation-1',
      content: 'Hello!',
    });

    expect(events(guest)).toContainEqual({
      event: 'dm.error',
      data: { message: 'Login required' },
    });

    expect(f.directMessages.sendMessage).not.toHaveBeenCalled();
  });

  it('sends messages only to the two participants', async () => {
    const accounts = new Map([
      ['alice-token', alice],
      ['bob-token', bob],
      ['charlie-token', charlie],
    ]);

    f.auth.getAuthenticatedUser.mockImplementation(
      async (token?: string) => accounts.get(token ?? '') ?? null,
    );

    const a = await connect(f.gateway, 'alice-token');
    const b = await connect(f.gateway, 'bob-token');
    const c = await connect(f.gateway, 'charlie-token');

    a.send.mockClear();
    b.send.mockClear();
    c.send.mockClear();

    const savedMessage = {
      id: 'dm-1',
      conversationId: 'conversation-1',
      content: 'Hello Bob!',
      sentAt: new Date('2026-11-24T12:00:00.000Z'),
      sender: {
        id: alice.id,
        username: alice.username,
      },
    };

    f.directMessages.getParticipantIds.mockResolvedValue([
      alice.id,
      bob.id,
    ]);

    f.directMessages.sendMessage.mockResolvedValue(savedMessage);

    await f.gateway.sendDirectMessage(a.client, {
      conversationId: 'conversation-1',
      content: 'Hello Bob!',
    });

    expect(events(a)).toContainEqual({
      event: 'dm.message',
      data: expect.objectContaining({
        id: 'dm-1',
        content: 'Hello Bob!',
      }),
    });

    expect(events(b)).toEqual(events(a));
    expect(events(c)).toHaveLength(0);

    expect(f.directMessages.sendMessage).toHaveBeenCalledWith(
      alice.id,
      'conversation-1',
      'Hello Bob!',
    );
  });

  it('rejects access to another conversation', async () => {
    f.auth.getAuthenticatedUser.mockResolvedValue(alice);

    const user = await connect(f.gateway, 'alice-token');
    user.send.mockClear();

    f.directMessages.getParticipantIds.mockRejectedValue(
      new NotFoundException('Conversation not found'),
    );

    await f.gateway.sendDirectMessage(user.client, {
      conversationId: 'private-conversation',
      content: 'Unauthorized message',
    });

    expect(events(user)).toContainEqual({
      event: 'dm.error',
      data: { message: 'Conversation not found' },
    });

    expect(f.directMessages.sendMessage).not.toHaveBeenCalled();
  });
});
