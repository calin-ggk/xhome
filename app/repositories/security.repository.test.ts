import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '~/db/schema';
import {
  getAllSecurities,
  getSecurityById,
  createSecurity,
  updateSecurity,
  deleteSecurity,
  isUsedByAccounts,
} from './security.repository';

const DDL = `
  CREATE TABLE currencies (
    id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL, symbol TEXT NOT NULL,
    decimal_places INTEGER NOT NULL DEFAULT 2, is_base INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE securities (
    id INTEGER PRIMARY KEY, ticker TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL, currency_id INTEGER NOT NULL,
    type TEXT NOT NULL, quantity_scale INTEGER NOT NULL DEFAULT 6
  );
  CREATE TABLE accounts (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL,
    type TEXT NOT NULL, account_type TEXT NOT NULL,
    currency_id INTEGER NOT NULL, category TEXT NOT NULL UNIQUE,
    is_active INTEGER NOT NULL DEFAULT 1, security_id INTEGER
  );
`;

function makeDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(DDL);
  sqlite.exec(`INSERT INTO currencies VALUES (1, 'USD', 'US Dollar', '$', 2, 1)`);
  sqlite.exec(`INSERT INTO securities VALUES (1, 'AAPL', 'Apple Inc.', 1, 'stock', 6)`);
  return { db: drizzle(sqlite, { schema }), sqlite };
}

describe('getAllSecurities', () => {
  it('returns securities with currency code', () => {
    const { db } = makeDb();
    const result = getAllSecurities(db);
    expect(result).toHaveLength(1);
    expect(result[0]!.ticker).toBe('AAPL');
    expect(result[0]!.currencyCode).toBe('USD');
  });

  it('returns them ordered by ticker', () => {
    const { db, sqlite } = makeDb();
    sqlite.exec(`INSERT INTO securities VALUES (2, 'BTC-USD', 'Bitcoin', 1, 'crypto', 8)`);
    expect(getAllSecurities(db).map(s => s.ticker)).toEqual(['AAPL', 'BTC-USD']);
  });
});

describe('getSecurityById', () => {
  it('returns the security when it exists', () => {
    const { db } = makeDb();
    expect(getSecurityById(db, 1)?.ticker).toBe('AAPL');
  });

  it('returns undefined for unknown id', () => {
    const { db } = makeDb();
    expect(getSecurityById(db, 999)).toBeUndefined();
  });
});

describe('createSecurity', () => {
  it('creates and returns a new security', () => {
    const { db } = makeDb();
    const result = createSecurity(db, { ticker: 'MSFT', name: 'Microsoft', currencyId: 1, type: 'stock', quantityScale: 6 });
    expect(result.ticker).toBe('MSFT');
    expect(result.id).toBeTruthy();
  });
});

describe('updateSecurity', () => {
  it('updates and returns the security', () => {
    const { db } = makeDb();
    const result = updateSecurity(db, 1, { name: 'Apple Updated' });
    expect(result?.name).toBe('Apple Updated');
  });

  it('returns undefined for unknown id', () => {
    const { db } = makeDb();
    expect(updateSecurity(db, 999, { name: 'X' })).toBeUndefined();
  });
});

describe('deleteSecurity', () => {
  it('deletes the security', () => {
    const { db } = makeDb();
    deleteSecurity(db, 1);
    expect(getSecurityById(db, 1)).toBeUndefined();
  });
});

describe('isUsedByAccounts', () => {
  it('returns false when not used', () => {
    const { db } = makeDb();
    expect(isUsedByAccounts(db, 1)).toBe(false);
  });

  it('returns true when used by an account', () => {
    const { db, sqlite } = makeDb();
    sqlite.exec(`INSERT INTO accounts VALUES (1, 'Apple Shares', 'debit', 'security', 1, 'asset/shares/aapl', 1, 1)`);
    expect(isUsedByAccounts(db, 1)).toBe(true);
  });
});
