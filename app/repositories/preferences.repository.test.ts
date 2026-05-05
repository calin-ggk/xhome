import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '~/db/schema';
import { getPreferences, upsertPreferences } from './preferences.repository';

const DDL = `
  CREATE TABLE user_preferences (
    id INTEGER PRIMARY KEY,
    default_report_range TEXT NOT NULL DEFAULT 'current_year'
  );
`;

function makeDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(DDL);
  return drizzle(sqlite, { schema });
}

describe('getPreferences', () => {
  it('returns default preferences when no row exists', () => {
    const db = makeDb();
    const prefs = getPreferences(db);
    expect(prefs).toEqual({ id: 1, defaultReportRange: 'current_year' });
  });

  it('returns stored preferences after upsert', () => {
    const db = makeDb();
    upsertPreferences(db, { defaultReportRange: 'last_6_months' });
    const prefs = getPreferences(db);
    expect(prefs.defaultReportRange).toBe('last_6_months');
  });
});

describe('upsertPreferences', () => {
  it('creates a preferences row on first call', () => {
    const db = makeDb();
    const result = upsertPreferences(db, { defaultReportRange: 'current_month' });
    expect(result.id).toBe(1);
    expect(result.defaultReportRange).toBe('current_month');
  });

  it('updates existing row on second call', () => {
    const db = makeDb();
    upsertPreferences(db, { defaultReportRange: 'current_month' });
    const result = upsertPreferences(db, { defaultReportRange: 'last_12_months' });
    expect(result.defaultReportRange).toBe('last_12_months');
  });

  it('keeps only one row after multiple upserts', () => {
    const db = makeDb();
    upsertPreferences(db, { defaultReportRange: 'current_month' });
    upsertPreferences(db, { defaultReportRange: 'last_3_months' });
    upsertPreferences(db, { defaultReportRange: 'last_6_months' });
    const prefs = getPreferences(db);
    expect(prefs.defaultReportRange).toBe('last_6_months');
  });
});
