import 'dotenv/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { type INestApplication } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  const previousDatabaseUrl = process.env.DATABASE_URL;

  beforeAll(() => {
    const testUrl = process.env.TEST_DATABASE_URL;

    if (!testUrl) {
      throw new Error('TEST_DATABASE_URL is missing');
    }

    const database = new URL(testUrl);

    // Empêcher les tests de toucher à la base principale
    if (
      database.pathname !== '/realtimechat_test' ||
      !['localhost', '127.0.0.1'].includes(database.hostname)
    ) {
      throw new Error(
        'Refusing to run E2E tests on a non-test database',
      );
    }

    process.env.DATABASE_URL = testUrl;
  });

  beforeEach(async () => {
    const moduleFixture: TestingModule =
      await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

    app = moduleFixture.createNestApplication();

    // Configurer l'adaptateur WebSocket
    app.useWebSocketAdapter(new WsAdapter(app));

    await app.init();
  });

  it('/ (GET)', async () => {
    await request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  afterAll(() => {
    if (previousDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }
  });
});
