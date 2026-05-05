import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '~/db/schema';
import {
  getBalanceSheet,
  getIncomeStatement,
  getNetWorthHistoryData,
  getSpendingTreeData,
  getSecuritiesHistoryData,
} from './reports.service';

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
    INSERT INTO transactions VALUES (1, '2024-01-01', '2024-01-01', 'Opening', NULL);
    INSERT INTO transactions VALUES (2, '2024-01-15', '2024-01-15', 'Salary',  NULL);
    INSERT INTO transactions VALUES (3, '2024-01-20', '2024-01-20', 'Food',    NULL);
  `);
  return { db: drizzle(sqlite, { schema }), sqlite };
}

describe('getBalanceSheet', () => {
  it('uses live computation when no snapshot exists', () => {
    const { db, sqlite } = createTestDb();
    sqlite.exec(`
      INSERT INTO transaction_entries VALUES (1, 1, 1, 'debit',   100000, 100000, NULL, NULL, NULL, NULL);
      INSERT INTO transaction_entries VALUES (2, 1, 2, 'credit',   30000,  30000, NULL, NULL, NULL, NULL);
    `);
    const result = getBalanceSheet(db, '2024-01', '2024-01-31');
    expect(result.isSnapshot).toBe(false);
    expect(result.assets.total).toBe(100000);
    expect(result.liabilities.total).toBe(30000);
    expect(result.netWorth).toBe(70000);
  });

  it('uses snapshot data when snapshot exists', () => {
    const { db, sqlite } = createTestDb();
    sqlite.exec(`
      INSERT INTO account_monthly_snapshots VALUES (1, 1, '2024-02-01', 100000, 100000);
      INSERT INTO account_monthly_snapshots VALUES (2, 2, '2024-02-01', -30000, -30000);
    `);
    const result = getBalanceSheet(db, '2024-01', '2024-01-31');
    expect(result.isSnapshot).toBe(true);
    expect(result.assets.total).toBe(100000);
    expect(result.liabilities.total).toBe(30000);
    expect(result.netWorth).toBe(70000);
  });

  it('flips liability balances to positive for display', () => {
    const { db, sqlite } = createTestDb();
    sqlite.exec(`
      INSERT INTO transaction_entries VALUES (1, 1, 1, 'debit',  50000, 50000, NULL, NULL, NULL, NULL);
      INSERT INTO transaction_entries VALUES (2, 1, 2, 'credit', 20000, 20000, NULL, NULL, NULL, NULL);
    `);
    const result = getBalanceSheet(db, '2024-01', '2024-01-31');
    // Loan stored as -20000, should be displayed as +20000
    expect(result.liabilities.accounts[0]?.balanceBase).toBe(20000);
  });

  it('filters out zero-balance accounts', () => {
    const { db, sqlite } = createTestDb();
    sqlite.exec(`
      INSERT INTO transaction_entries VALUES (1, 1, 1, 'debit',  50000, 50000, NULL, NULL, NULL, NULL);
      INSERT INTO transaction_entries VALUES (2, 1, 1, 'credit', 50000, 50000, NULL, NULL, NULL, NULL);
    `);
    const result = getBalanceSheet(db, '2024-01', '2024-01-31');
    expect(result.assets.accounts).toHaveLength(0);
  });

  it('caps live asOfDate at today for current month, excluding future entries', () => {
    const { db, sqlite } = createTestDb();
    // transaction 2 is dated 2024-01-15, today is 2024-01-10 → should be excluded
    sqlite.exec(`
      INSERT INTO transaction_entries VALUES (1, 2, 1, 'debit', 100000, 100000, NULL, NULL, NULL, NULL);
    `);
    const result = getBalanceSheet(db, '2024-01', '2024-01-10');
    expect(result.asOfDate).toBe('2024-01-10');
    expect(result.assets.total).toBe(0);
  });

  it('uses last day of month as asOfDate for past months without snapshot', () => {
    const { db, sqlite } = createTestDb();
    // Entry on 2024-01-01 (January), querying for December 2023 — should find nothing
    const result = getBalanceSheet(db, '2023-12', '2024-01-31');
    expect(result.asOfDate).toBe('2023-12-31');
    expect(result.assets.total).toBe(0);
  });
});

describe('getIncomeStatement', () => {
  it('returns zero totals when no entries in range', () => {
    const { db } = createTestDb();
    const result = getIncomeStatement(db, '2025-01-01', '2025-12-31');
    expect(result.income.total).toBe(0);
    expect(result.expenses.total).toBe(0);
    expect(result.netIncome).toBe(0);
  });

  it('sums income and expenses correctly', () => {
    const { db, sqlite } = createTestDb();
    sqlite.exec(`
      INSERT INTO transaction_entries VALUES (1, 2, 4, 'credit', 50000, 50000, NULL, NULL, NULL, NULL);
      INSERT INTO transaction_entries VALUES (2, 3, 5, 'debit',  12000, 12000, NULL, NULL, NULL, NULL);
    `);
    const result = getIncomeStatement(db, '2024-01-01', '2024-01-31');
    expect(result.income.total).toBe(50000);
    expect(result.expenses.total).toBe(12000);
    expect(result.netIncome).toBe(38000);
  });

  it('returns negative netIncome when expenses exceed income', () => {
    const { db, sqlite } = createTestDb();
    sqlite.exec(`
      INSERT INTO transaction_entries VALUES (1, 2, 4, 'credit', 10000, 10000, NULL, NULL, NULL, NULL);
      INSERT INTO transaction_entries VALUES (2, 3, 5, 'debit',  30000, 30000, NULL, NULL, NULL, NULL);
    `);
    const result = getIncomeStatement(db, '2024-01-01', '2024-01-31');
    expect(result.netIncome).toBe(-20000);
  });

  it('passes startDate and endDate through to result', () => {
    const { db } = createTestDb();
    const result = getIncomeStatement(db, '2024-03-01', '2024-03-31');
    expect(result.startDate).toBe('2024-03-01');
    expect(result.endDate).toBe('2024-03-31');
  });
});

describe('getNetWorthHistoryData', () => {
  it('returns empty when no snapshots', () => {
    const { db } = createTestDb();
    expect(getNetWorthHistoryData(db)).toEqual([]);
  });

  it('converts snapshot date to display month (YYYY-MM-01 → previous month)', () => {
    const { db, sqlite } = createTestDb();
    // snapshot date 2024-05-01 represents April 2024 closing balance
    sqlite.exec(`
      INSERT INTO account_monthly_snapshots VALUES (1, 1, '2024-05-01', 200000, 200000);
      INSERT INTO account_monthly_snapshots VALUES (2, 2, '2024-05-01', -50000, -50000);
    `);
    const points = getNetWorthHistoryData(db);
    expect(points).toHaveLength(1);
    expect(points[0]?.month).toBe('2024-04');
    expect(points[0]?.display).toMatch(/Apr.*2024|2024.*Apr/);
    expect(points[0]?.netWorthBase).toBe(150000);
  });

  it('handles January snapshot (2024-01-01 → December 2023)', () => {
    const { db, sqlite } = createTestDb();
    sqlite.exec(`INSERT INTO account_monthly_snapshots VALUES (1, 1, '2024-01-01', 100000, 100000)`);
    const points = getNetWorthHistoryData(db);
    expect(points[0]?.month).toBe('2023-12');
  });
});

describe('getSpendingTreeData', () => {
  it('returns empty roots when no expense entries', () => {
    const { db } = createTestDb();
    const result = getSpendingTreeData(db, '2024-01-01', '2024-01-31');
    expect(result.roots).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('builds a flat tree for single-level expense categories', () => {
    const { db, sqlite } = createTestDb();
    sqlite.exec(`INSERT INTO transaction_entries VALUES (1, 3, 5, 'debit', 20000, 20000, NULL, NULL, NULL, NULL)`);
    const result = getSpendingTreeData(db, '2024-01-01', '2024-01-31');
    expect(result.roots).toHaveLength(1);
    expect(result.roots[0]?.label).toBe('food');
    expect(result.roots[0]?.amount).toBe(20000);
    expect(result.total).toBe(20000);
  });

  it('builds a nested tree for multi-level expense categories', () => {
    const { db, sqlite } = createTestDb();
    // Add a deeper expense account
    sqlite.exec(`INSERT INTO accounts VALUES (6, 'Groceries', 'debit', 'simple', 1, 'expense/food/groceries', 1, NULL)`);
    sqlite.exec(`INSERT INTO transaction_entries VALUES (1, 3, 6, 'debit', 30000, 30000, NULL, NULL, NULL, NULL)`);
    const result = getSpendingTreeData(db, '2024-01-01', '2024-01-31');
    expect(result.roots).toHaveLength(1);
    const foodNode = result.roots[0]!;
    expect(foodNode.label).toBe('food');
    expect(foodNode.children).toHaveLength(1);
    expect(foodNode.children[0]?.label).toBe('groceries');
    expect(foodNode.amount).toBe(30000);
  });

  it('sorts roots by amount descending', () => {
    const { db, sqlite } = createTestDb();
    sqlite.exec(`INSERT INTO accounts VALUES (6, 'Transport', 'debit', 'simple', 1, 'expense/transport', 1, NULL)`);
    sqlite.exec(`
      INSERT INTO transaction_entries VALUES (1, 3, 5, 'debit',  5000,  5000, NULL, NULL, NULL, NULL);
      INSERT INTO transaction_entries VALUES (2, 3, 6, 'debit', 20000, 20000, NULL, NULL, NULL, NULL);
    `);
    const result = getSpendingTreeData(db, '2024-01-01', '2024-01-31');
    expect(result.roots[0]?.label).toBe('transport');
    expect(result.roots[1]?.label).toBe('food');
  });

  it('passes startDate and endDate through', () => {
    const { db } = createTestDb();
    const result = getSpendingTreeData(db, '2024-03-01', '2024-03-31');
    expect(result.startDate).toBe('2024-03-01');
    expect(result.endDate).toBe('2024-03-31');
  });
});

describe('getSecuritiesHistoryData', () => {
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
    const result = getSecuritiesHistoryData(db);
    expect(result.securities).toEqual([]);
    expect(result.points).toEqual([]);
  });

  it('returns one security line and pivoted points', () => {
    const { db, sqlite } = createSecurityTestDb();
    sqlite.exec(`INSERT INTO account_monthly_snapshots VALUES (1, 6, '2024-02-01', 100000, 100000)`);
    const result = getSecuritiesHistoryData(db);
    expect(result.securities).toHaveLength(1);
    expect(result.securities[0]?.ticker).toBe('AAPL');
    expect(result.securities[0]?.label).toBe('AAPL (My Apple)');
    expect(result.points).toHaveLength(1);
    expect(result.points[0]?.['6']).toBe(100000);
    expect(result.points[0]?.display).toMatch(/Jan.*2024|2024.*Jan/);
  });

  it('pivots multiple securities onto the same date row', () => {
    const { db, sqlite } = createSecurityTestDb();
    sqlite.exec(`
      INSERT INTO securities VALUES (2, 'GOOGL', 'Alphabet', 1, 'stock', 6);
      INSERT INTO accounts VALUES (7, 'My Google', 'debit', 'security', 1, 'asset/brokerage/googl', 1, 2);
      INSERT INTO account_monthly_snapshots VALUES (1, 6, '2024-02-01', 100000, 100000);
      INSERT INTO account_monthly_snapshots VALUES (2, 7, '2024-02-01',  80000,  80000);
    `);
    const result = getSecuritiesHistoryData(db);
    expect(result.securities).toHaveLength(2);
    expect(result.points).toHaveLength(1);
    expect(result.points[0]?.['6']).toBe(100000);
    expect(result.points[0]?.['7']).toBe(80000);
  });
});
