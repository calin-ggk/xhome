import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '~/db/schema';
import { getBalanceSheet, getIncomeStatement } from './reports.service';

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
