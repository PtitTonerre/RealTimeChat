import 'dotenv/config';

const testUrl = process.env.TEST_DATABASE_URL;

if (!testUrl) {
  throw new Error('TEST_DATABASE_URL is missing');
}

const database = new URL(testUrl);

if (
  database.pathname !== '/realtimechat_test' ||
  !['localhost', '127.0.0.1'].includes(database.hostname)
) {
  throw new Error(
    'Refusing to run E2E tests on a non-test database',
  );
}

process.env.DATABASE_URL = testUrl;
