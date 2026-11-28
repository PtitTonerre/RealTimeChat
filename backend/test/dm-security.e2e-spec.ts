import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

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

    const registration = await request(app.getHttpServer())
      .post('/auth/register')
      .send(credentials)
      .expect(201);

    const userId = registration.body.id as string;
    createdUserIds.push(userId);

    const login = await request(app.getHttpServer())
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

    // Create real accounts through the HTTP API.
    alice = await createAccount('alice');
    bob = await createAccount('bob');
    charlie = await createAccount('charlie');

    // Alice creates a conversation with Charlie.
    const conversation = await request(app.getHttpServer())
      .post('/dm/conversations')
      .set('Cookie', alice.cookie)
      .set('Origin', ORIGIN)
      .send({
        otherUserId: charlie.id,
      })
      .expect(201);

    conversationId = conversation.body.id as string;

    // Alice sends an initial message.
    await request(app.getHttpServer())
      .post(`/dm/conversations/${conversationId}/messages`)
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
              id: { in: createdUserIds },
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
    const response = await request(app.getHttpServer())
      .get(`/dm/conversations/${conversationId}/messages`)
      .set('Cookie', charlie.cookie)
      .expect(200);

    expect(response.body.messages).toHaveLength(1);

    expect(response.body.messages[0].content)
      .toBe('Private message from Alice');
  });

  it('forbids Bob from reading the conversation', async () => {
    await request(app.getHttpServer())
      .get(`/dm/conversations/${conversationId}/messages`)
      .set('Cookie', bob.cookie)
      .expect(404);
  });

  it('forbids Bob from sending private messages', async () => {
    await request(app.getHttpServer())
      .post(`/dm/conversations/${conversationId}/messages`)
      .set('Cookie', bob.cookie)
      .set('Origin', ORIGIN)
      .send({
        content: 'Unauthorized message',
      })
      .expect(404);

    // Check that the rejected message was not saved.
    const response = await request(app.getHttpServer())
      .get(`/dm/conversations/${conversationId}/messages`)
      .set('Cookie', alice.cookie)
      .expect(200);

    expect(response.body.messages).toHaveLength(1);
  });

  it('hides the conversation from Bob', async () => {
    const response = await request(app.getHttpServer())
      .get('/dm/conversations')
      .set('Cookie', bob.cookie)
      .expect(200);

    const visible = (
      response.body as Array<{ id: string }>
    ).some(
      (conversation) => conversation.id === conversationId,
    );

    expect(visible).toBe(false);
  });

  it('rejects unauthenticated access', async () => {
    await request(app.getHttpServer())
      .get('/dm/conversations')
      .expect(401);

    await request(app.getHttpServer())
      .get(`/dm/conversations/${conversationId}/messages`)
      .expect(401);

    await request(app.getHttpServer())
      .post(`/dm/conversations/${conversationId}/messages`)
      .set('Origin', ORIGIN)
      .send({
        content: 'Anonymous message',
      })
      .expect(401);
  });
});
