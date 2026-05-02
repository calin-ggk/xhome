import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '~/db/schema';
import { getNetWorthBase } from '~/repositories/dashboard.repository';

export function getNetWorth(db: BetterSQLite3Database<typeof schema>): number {
  return getNetWorthBase(db);
}
