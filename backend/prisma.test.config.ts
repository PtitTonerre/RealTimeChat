import 'dotenv/config';
import { defineConfig } from 'prisma/config';

const url = process.env.TEST_DATABASE_URL;

if (!url) {
  throw new Error('TEST_DATABASE_URL is missing');
}

const database = new URL(url);

if (
  database.pathname !== '/realtimechat_test' ||
  !['localhost', '127.0.0.1'].includes(database.hostname)
) {
  throw new Error('Refusing to use a non-test database');
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url,
  },
});
