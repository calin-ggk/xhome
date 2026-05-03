import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '~/db/schema';
import { getNetWorthBase, getRecentTransactions, getCurrentMonthSummary, getMonthlyCashFlow } from './dashboard.repository';

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

describe('getRecentTransactions', () => {
  it('returns empty array when no transactions exist', () => {
    const { db, sqlite } = createTestDb();
    sqlite.exec(`DELETE FROM transactions`);
    expect(getRecentTransactions(db)).toEqual([]);
  });

  it('returns transactions ordered by date descending', () => {
    const { db, sqlite } = createTestDb();
    sqlite.exec(`
      INSERT INTO transactions VALUES (2, '2024-03-01', '2024-03-01 00:00:00', 'March', NULL);
      INSERT INTO transactions VALUES (3, '2024-02-01', '2024-02-01 00:00:00', 'February', NULL);
      INSERT INTO transaction_entries VALUES (1, 1, 1, 'debit',  500,  500, NULL, NULL, NULL, NULL);
      INSERT INTO transaction_entries VALUES (2, 2, 1, 'debit', 1000, 1000, NULL, NULL, NULL, NULL);
      INSERT INTO transaction_entries VALUES (3, 3, 1, 'debit',  750,  750, NULL, NULL, NULL, NULL);
    `);
    const result = getRecentTransactions(db);
    expect(result[0]?.date).toBe('2024-03-01');
    expect(result[1]?.date).toBe('2024-02-01');
    expect(result[2]?.date).toBe('2024-01-01');
  });

  it('sums debit entries as totalBase per transaction', () => {
    const { db, sqlite } = createTestDb();
    sqlite.exec(`
      INSERT INTO transaction_entries VALUES (1, 1, 1, 'debit',  8000, 8000, NULL, NULL, NULL, NULL);
      INSERT INTO transaction_entries VALUES (2, 1, 4, 'credit', 8000, 8000, NULL, NULL, NULL, NULL);
    `);
    const result = getRecentTransactions(db);
    expect(result[0]?.totalBase).toBe(8000);
  });

  it('respects the limit parameter', () => {
    const { db, sqlite } = createTestDb();
    for (let i = 2; i <= 15; i++) {
      sqlite.exec(`INSERT INTO transactions VALUES (${i}, '2024-01-${String(i).padStart(2, '0')}', '2024-01-${String(i).padStart(2, '0')} 00:00:00', 'T${i}', NULL)`);
      sqlite.exec(`INSERT INTO transaction_entries VALUES (${i}, ${i}, 1, 'debit', 100, 100, NULL, NULL, NULL, NULL)`);
    }
    sqlite.exec(`INSERT INTO transaction_entries VALUES (1, 1, 1, 'debit', 100, 100, NULL, NULL, NULL, NULL)`);
    expect(getRecentTransactions(db, 5)).toHaveLength(5);
  });
});

describe('getCurrentMonthSummary', () => {
  it('returns zeros when no entries exist', () => {
    const { db } = createTestDb();
    expect(getCurrentMonthSummary(db, '2024-01-01')).toEqual({ income: 0, expenses: 0 });
  });

  it('sums income credit entries from the given month', () => {
    const { db, sqlite } = createTestDb();
    sqlite.exec(`INSERT INTO transaction_entries VALUES (1, 1, 4, 'credit', 5000, 5000, NULL, NULL, NULL, NULL)`);
    expect(getCurrentMonthSummary(db, '2024-01-01').income).toBe(5000);
  });

  it('sums expense debit entries from the given month', () => {
    const { db, sqlite } = createTestDb();
    sqlite.exec(`INSERT INTO transaction_entries VALUES (1, 1, 3, 'debit', 1200, 1200, NULL, NULL, NULL, NULL)`);
    expect(getCurrentMonthSummary(db, '2024-01-01').expenses).toBe(1200);
  });

  it('excludes transactions before the start date', () => {
    const { db, sqlite } = createTestDb();
    sqlite.exec(`INSERT INTO transaction_entries VALUES (1, 1, 4, 'credit', 5000, 5000, NULL, NULL, NULL, NULL)`);
    expect(getCurrentMonthSummary(db, '2024-02-01').income).toBe(0);
  });
});

describe('getMonthlyCashFlow', () => {
  it('returns empty array when no entries exist', () => {
    const { db, sqlite } = createTestDb();
    sqlite.exec(`DELETE FROM transaction_entries`);
    expect(getMonthlyCashFlow(db, '2024-01-01')).toEqual([]);
  });

  it('groups income and expenses by month', () => {
    const { db, sqlite } = createTestDb();
    sqlite.exec(`
      INSERT INTO transactions VALUES (2, '2024-02-01', '2024-02-01 00:00:00', 'Feb', NULL);
      INSERT INTO transaction_entries VALUES (1, 1, 4, 'credit', 5000, 5000, NULL, NULL, NULL, NULL);
      INSERT INTO transaction_entries VALUES (2, 2, 4, 'credit', 3000, 3000, NULL, NULL, NULL, NULL);
      INSERT INTO transaction_entries VALUES (3, 1, 3, 'debit',  2000, 2000, NULL, NULL, NULL, NULL);
    `);
    const result = getMonthlyCashFlow(db, '2024-01-01');
    const jan = result.find(r => r.month === '2024-01');
    const feb = result.find(r => r.month === '2024-02');
    expect(jan?.income).toBe(5000);
    expect(jan?.expenses).toBe(2000);
    expect(feb?.income).toBe(3000);
    expect(feb?.expenses).toBe(0);
  });

  it('excludes transactions before the start date', () => {
    const { db, sqlite } = createTestDb();
    sqlite.exec(`INSERT INTO transaction_entries VALUES (1, 1, 4, 'credit', 5000, 5000, NULL, NULL, NULL, NULL)`);
    const result = getMonthlyCashFlow(db, '2024-02-01');
    expect(result).toHaveLength(0);
  });

  it('returns months in ascending order', () => {
    const { db, sqlite } = createTestDb();
    sqlite.exec(`
      INSERT INTO transactions VALUES (2, '2024-03-01', '2024-03-01 00:00:00', 'Mar', NULL);
      INSERT INTO transactions VALUES (3, '2024-02-01', '2024-02-01 00:00:00', 'Feb', NULL);
      INSERT INTO transaction_entries VALUES (1, 1, 4,  'credit', 1000, 1000, NULL, NULL, NULL, NULL);
      INSERT INTO transaction_entries VALUES (2, 2, 4,  'credit', 1000, 1000, NULL, NULL, NULL, NULL);
      INSERT INTO transaction_entries VALUES (3, 3, 4,  'credit', 1000, 1000, NULL, NULL, NULL, NULL);
    `);
    const result = getMonthlyCashFlow(db, '2024-01-01');
    expect(result.map(r => r.month)).toEqual(['2024-01', '2024-02', '2024-03']);
  });
});
