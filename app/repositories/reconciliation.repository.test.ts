import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '~/db/schema';
import {
  getAccountsForReconciliation,
  getReconciledAccountIds,
  getLastSnapshot,
  getEntriesSince,
  findAccountByCategory,
  createReconciliationAccount,
  saveReconciliationLog,
  saveReconciliationTransaction,
  getStoredExchangeRate,
  upsertExchangeRate,
} from './reconciliation.repository';

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
    is_active INTEGER NOT NULL DEFAULT 1,
    is_reconcilable INTEGER NOT NULL DEFAULT 0,
    security_id INTEGER
  );
  CREATE TABLE transactions (
    id INTEGER PRIMARY KEY, date TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    description TEXT, hash TEXT UNIQUE
  );
  CREATE TABLE transaction_entries (
    id INTEGER PRIMARY KEY,
    transaction_id INTEGER NOT NULL, account_id INTEGER NOT NULL,
    side TEXT NOT NULL, amount INTEGER NOT NULL, amount_base INTEGER NOT NULL,
    quantity INTEGER, interest_rate INTEGER, maturity_date TEXT, memo TEXT
  );
  CREATE TABLE exchange_rates (
    id INTEGER PRIMARY KEY, currency_id INTEGER NOT NULL,
    rate INTEGER NOT NULL, rate_scale INTEGER NOT NULL DEFAULT 4,
    date TEXT NOT NULL,
    UNIQUE(currency_id, date)
  );
  CREATE TABLE account_monthly_snapshots (
    id INTEGER PRIMARY KEY, account_id INTEGER NOT NULL,
    date TEXT NOT NULL, balance INTEGER NOT NULL, balance_base INTEGER NOT NULL,
    UNIQUE(account_id, date)
  );
  CREATE TABLE reconciliation_log (
    id INTEGER PRIMARY KEY, account_id INTEGER NOT NULL,
    date TEXT NOT NULL, transaction_id INTEGER,
    book_balance INTEGER NOT NULL, real_balance INTEGER NOT NULL,
    UNIQUE(account_id, date)
  );
