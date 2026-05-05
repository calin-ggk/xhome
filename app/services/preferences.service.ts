import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '~/db/schema';
import type { PreferencesFormData, ReportRange } from '~/schemas/preferences.schema';
import * as repo from '~/repositories/preferences.repository';
import { logger } from '~/lib/logger';

export type { ReportRange };

export function getPreferences(db: BetterSQLite3Database<typeof schema>) {
  return repo.getPreferences(db);
}

export function updatePreferences(
  db: BetterSQLite3Database<typeof schema>,
  data: PreferencesFormData,
): { ok: true } | { ok: false; error: string } {
  repo.upsertPreferences(db, data);
  logger.info({ event: 'preferences.updated', defaultReportRange: data.defaultReportRange });
  return { ok: true };
}

export function computeDateRange(range: ReportRange, today: string): { from: string | null; to: string | null } {
  if (range === 'all') return { from: null, to: null };

  const year  = parseInt(today.slice(0, 4), 10);
  const month = parseInt(today.slice(5, 7), 10);

  switch (range) {
    case 'current_month':
      return { from: `${today.slice(0, 7)}-01`, to: today };
    case 'current_year':
      return { from: `${year}-01-01`, to: today };
    case 'last_3_months':  return { from: `${subtractMonths(year, month, 3)}-01`,  to: today };
    case 'last_6_months':  return { from: `${subtractMonths(year, month, 6)}-01`,  to: today };
    case 'last_12_months': return { from: `${subtractMonths(year, month, 12)}-01`, to: today };
  }
}

function subtractMonths(year: number, month: number, count: number): string {
  let m = month - count;
  let y = year;
  while (m <= 0) { m += 12; y -= 1; }
  return `${y}-${String(m).padStart(2, '0')}`;
}
