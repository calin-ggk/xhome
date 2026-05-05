import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '~/db/schema';
import {
  getMissingSnapshotMonths,
  computeAccountBalancesAtDate,
  getSecurityAccountQuantities,
  getRequiredRates,
  getExchangeRate,
  upsertExchangeRate,
  upsertSnapshots,
  getSnapshotCount,
  getBaseCurrencyCode,
} from './snapshot.repository';

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
`;

function makeDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(DDL);
  sqlite.exec(`
    INSERT INTO currencies VALUES (1, 'RON', 'Romanian Leu', 'RON', 2, 1);
    INSERT INTO currencies VALUES (2, 'EUR', 'Euro', '€', 2, 0);
    INSERT INTO accounts VALUES (1, 'Bank RON', 'debit', 'simple', 1, 'asset/bank-ron', 1, NULL);
    INSERT INTO accounts VALUES (2, 'Bank EUR', 'debit', 'simple', 2, 'asset/bank-eur', 1, NULL);
    INSERT INTO accounts VALUES (3, 'Salary',   'credit', 'simple', 1, 'income/salary',  1, NULL);
  `);
  return { db: drizzle(sqlite, { schema }), sqlite };
}

// ── getMissingSnapshotMonths ──────────────────────────────────────────────────

describe('getMissingSnapshotMonths', () => {
  it('returns empty when no transactions', () => {
    const { db } = makeDb();
    expect(getMissingSnapshotMonths(db, '2024-05-15')).toEqual([]);
  });

  it('returns snapshot date (first of next month) for a missing closed month', () => {
    const { db, sqlite } = makeDb();
    sqlite.exec(`INSERT INTO transactions VALUES (1,'2024-03-15',CURRENT_TIMESTAMP,'tx',NULL)`);
    expect(getMissingSnapshotMonths(db, '2024-05-15')).toEqual(['2024-04-01']);
  });

  it('excludes the current month', () => {
    const { db, sqlite } = makeDb();
    sqlite.exec(`INSERT INTO transactions VALUES (1,'2024-05-10',CURRENT_TIMESTAMP,'tx',NULL)`);
    expect(getMissingSnapshotMonths(db, '2024-05-15')).toEqual([]);
  });

  it('excludes months that already have a snapshot entry', () => {
    const { db, sqlite } = makeDb();
    sqlite.exec(`
      INSERT INTO transactions VALUES (1,'2024-03-15',CURRENT_TIMESTAMP,'tx',NULL);
      INSERT INTO account_monthly_snapshots VALUES (1,1,'2024-04-01',1000,1000);
    `);
    expect(getMissingSnapshotMonths(db, '2024-05-15')).toEqual([]);
  });

  it('returns multiple missing months in chronological order', () => {
    const { db, sqlite } = makeDb();
    sqlite.exec(`
      INSERT INTO transactions VALUES (1,'2024-01-10',CURRENT_TIMESTAMP,'tx1',NULL);
      INSERT INTO transactions VALUES (2,'2024-03-10',CURRENT_TIMESTAMP,'tx2',NULL);
    `);
    expect(getMissingSnapshotMonths(db, '2024-05-15')).toEqual(['2024-02-01', '2024-04-01']);
  });

  it('handles year boundary (December → January)', () => {
    const { db, sqlite } = makeDb();
    sqlite.exec(`INSERT INTO transactions VALUES (1,'2024-12-10',CURRENT_TIMESTAMP,'tx',NULL)`);
    expect(getMissingSnapshotMonths(db, '2025-02-01')).toEqual(['2025-01-01']);
  });
});

// ── computeAccountBalancesAtDate ─────────────────────────────────────────────

describe('computeAccountBalancesAtDate', () => {
  it('returns empty array when no entries', () => {
    const { db } = makeDb();
    expect(computeAccountBalancesAtDate(db, '2024-05-01')).toEqual([]);
  });

  it('computes debit account balance (debit - credit)', () => {
    const { db, sqlite } = makeDb();
    sqlite.exec(`
      INSERT INTO transactions VALUES (1,'2024-04-10',CURRENT_TIMESTAMP,'tx',NULL);
      INSERT INTO transaction_entries VALUES (1,1,1,'debit',50000,50000,NULL,NULL,NULL,NULL);
      INSERT INTO transaction_entries VALUES (2,1,3,'credit',50000,50000,NULL,NULL,NULL,NULL);
    `);
    const rows = computeAccountBalancesAtDate(db, '2024-05-01');
    expect(rows.find(r => r.accountId === 1)?.balance).toBe(50000);
    expect(rows.find(r => r.accountId === 3)?.balance).toBe(-50000);
  });

  it('includes entries across multiple months (cumulative)', () => {
    const { db, sqlite } = makeDb();
    sqlite.exec(`
      INSERT INTO transactions VALUES (1,'2024-01-10',CURRENT_TIMESTAMP,'t1',NULL);
      INSERT INTO transaction_entries VALUES (1,1,1,'debit',30000,30000,NULL,NULL,NULL,NULL);
      INSERT INTO transactions VALUES (2,'2024-03-10',CURRENT_TIMESTAMP,'t2',NULL);
      INSERT INTO transaction_entries VALUES (2,2,1,'debit',20000,20000,NULL,NULL,NULL,NULL);
    `);
    const rows = computeAccountBalancesAtDate(db, '2024-05-01');
    expect(rows.find(r => r.accountId === 1)?.balance).toBe(50000);
  });

  it('excludes entries on or after snapshotDate', () => {
    const { db, sqlite } = makeDb();
    sqlite.exec(`
      INSERT INTO transactions VALUES (1,'2024-05-01',CURRENT_TIMESTAMP,'tx',NULL);
      INSERT INTO transaction_entries VALUES (1,1,1,'debit',50000,50000,NULL,NULL,NULL,NULL);
    `);
    expect(computeAccountBalancesAtDate(db, '2024-05-01')).toEqual([]);
  });

  it('flags base currency accounts', () => {
    const { db, sqlite } = makeDb();
    sqlite.exec(`
      INSERT INTO transactions VALUES (1,'2024-04-01',CURRENT_TIMESTAMP,'tx',NULL);
      INSERT INTO transaction_entries VALUES (1,1,1,'debit',10000,10000,NULL,NULL,NULL,NULL);
      INSERT INTO transaction_entries VALUES (2,1,2,'credit',10000,50000,NULL,NULL,NULL,NULL);
    `);
    const rows = computeAccountBalancesAtDate(db, '2024-05-01');
    expect(rows.find(r => r.accountId === 1)?.isBaseCurrency).toBe(1);
    expect(rows.find(r => r.accountId === 2)?.isBaseCurrency).toBe(0);
  });
});

// ── getRequiredRates ──────────────────────────────────────────────────────────

describe('getRequiredRates', () => {
  it('returns empty when all accounts are base currency', () => {
    const { db, sqlite } = makeDb();
    sqlite.exec(`
      INSERT INTO transactions VALUES (1,'2024-04-10',CURRENT_TIMESTAMP,'tx',NULL);
      INSERT INTO transaction_entries VALUES (1,1,1,'debit',50000,50000,NULL,NULL,NULL,NULL);
    `);
    expect(getRequiredRates(db, '2024-05-01')).toEqual([]);
  });

  it('returns foreign currency without exact rate on snapshotDate', () => {
    const { db, sqlite } = makeDb();
    sqlite.exec(`
      INSERT INTO transactions VALUES (1,'2024-04-10',CURRENT_TIMESTAMP,'tx',NULL);
      INSERT INTO transaction_entries VALUES (1,1,2,'debit',10000,49700,NULL,NULL,NULL,NULL);
    `);
    const result = getRequiredRates(db, '2024-05-01');
    expect(result).toHaveLength(1);
    expect(result[0]?.currencyCode).toBe('EUR');
    expect(result[0]?.snapshotDate).toBe('2024-05-01');
  });

  it('returns empty when rate already exists for snapshotDate', () => {
    const { db, sqlite } = makeDb();
    sqlite.exec(`
      INSERT INTO transactions VALUES (1,'2024-04-10',CURRENT_TIMESTAMP,'tx',NULL);
      INSERT INTO transaction_entries VALUES (1,1,2,'debit',10000,49700,NULL,NULL,NULL,NULL);
      INSERT INTO exchange_rates VALUES (1,2,49700,4,'2024-05-01');
    `);
    expect(getRequiredRates(db, '2024-05-01')).toEqual([]);
  });

  it('returns empty when no entries before snapshotDate', () => {
    const { db, sqlite } = makeDb();
    sqlite.exec(`
      INSERT INTO transactions VALUES (1,'2024-05-05',CURRENT_TIMESTAMP,'tx',NULL);
      INSERT INTO transaction_entries VALUES (1,1,2,'debit',10000,49700,NULL,NULL,NULL,NULL);
    `);
    expect(getRequiredRates(db, '2024-05-01')).toEqual([]);
  });
});

// ── upsertExchangeRate / getExchangeRate ──────────────────────────────────────

describe('upsertExchangeRate', () => {
  it('inserts a new rate', () => {
    const { db } = makeDb();
    upsertExchangeRate(db, 2, '2024-05-01', 49700, 4);
    expect(getExchangeRate(db, 2, '2024-05-01')).toEqual({ rate: 49700, rateScale: 4 });
  });

  it('updates an existing rate on conflict', () => {
    const { db } = makeDb();
    upsertExchangeRate(db, 2, '2024-05-01', 49700, 4);
    upsertExchangeRate(db, 2, '2024-05-01', 50000, 4);
    expect(getExchangeRate(db, 2, '2024-05-01')?.rate).toBe(50000);
  });
});

describe('getExchangeRate', () => {
  it('returns null when no rate exists', () => {
    const { db } = makeDb();
    expect(getExchangeRate(db, 2, '2024-05-01')).toBeNull();
  });
});

// ── upsertSnapshots / getSnapshotCount ────────────────────────────────────────

describe('upsertSnapshots', () => {
  it('inserts snapshot rows', () => {
    const { db } = makeDb();
    upsertSnapshots(db, [{ accountId: 1, date: '2024-05-01', balance: 50000, balanceBase: 50000 }]);
    expect(getSnapshotCount(db)).toBe(1);
  });

  it('updates balance on conflict', () => {
    const { db } = makeDb();
    upsertSnapshots(db, [{ accountId: 1, date: '2024-05-01', balance: 50000, balanceBase: 50000 }]);
    upsertSnapshots(db, [{ accountId: 1, date: '2024-05-01', balance: 60000, balanceBase: 60000 }]);
    expect(getSnapshotCount(db)).toBe(1);
  });

  it('counts distinct dates, not rows', () => {
    const { db } = makeDb();
    upsertSnapshots(db, [
      { accountId: 1, date: '2024-05-01', balance: 10000, balanceBase: 10000 },
      { accountId: 2, date: '2024-05-01', balance: 20000, balanceBase: 20000 },
    ]);
    expect(getSnapshotCount(db)).toBe(1);
  });

  it('is a no-op for an empty array', () => {
    const { db } = makeDb();
    expect(() => upsertSnapshots(db, [])).not.toThrow();
    expect(getSnapshotCount(db)).toBe(0);
  });
});

// ── getBaseCurrencyCode ───────────────────────────────────────────────────────

describe('getBaseCurrencyCode', () => {
  it('returns the base currency code', () => {
    const { db } = makeDb();
    expect(getBaseCurrencyCode(db)).toBe('RON');
  });
});

// ── getSecurityAccountQuantities ──────────────────────────────────────────────

function makeSecurityDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(DDL);
  sqlite.exec(`
    INSERT INTO currencies VALUES (1, 'RON', 'Romanian Leu', 'RON', 2, 1);
    INSERT INTO currencies VALUES (2, 'USD', 'US Dollar', '$', 2, 0);
    INSERT INTO securities VALUES (1, 'AAPL', 'Apple Inc.', 2, 'stock', 6);
    INSERT INTO accounts VALUES (1, 'Bank RON', 'debit', 'simple', 1, 'asset/bank-ron', 1, NULL);
    INSERT INTO accounts VALUES (2, 'AAPL Portfolio', 'debit', 'security', 2, 'asset/security/aapl', 1, 1);
    INSERT INTO accounts VALUES (3, 'Broker', 'credit', 'simple', 2, 'liability/broker', 1, NULL);
  `);
  return { db: drizzle(sqlite, { schema }), sqlite };
}

describe('getSecurityAccountQuantities', () => {
  it('returns empty when no security accounts have entries', () => {
    const { db } = makeSecurityDb();
    expect(getSecurityAccountQuantities(db, '2024-05-01')).toEqual([]);
  });

  it('returns net quantity for a security account with a buy entry', () => {
    const { db, sqlite } = makeSecurityDb();
    // Buy 1.5 AAPL: quantity = 1500000 (1.5 × 10^6)
    sqlite.exec(`
      INSERT INTO transactions VALUES (1,'2024-04-10',CURRENT_TIMESTAMP,'buy AAPL',NULL);
      INSERT INTO transaction_entries VALUES (1,1,2,'debit',27000,135000,1500000,NULL,NULL,NULL);
      INSERT INTO transaction_entries VALUES (2,1,3,'credit',27000,135000,NULL,NULL,NULL,NULL);
    `);
    const rows = getSecurityAccountQuantities(db, '2024-05-01');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.ticker).toBe('AAPL');
    expect(rows[0]?.netQuantity).toBe(1500000);
    expect(rows[0]?.quantityScale).toBe(6);
    expect(rows[0]?.decimalPlaces).toBe(2);
  });

  it('computes net quantity correctly after a partial sell', () => {
    const { db, sqlite } = makeSecurityDb();
    sqlite.exec(`
      INSERT INTO transactions VALUES (1,'2024-03-01',CURRENT_TIMESTAMP,'buy',NULL);
      INSERT INTO transaction_entries VALUES (1,1,2,'debit',30000,150000,2000000,NULL,NULL,NULL);
      INSERT INTO transactions VALUES (2,'2024-04-01',CURRENT_TIMESTAMP,'sell',NULL);
      INSERT INTO transaction_entries VALUES (2,2,2,'credit',10000,50000,500000,NULL,NULL,NULL);
    `);
    const rows = getSecurityAccountQuantities(db, '2024-05-01');
    expect(rows[0]?.netQuantity).toBe(1500000); // 2000000 - 500000
  });

  it('excludes non-security accounts', () => {
    const { db, sqlite } = makeSecurityDb();
    sqlite.exec(`
      INSERT INTO transactions VALUES (1,'2024-04-10',CURRENT_TIMESTAMP,'salary',NULL);
      INSERT INTO transaction_entries VALUES (1,1,1,'debit',50000,50000,NULL,NULL,NULL,NULL);
      INSERT INTO transaction_entries VALUES (2,1,3,'credit',50000,50000,NULL,NULL,NULL,NULL);
    `);
    expect(getSecurityAccountQuantities(db, '2024-05-01')).toEqual([]);
  });

  it('excludes entries on or after snapshotDate', () => {
    const { db, sqlite } = makeSecurityDb();
    sqlite.exec(`
      INSERT INTO transactions VALUES (1,'2024-05-01',CURRENT_TIMESTAMP,'buy',NULL);
      INSERT INTO transaction_entries VALUES (1,1,2,'debit',27000,135000,1500000,NULL,NULL,NULL);
    `);
    expect(getSecurityAccountQuantities(db, '2024-05-01')).toEqual([]);
  });
});

describe('computeAccountBalancesAtDate excludes security accounts', () => {
  it('does not include security accounts in the balance result', () => {
    const { db, sqlite } = makeSecurityDb();
    sqlite.exec(`
      INSERT INTO transactions VALUES (1,'2024-04-10',CURRENT_TIMESTAMP,'buy',NULL);
      INSERT INTO transaction_entries VALUES (1,1,2,'debit',27000,135000,1500000,NULL,NULL,NULL);
      INSERT INTO transaction_entries VALUES (2,1,3,'credit',27000,135000,NULL,NULL,NULL,NULL);
    `);
    const rows = computeAccountBalancesAtDate(db, '2024-05-01');
    expect(rows.find(r => r.accountId === 2)).toBeUndefined(); // security account excluded
    expect(rows.find(r => r.accountId === 3)).toBeDefined();   // non-security included
  });
});
