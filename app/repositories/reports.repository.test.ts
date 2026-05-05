import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '~/db/schema';
import {
  hasSnapshotForDate,
  getBalanceSheetFromSnapshots,
  getBalanceSheetLive,
  getIncomeStatementData,
  getNetWorthHistory,
  getSecuritiesHistory,
} from './reports.repository';

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
  CREATE TABLE account_monthly_snapshots (
    id INTEGER PRIMARY KEY,
    account_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    balance INTEGER NOT NULL,
    balance_base INTEGER NOT NULL
  );
`;

function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(DDL);
  sqlite.exec(`
    INSERT INTO currencies VALUES (1, 'RON', 'Romanian Leu', 'RON', 2, 1);
    INSERT INTO accounts VALUES (1, 'Bank',    'debit',  'simple', 1, 'asset/bank/main',       1, NULL);
    INSERT INTO accounts VALUES (2, 'Loan',    'credit', 'simple', 1, 'liability/loan/main',   1, NULL);
    INSERT INTO accounts VALUES (3, 'Opening', 'credit', 'simple', 1, 'equity/opening-balance',1, NULL);
    INSERT INTO accounts VALUES (4, 'Salary',  'credit', 'simple', 1, 'income/salary',         1, NULL);
    INSERT INTO accounts VALUES (5, 'Food',    'debit',  'simple', 1, 'expense/food',          1, NULL);
    INSERT INTO transactions VALUES (1, '2024-01-01', '2024-01-01 00:00:00', 'Opening', NULL);
    INSERT INTO transactions VALUES (2, '2024-01-15', '2024-01-15 00:00:00', 'Salary',  NULL);
    INSERT INTO transactions VALUES (3, '2024-01-20', '2024-01-20 00:00:00', 'Food',    NULL);
  `);
  return { db: drizzle(sqlite, { schema }), sqlite };
}

describe('hasSnapshotForDate', () => {
  it('returns false when no snapshots exist', () => {
    const { db } = createTestDb();
    expect(hasSnapshotForDate(db, '2024-02-01')).toBe(false);
  });

  it('returns true when a snapshot exists for the date', () => {
    const { db, sqlite } = createTestDb();
    sqlite.exec(`INSERT INTO account_monthly_snapshots VALUES (1, 1, '2024-02-01', 100000, 100000)`);
    expect(hasSnapshotForDate(db, '2024-02-01')).toBe(true);
  });

  it('returns false for a different snapshot date', () => {
    const { db, sqlite } = createTestDb();
    sqlite.exec(`INSERT INTO account_monthly_snapshots VALUES (1, 1, '2024-02-01', 100000, 100000)`);
    expect(hasSnapshotForDate(db, '2024-03-01')).toBe(false);
  });
});

describe('getBalanceSheetFromSnapshots', () => {
  it('returns empty array when no snapshots exist', () => {
    const { db } = createTestDb();
    expect(getBalanceSheetFromSnapshots(db, '2024-02-01')).toEqual([]);
  });

  it('returns asset and liability snapshot rows', () => {
    const { db, sqlite } = createTestDb();
    sqlite.exec(`
      INSERT INTO account_monthly_snapshots VALUES (1, 1, '2024-02-01', 200000, 200000);
      INSERT INTO account_monthly_snapshots VALUES (2, 2, '2024-02-01', -50000, -50000);
    `);
    const rows = getBalanceSheetFromSnapshots(db, '2024-02-01');
    expect(rows).toHaveLength(2);
    const bank = rows.find(r => r.category === 'asset/bank/main');
    const loan = rows.find(r => r.category === 'liability/loan/main');
    expect(bank?.balanceBase).toBe(200000);
    expect(loan?.balanceBase).toBe(-50000);
  });

  it('excludes income and expense accounts from snapshots', () => {
    const { db, sqlite } = createTestDb();
    sqlite.exec(`
      INSERT INTO account_monthly_snapshots VALUES (1, 1, '2024-02-01', 100000, 100000);
      INSERT INTO account_monthly_snapshots VALUES (2, 4, '2024-02-01',  50000,  50000);
      INSERT INTO account_monthly_snapshots VALUES (3, 5, '2024-02-01',  20000,  20000);
    `);
    const rows = getBalanceSheetFromSnapshots(db, '2024-02-01');
    expect(rows.every(r => !r.category.startsWith('income/') && !r.category.startsWith('expense/'))).toBe(true);
  });

  it('only returns rows for the exact snapshot date', () => {
    const { db, sqlite } = createTestDb();
    sqlite.exec(`
      INSERT INTO account_monthly_snapshots VALUES (1, 1, '2024-02-01', 100000, 100000);
      INSERT INTO account_monthly_snapshots VALUES (2, 1, '2024-03-01', 120000, 120000);
    `);
    const rows = getBalanceSheetFromSnapshots(db, '2024-02-01');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.balanceBase).toBe(100000);
  });
});

describe('getBalanceSheetLive', () => {
  it('returns empty array when no entries exist', () => {
    const { db } = createTestDb();
    expect(getBalanceSheetLive(db, '2024-12-31')).toEqual([]);
  });

  it('sums debit entries as positive balance for asset accounts', () => {
    const { db, sqlite } = createTestDb();
    sqlite.exec(`INSERT INTO transaction_entries VALUES (1, 1, 1, 'debit', 100000, 100000, NULL, NULL, NULL, NULL)`);
    const rows = getBalanceSheetLive(db, '2024-12-31');
    const bank = rows.find(r => r.category === 'asset/bank/main');
    expect(bank?.balanceBase).toBe(100000);
  });

  it('stores liability balance as negative (credit side)', () => {
    const { db, sqlite } = createTestDb();
    sqlite.exec(`
      INSERT INTO transaction_entries VALUES (1, 1, 1, 'debit',  100000, 100000, NULL, NULL, NULL, NULL);
      INSERT INTO transaction_entries VALUES (2, 1, 2, 'credit',  50000,  50000, NULL, NULL, NULL, NULL);
    `);
    const rows = getBalanceSheetLive(db, '2024-12-31');
    const loan = rows.find(r => r.category === 'liability/loan/main');
    expect(loan?.balanceBase).toBe(-50000);
  });

  it('excludes entries after asOfDate', () => {
    const { db, sqlite } = createTestDb();
    sqlite.exec(`INSERT INTO transaction_entries VALUES (1, 2, 1, 'debit', 100000, 100000, NULL, NULL, NULL, NULL)`);
    const rows = getBalanceSheetLive(db, '2024-01-14');
    expect(rows).toEqual([]);
  });

  it('includes entries on asOfDate', () => {
    const { db, sqlite } = createTestDb();
    sqlite.exec(`INSERT INTO transaction_entries VALUES (1, 1, 1, 'debit', 100000, 100000, NULL, NULL, NULL, NULL)`);
    const rows = getBalanceSheetLive(db, '2024-01-01');
    expect(rows).toHaveLength(1);
  });

  it('excludes income and expense accounts', () => {
    const { db, sqlite } = createTestDb();
    sqlite.exec(`
      INSERT INTO transaction_entries VALUES (1, 2, 4, 'credit', 50000, 50000, NULL, NULL, NULL, NULL);
      INSERT INTO transaction_entries VALUES (2, 3, 5, 'debit',  20000, 20000, NULL, NULL, NULL, NULL);
    `);
    const rows = getBalanceSheetLive(db, '2024-12-31');
    expect(rows.every(r => !r.category.startsWith('income/') && !r.category.startsWith('expense/'))).toBe(true);
  });
});

describe('getIncomeStatementData', () => {
  it('returns empty array when no entries in range', () => {
    const { db } = createTestDb();
    expect(getIncomeStatementData(db, '2025-01-01', '2025-12-31')).toEqual([]);
  });

  it('counts income credit entries as positive', () => {
    const { db, sqlite } = createTestDb();
    sqlite.exec(`INSERT INTO transaction_entries VALUES (1, 2, 4, 'credit', 50000, 50000, NULL, NULL, NULL, NULL)`);
    const rows = getIncomeStatementData(db, '2024-01-01', '2024-12-31');
    const salary = rows.find(r => r.category === 'income/salary');
    expect(salary?.totalBase).toBe(50000);
  });

  it('counts expense debit entries as positive', () => {
    const { db, sqlite } = createTestDb();
    sqlite.exec(`INSERT INTO transaction_entries VALUES (1, 3, 5, 'debit', 20000, 20000, NULL, NULL, NULL, NULL)`);
    const rows = getIncomeStatementData(db, '2024-01-01', '2024-12-31');
    const food = rows.find(r => r.category === 'expense/food');
    expect(food?.totalBase).toBe(20000);
  });

  it('nets income debit entries (refunds) against credits', () => {
    const { db, sqlite } = createTestDb();
    sqlite.exec(`
      INSERT INTO transaction_entries VALUES (1, 2, 4, 'credit', 50000, 50000, NULL, NULL, NULL, NULL);
      INSERT INTO transaction_entries VALUES (2, 2, 4, 'debit',   5000,  5000, NULL, NULL, NULL, NULL);
    `);
    const rows = getIncomeStatementData(db, '2024-01-01', '2024-12-31');
    const salary = rows.find(r => r.category === 'income/salary');
    expect(salary?.totalBase).toBe(45000);
  });

  it('excludes entries outside the date range', () => {
    const { db, sqlite } = createTestDb();
    sqlite.exec(`INSERT INTO transaction_entries VALUES (1, 2, 4, 'credit', 50000, 50000, NULL, NULL, NULL, NULL)`);
    const rows = getIncomeStatementData(db, '2024-02-01', '2024-12-31');
    expect(rows).toEqual([]);
  });

  it('excludes asset and liability accounts', () => {
    const { db, sqlite } = createTestDb();
    sqlite.exec(`INSERT INTO transaction_entries VALUES (1, 1, 1, 'debit', 100000, 100000, NULL, NULL, NULL, NULL)`);
    const rows = getIncomeStatementData(db, '2024-01-01', '2024-12-31');
    expect(rows.every(r => r.category.startsWith('income/') || r.category.startsWith('expense/'))).toBe(true);
  });
});

describe('getNetWorthHistory', () => {
  it('returns empty when no snapshots', () => {
    const { db } = createTestDb();
    expect(getNetWorthHistory(db)).toEqual([]);
  });

  it('sums asset and liability balances per snapshot date', () => {
    const { db, sqlite } = createTestDb();
    sqlite.exec(`
      INSERT INTO account_monthly_snapshots VALUES (1, 1, '2024-02-01', 200000, 200000);
      INSERT INTO account_monthly_snapshots VALUES (2, 2, '2024-02-01', -50000, -50000);
    `);
    const rows = getNetWorthHistory(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.date).toBe('2024-02-01');
    expect(rows[0]?.netWorthBase).toBe(150000);
  });

  it('returns one point per snapshot date, ordered chronologically', () => {
    const { db, sqlite } = createTestDb();
    sqlite.exec(`
      INSERT INTO account_monthly_snapshots VALUES (1, 1, '2024-03-01', 300000, 300000);
      INSERT INTO account_monthly_snapshots VALUES (2, 1, '2024-02-01', 200000, 200000);
    `);
    const rows = getNetWorthHistory(db);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.date).toBe('2024-02-01');
    expect(rows[1]?.date).toBe('2024-03-01');
  });

  it('excludes income and expense account snapshots', () => {
    const { db, sqlite } = createTestDb();
    sqlite.exec(`
      INSERT INTO account_monthly_snapshots VALUES (1, 4, '2024-02-01', 50000, 50000);
      INSERT INTO account_monthly_snapshots VALUES (2, 5, '2024-02-01', 20000, 20000);
    `);
    const rows = getNetWorthHistory(db);
    expect(rows).toEqual([]);
  });
});

describe('getSecuritiesHistory', () => {
  function createSecurityTestDb() {
    const { db, sqlite } = createTestDb();
    sqlite.exec(`
      INSERT INTO securities VALUES (1, 'AAPL', 'Apple Inc', 1, 'stock', 6);
      INSERT INTO accounts VALUES (6, 'My Apple', 'debit', 'security', 1, 'asset/brokerage/aapl', 1, 1);
    `);
    return { db, sqlite };
  }

  it('returns empty when no security snapshots', () => {
    const { db } = createSecurityTestDb();
    expect(getSecuritiesHistory(db)).toEqual([]);
  });

  it('returns security account snapshot data with ticker info', () => {
    const { db, sqlite } = createSecurityTestDb();
    sqlite.exec(`INSERT INTO account_monthly_snapshots VALUES (1, 6, '2024-02-01', 100000, 100000)`);
    const rows = getSecuritiesHistory(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.ticker).toBe('AAPL');
    expect(rows[0]?.accountName).toBe('My Apple');
    expect(rows[0]?.balanceBase).toBe(100000);
    expect(rows[0]?.date).toBe('2024-02-01');
  });

  it('returns multiple points across dates, ordered by date', () => {
    const { db, sqlite } = createSecurityTestDb();
    sqlite.exec(`
      INSERT INTO account_monthly_snapshots VALUES (1, 6, '2024-03-01', 120000, 120000);
      INSERT INTO account_monthly_snapshots VALUES (2, 6, '2024-02-01', 100000, 100000);
    `);
    const rows = getSecuritiesHistory(db);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.date).toBe('2024-02-01');
    expect(rows[1]?.date).toBe('2024-03-01');
  });

  it('excludes non-security accounts', () => {
    const { db, sqlite } = createSecurityTestDb();
    sqlite.exec(`INSERT INTO account_monthly_snapshots VALUES (1, 1, '2024-02-01', 200000, 200000)`);
    const rows = getSecuritiesHistory(db);
    expect(rows).toEqual([]);
  });
});