`;

function makeDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(DDL);
  sqlite.exec(`
    INSERT INTO currencies VALUES (1, 'RON', 'Romanian Leu', 'RON', 2, 1);
    INSERT INTO accounts VALUES (1, 'Bank',   'debit',  'simple', 1, 'asset/bank',     1, 1, NULL);
    INSERT INTO accounts VALUES (2, 'Salary', 'credit', 'simple', 1, 'income/salary',  1, 1, NULL);
    INSERT INTO accounts VALUES (3, 'Inactive', 'debit', 'simple', 1, 'asset/inactive', 0, 0, NULL);
  `);
  return { db: drizzle(sqlite, { schema }), sqlite };
}

// ── getAccountsForReconciliation ─────────────────────────────────────────────

describe('getAccountsForReconciliation', () => {
  it('returns only active accounts with currency info', () => {
    const { db } = makeDb();
    const rows = getAccountsForReconciliation(db);
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.category)).toEqual(['asset/bank', 'income/salary']);
    expect(rows[0]!.currencyCode).toBe('RON');
  });
});

// ── getReconciledAccountIds ───────────────────────────────────────────────────

describe('getReconciledAccountIds', () => {
  it('returns empty set when nothing reconciled', () => {
    const { db } = makeDb();
    expect(getReconciledAccountIds(db, '2024-05-01')).toEqual(new Set());
  });

  it('returns ids reconciled on the given date only', () => {
    const { db, sqlite } = makeDb();
    sqlite.exec(`
      INSERT INTO reconciliation_log VALUES (1, 1, '2024-05-01', NULL, 100, 100);
      INSERT INTO reconciliation_log VALUES (2, 2, '2024-04-01', NULL, 200, 200);
    `);
    const ids = getReconciledAccountIds(db, '2024-05-01');
    expect(ids).toEqual(new Set([1]));
  });
});

// ── getLastSnapshot ───────────────────────────────────────────────────────────

describe('getLastSnapshot', () => {
  it('returns null when no snapshot exists', () => {
    const { db } = makeDb();
    expect(getLastSnapshot(db, 1)).toBeNull();
  });

  it('returns the most recent snapshot', () => {
    const { db, sqlite } = makeDb();
    sqlite.exec(`
      INSERT INTO account_monthly_snapshots VALUES (1, 1, '2024-03-01', 50000, 50000);
      INSERT INTO account_monthly_snapshots VALUES (2, 1, '2024-04-01', 75000, 75000);
    `);
    const snap = getLastSnapshot(db, 1);
    expect(snap).toEqual({ balance: 75000, date: '2024-04-01' });
  });
});

// ── getEntriesSince ───────────────────────────────────────────────────────────

describe('getEntriesSince', () => {
  it('returns 0 when no entries', () => {
    const { db } = makeDb();
    expect(getEntriesSince(db, 1, '2024-01-01')).toBe(0);
  });

  it('sums debit as positive and credit as negative', () => {
    const { db, sqlite } = makeDb();
    sqlite.exec(`
      INSERT INTO transactions VALUES (1, '2024-05-01', CURRENT_TIMESTAMP, 'tx1', NULL);
      INSERT INTO transaction_entries VALUES (1, 1, 1, 'debit',  30000, 30000, NULL, NULL, NULL, NULL);
      INSERT INTO transaction_entries VALUES (2, 1, 2, 'credit', 30000, 30000, NULL, NULL, NULL, NULL);
    `);
    expect(getEntriesSince(db, 1, '2024-05-01')).toBe(30000);
    expect(getEntriesSince(db, 2, '2024-05-01')).toBe(-30000);
  });

  it('excludes entries before sinceDate', () => {
    const { db, sqlite } = makeDb();
    sqlite.exec(`
      INSERT INTO transactions VALUES (1, '2024-04-15', CURRENT_TIMESTAMP, 'old', NULL);
      INSERT INTO transaction_entries VALUES (1, 1, 1, 'debit', 10000, 10000, NULL, NULL, NULL, NULL);
      INSERT INTO transactions VALUES (2, '2024-05-01', CURRENT_TIMESTAMP, 'new', NULL);
      INSERT INTO transaction_entries VALUES (2, 2, 1, 'debit', 5000, 5000, NULL, NULL, NULL, NULL);
    `);
    expect(getEntriesSince(db, 1, '2024-05-01')).toBe(5000);
  });
});

// ── findAccountByCategory ─────────────────────────────────────────────────────

describe('findAccountByCategory', () => {
  it('returns null when not found', () => {
    const { db } = makeDb();
    expect(findAccountByCategory(db, 'equity/reconciliation-surplus')).toBeNull();
  });

  it('returns the account when found', () => {
    const { db } = makeDb();
    const created = createReconciliationAccount(db, {
      name: 'Reconciliation Surplus',
      category: 'equity/reconciliation-surplus',
      currencyId: 1,
    });
    const found = findAccountByCategory(db, 'equity/reconciliation-surplus');
    expect(found?.id).toBe(created.id);
    expect(found?.type).toBe('credit');
  });
});

// ── saveReconciliationLog (upsert) ────────────────────────────────────────────

describe('saveReconciliationLog', () => {
  it('creates a new log entry', () => {
    const { db, sqlite } = makeDb();
    saveReconciliationLog(db, { accountId: 1, date: '2024-05-01', transactionId: null, bookBalance: 100, realBalance: 100 });
    const row = sqlite.prepare('SELECT * FROM reconciliation_log WHERE account_id=1').get() as Record<string, unknown>;
    expect(row['date']).toBe('2024-05-01');
    expect(row['transaction_id']).toBeNull();
  });

  it('upserts on same account+date', () => {
    const { db, sqlite } = makeDb();
    saveReconciliationLog(db, { accountId: 1, date: '2024-05-01', transactionId: null, bookBalance: 100, realBalance: 100 });
    saveReconciliationLog(db, { accountId: 1, date: '2024-05-01', transactionId: null, bookBalance: 100, realBalance: 110 });
    const rows = sqlite.prepare('SELECT * FROM reconciliation_log').all();
    expect(rows).toHaveLength(1);
    expect((rows[0] as Record<string, unknown>)['real_balance']).toBe(110);
  });
});

// ── saveReconciliationTransaction ─────────────────────────────────────────────

describe('saveReconciliationTransaction', () => {
  it('creates a balanced transaction with entries', () => {
    const { db, sqlite } = makeDb();
    const tx = saveReconciliationTransaction(db, {
      date: '2024-05-01',
      description: 'Reconciliation test',
      entries: [
        { accountId: 1, side: 'debit',  amount: 5000, amountBase: 5000 },
        { accountId: 2, side: 'credit', amount: 5000, amountBase: 5000 },
      ],
    });
    expect(tx.id).toBeGreaterThan(0);
    const entries = sqlite.prepare('SELECT * FROM transaction_entries WHERE transaction_id=?').all(tx.id);
    expect(entries).toHaveLength(2);
  });
});

// ── getStoredExchangeRate / upsertExchangeRate ────────────────────────────────

describe('exchange rate helpers', () => {
  it('returns null when no rate stored', () => {
    const { db } = makeDb();
    expect(getStoredExchangeRate(db, 1, '2024-05-01')).toBeNull();
  });

  it('returns the stored rate for the exact date', () => {
    const { db } = makeDb();
    upsertExchangeRate(db, 1, '2024-05-01', 50000, 4);
    expect(getStoredExchangeRate(db, 1, '2024-05-01')).toEqual({ rate: 50000, rateScale: 4 });
  });
});
