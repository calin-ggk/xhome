import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { userPreferences } from '~/db/schema';
import type { UserPreferences } from '~/db/schema';
import type * as schema from '~/db/schema';

const PREFS_ID = 1;
const DEFAULT_PREFS: UserPreferences = { id: PREFS_ID, defaultReportRange: 'current_year' };

export function getPreferences(
  db: BetterSQLite3Database<typeof schema>,
): UserPreferences {
  return db.select().from(userPreferences).where(eq(userPreferences.id, PREFS_ID)).get() ?? DEFAULT_PREFS;
}

export function upsertPreferences(
  db: BetterSQLite3Database<typeof schema>,
  data: { defaultReportRange: string },
): UserPreferences {
  const result = db
    .insert(userPreferences)
    .values({ id: PREFS_ID, defaultReportRange: data.defaultReportRange })
    .onConflictDoUpdate({ target: userPreferences.id, set: { defaultReportRange: data.defaultReportRange } })
    .returning()
    .all();
  return result[0]!;
}
