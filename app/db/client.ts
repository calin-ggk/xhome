import { drizzle } from 'drizzle-orm/better-sqlite3';
import { env } from '~/config';
import * as schema from './schema';

const db = drizzle({
    connection: { source: env.DATABASE_URL },
    schema,
    logger: true
});

export { db };
