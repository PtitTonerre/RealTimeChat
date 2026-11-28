import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import WebSocket from 'ws';

import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest';

import { createTestApp } from './create-test-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const ORIGIN = 'http://localhost:5173';

interface TestAccount {
  id: string;
  cookie: string;
}

interface SocketEvent {
  event: string;
  data: unknown;
}

describe('Direct messages - HTTP security (e2e)', () => {
  let app: INestApplication;

  let alice: TestAccount;
  let bob: TestAccount;
  let charlie: TestAccount;

  let conversationId: string;

  const createdUserIds: string[] = [];

  async function createAccount(
    prefix: string,
  ): Promise<TestAccount> {
    const suffix = randomUUID()
      .replaceAll('-', '')
      .slice(0, 12);

    const credentials = {
      username: `${prefix}${suffix}`,
      email: `${prefix}-${suffix}@example.invalid`,
      password: 'TestPassword12345!',
    };

    const registration = await request(
      app.getHttpServer(),
    )
      .post('/auth/register')
      .send(credentials)
      .expect(201);

    const userId = registration.body.id as string;
    createdUserIds.push(userId);

    const login = await request(
      app.getHttpServer(),
    )
      .post('/auth/login')
      .send({
        email: credentials.email,
        password: credentials.password,
      })
      .expect(200);

    const cookies = login.headers['set-cookie'];

    const sessionCookie = (
      Array.isArray(cookies)
        ? cookies
        : [cookies]
    )
      .find(
        (cookie): cookie is string =>
          typeof cookie === 'string' &&
          cookie.startsWith('rtc_session='),
      )
      ?.split(';')[0];

    expect(sessionCookie).toBeDefined();

    return {
      id: userId,
      cookie: sessionCookie!,
    };
  }

  beforeAll(async () => {
    app = await createTestApp();

    alice = await createAccount('alice');
    bob = await createAccount('bob');
    charlie = await createAccount('charlie');

    const conversation = await request(
      app.getHttpServer(),
    )
      .post('/dm/conversations')
      .set('Cookie', alice.cookie)
      .set('Origin', ORIGIN)
      .send({
        otherUserId: charlie.id,
      })
      .expect(201);

    conversationId = conversation.body.id as string;

    await request(app.getHttpServer())
      .post(
        `/dm/conversations/${conversationId}/messages`,
      )
      .set('Cookie', alice.cookie)
      .set('Origin', ORIGIN)
      .send({
        content: 'Private message from Alice',
      })
      .expect(201);
  });

  afterAll(async () => {
    try {
      if (app) {
        const prisma = app.get(PrismaService);

        if (createdUserIds.length > 0) {
          await prisma.user.deleteMany({
            where: {
              id: {
                in: createdUserIds,
              },
            },
          });
        }
      }
    } finally {
      if (app) {
        await app.close();
      }
    }
  });

  it('allows participants to read their conversation', async () => {
    const response = await request(
      app.getHttpServer(),
    )
      .get(
        `/dm/conversations/${conversationId}/messages`,
      )
      .set('Cookie', charlie.cookie)
      .expect(200);

    expect(response.body.messages).toHaveLength(1);

    expect(response.body.messages[0].content)
      .toBe('Private message from Alice');
  });

  it('forbids Bob from reading the conversation', async () => {
    await request(app.getHttpServer())
      .get(
        `/dm/conversations/${conversationId}/messages`,
      )
      .set('Cookie', bob.cookie)
      .expect(404);
  });

  it('forbids Bob from sending private messages', async () => {
    await request(app.getHttpServer())
      .post(
        `/dm/conversations/${conversationId}/messages`,
      )
      .set('Cookie', bob.cookie)
      .set('Origin', ORIGIN)
      .send({
        content: 'Unauthorized message',
      })
      .expect(404);

    const response = await request(
      app.getHttpServer(),
    )
      .get(
        `/dm/conversations/${conversationId}/messages`,
      )
      .set('Cookie', alice.cookie)
      .expect(200);

    expect(response.body.messages).toHaveLength(1);
  });

  it('hides the conversation from Bob', async () => {
    const response = await request(
      app.getHttpServer(),
    )
      .get('/dm/conversations')
      .set('Cookie', bob.cookie)
      .expect(200);

    const visible = (
      response.body as Array<{ id: string }>
    ).some(
      (conversation) =>
        conversation.id === conversationId,
    );

    expect(visible).toBe(false);
  });

  it('rejects unauthenticated access', async () => {
    await request(app.getHttpServer())
      .get('/dm/conversations')
      .expect(401);

    await request(app.getHttpServer())
      .get(
        `/dm/conversations/${conversationId}/messages`,
      )
      .expect(401);

    await request(app.getHttpServer())
      .post(
        `/dm/conversations/${conversationId}/messages`,
      )
      .set('Origin', ORIGIN)
      .send({
        content: 'Anonymous message',
      })
      .expect(401);
  });

  it('broadcasts HTTP messages over WebSocket', async () => {
    await app.listen(0, '127.0.0.1');

    const address = app
      .getHttpServer()
      .address() as AddressInfo;

    const socket = new WebSocket(
      `ws://127.0.0.1:${address.port}/ws`,
      {
        headers: {
          Origin: ORIGIN,
          Cookie: charlie.cookie,
        },
      },
    );

    try {
      await new Promise<void>((resolve, reject) => {
        socket.once('open', () => resolve());
        socket.once('error', reject);
      });

      const received = new Promise<SocketEvent>(
        (resolve, reject) => {
          const timeout = setTimeout(() => {
            socket.off('message', onMessage);
            reject(
              new Error('WebSocket message timeout'),
            );
          }, 3000);

          function onMessage(raw: WebSocket.RawData) {
            let payload: SocketEvent;

            try {
              payload = JSON.parse(
                raw.toString(),
              ) as SocketEvent;
            } catch {
              return;
            }

            if (payload.event !== 'dm.message') {
              return;
            }

            clearTimeout(timeout);
            socket.off('message', onMessage);
            resolve(payload);
          }

          socket.on('message', onMessage);
        },
      );

      const response = await request(
        app.getHttpServer(),
      )
        .post(
          `/dm/conversations/${conversationId}/messages`,
        )
        .set('Cookie', alice.cookie)
        .set('Origin', ORIGIN)
        .send({
          content: 'Message sent through HTTP',
        })
        .expect(201);

      await expect(received).resolves.toMatchObject({
        event: 'dm.message',
        data: {
          id: response.body.id,
          conversationId,
          content: 'Message sent through HTTP',
          sender: {
            id: alice.id,
          },
        },
      });
    } finally {
      socket.terminate();
    }
  });
});
