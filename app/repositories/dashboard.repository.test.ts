import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '~/db/schema';
import { getNetWorthBase } from './dashboard.repository';

const DDL = `
  CREATE TABLE currencies (
    id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL, symbol TEXT NOT NULL,
    decimal_places INTEGER NOT NULL DEFAULT 2, is_base INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE accounts (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL,
    type TEXT NOT NULL, account_type TEXT NOT NULL,
    currency_id INTEGER NOT NULL, category TEXT NOT NULL UNIQUE,
    is_active INTEGER NOT NULL DEFAULT 1, security_id INTEGER
  );
  CREATE TABLE transactions (
    id INTEGER PRIMARY KEY, date TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    description TEXT, hash TEXT UNIQUE
  );
  CREATE TABLE transaction_entries (
    id INTEGER PRIMARY KEY,
    transaction_id INTEGER NOT NULL, account_id INTEGER NOT NULL,
    side TEXT NOT NULL, amount INTEGER NOT NULL, amount_base INTEGER NOT NULL,
    quantity INTEGER, interest_rate INTEGER, maturity_date TEXT, memo TEXT
  );
`;

function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(DDL);
  sqlite.exec(`
    INSERT INTO currencies VALUES (1, 'RON', 'Romanian Leu', 'RON', 2, 1);
    INSERT INTO accounts VALUES (1, 'Bank',   'debit',  'simple', 1, 'asset/bank/main',     1, NULL);
    INSERT INTO accounts VALUES (2, 'Loan',   'credit', 'simple', 1, 'liability/loan/main', 1, NULL);
    INSERT INTO accounts VALUES (3, 'Food',   'debit',  'simple', 1, 'expense/food',        1, NULL);
    INSERT INTO accounts VALUES (4, 'Salary', 'credit', 'simple', 1, 'income/salary',       1, NULL);
    INSERT INTO transactions VALUES (1, '2024-01-01', '2024-01-01 00:00:00', 'Test', NULL);
  `);
  return { db: drizzle(sqlite, { schema }), sqlite };
}

describe('getNetWorthBase', () => {
  it('returns 0 when no entries exist', () => {
    const { db } = createTestDb();
    expect(getNetWorthBase(db)).toBe(0);
  });

  it('counts debit entries on asset accounts as positive', () => {
    const { db, sqlite } = createTestDb();
    sqlite.exec(`INSERT INTO transaction_entries VALUES (1, 1, 1, 'debit', 10000, 10000, NULL, NULL, NULL, NULL)`);
    expect(getNetWorthBase(db)).toBe(10000);
  });

  it('subtracts credit entries on liability accounts from net worth', () => {
    const { db, sqlite } = createTestDb();
    sqlite.exec(`
      INSERT INTO transaction_entries VALUES (1, 1, 1, 'debit',  10000, 10000, NULL, NULL, NULL, NULL);
      INSERT INTO transaction_entries VALUES (2, 1, 2, 'credit',  3000,  3000, NULL, NULL, NULL, NULL);
    `);
    expect(getNetWorthBase(db)).toBe(7000);
  });

  it('ignores expense and income account entries', () => {
    const { db, sqlite } = createTestDb();
    sqlite.exec(`
      INSERT INTO transaction_entries VALUES (1, 1, 3, 'debit',  5000, 5000, NULL, NULL, NULL, NULL);
      INSERT INTO transaction_entries VALUES (2, 1, 4, 'credit', 5000, 5000, NULL, NULL, NULL, NULL);
    `);
    expect(getNetWorthBase(db)).toBe(0);
  });
});
