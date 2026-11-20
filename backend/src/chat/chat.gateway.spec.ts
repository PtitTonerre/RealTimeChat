import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';

import { ChatGateway } from './chat.gateway.js';
import { ChatService } from './chat.service.js';

function createMockClient() {
  const send = vi.fn();

  const client = {
    send,
    readyState: WebSocket.OPEN,
  } as unknown as WebSocket;

  return { client, send };
}

describe('ChatGateway', () => {
  let gateway: ChatGateway;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [ChatGateway, ChatService],
    }).compile();

    gateway = module.get<ChatGateway>(ChatGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  it('should join general on connection', () => {
    const { client, send } = createMockClient();

    gateway.handleConnection(client);

    expect(send).toHaveBeenCalledWith(
      JSON.stringify({
        event: 'chat.joined',
        data: { room: 'general' },
      }),
    );
  });

  it('should broadcast within general', () => {
    const first = createMockClient();
    const second = createMockClient();

    gateway.handleConnection(first.client);
    gateway.handleConnection(second.client);

    first.send.mockClear();
    second.send.mockClear();

    gateway.handleMessage(first.client, ' Hello! ');

    const expected = JSON.stringify({
      event: 'chat.message',
      data: { room: 'general', content: 'Hello!' },
    });

    expect(first.send).toHaveBeenCalledWith(expected);
    expect(second.send).toHaveBeenCalledWith(expected);
  });

  it('should isolate messages between rooms', () => {
    const first = createMockClient();
    const second = createMockClient();

    gateway.handleConnection(first.client);
    gateway.handleConnection(second.client);

    gateway.joinRoom(second.client, 'gaming');

    first.send.mockClear();
    second.send.mockClear();

    gateway.handleMessage(first.client, 'Hello general!');

    expect(first.send).toHaveBeenCalledOnce();
    expect(second.send).not.toHaveBeenCalled();

    first.send.mockClear();
    second.send.mockClear();

    gateway.handleMessage(second.client, 'Hello gaming!');

    expect(first.send).not.toHaveBeenCalled();
    expect(second.send).toHaveBeenCalledOnce();
  });

  it('should reject unknown rooms', () => {
    const { client, send } = createMockClient();

    gateway.handleConnection(client);
    send.mockClear();

    gateway.joinRoom(client, 'unknown-room');

    expect(send).toHaveBeenCalledWith(
      JSON.stringify({
        event: 'chat.error',
        data: { message: 'Unknown room' },
      }),
    );
  });

  it('should reject invalid messages', () => {
    const { client, send } = createMockClient();

    gateway.handleConnection(client);
    send.mockClear();

    gateway.handleMessage(client, '   ');

    expect(send).not.toHaveBeenCalled();
  });

  it('should ignore disconnected clients', () => {
    const first = createMockClient();
    const second = createMockClient();

    gateway.handleConnection(first.client);
    gateway.handleConnection(second.client);

    first.send.mockClear();
    second.send.mockClear();

    gateway.handleDisconnect(second.client);
    gateway.handleMessage(first.client, 'Hello!');

    expect(first.send).toHaveBeenCalledOnce();
    expect(second.send).not.toHaveBeenCalled();
  });
});