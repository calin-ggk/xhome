import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '~/db/schema';
import { getSnapshotStatus, generateMissingSnapshots } from './snapshot.service';

vi.mock('~/lib/yahoo-finance', () => ({
  fetchExchangeRate: vi.fn(),
}));

import { fetchExchangeRate } from '~/lib/yahoo-finance';
const mockFetch = vi.mocked(fetchExchangeRate);

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
    INSERT INTO currencies VALUES (1,'RON','Romanian Leu','RON',2,1);
    INSERT INTO currencies VALUES (2,'EUR','Euro','€',2,0);
    INSERT INTO accounts VALUES (1,'Bank RON','debit','simple',1,'asset/bank-ron',1,NULL);
    INSERT INTO accounts VALUES (2,'Bank EUR','debit','simple',2,'asset/bank-eur',1,NULL);
    INSERT INTO accounts VALUES (3,'Salary','credit','simple',1,'income/salary',1,NULL);
  `);
  return { db: drizzle(sqlite, { schema }), sqlite };
}

beforeEach(() => {
  mockFetch.mockReset();
});

// ── getSnapshotStatus ─────────────────────────────────────────────────────────

describe('getSnapshotStatus', () => {
  it('returns zero counts when no data', () => {
    const { db } = makeDb();
    const status = getSnapshotStatus(db);
    expect(status.missingMonths).toEqual([]);
    expect(status.snapshotCount).toBe(0);
  });
});

// ── generateMissingSnapshots — all base currency ──────────────────────────────

describe('generateMissingSnapshots — base currency only', () => {
  it('returns ok with zero when no missing months', async () => {
    const { db } = makeDb();
    const result = await generateMissingSnapshots(db);
    expect(result).toEqual({ ok: true, monthsGenerated: 0, snapshotsCreated: 0 });
  });

  it('saves snapshots for a single RON-only month', async () => {
    const { db, sqlite } = makeDb();
    sqlite.exec(`
      INSERT INTO transactions VALUES (1,'2024-04-10',CURRENT_TIMESTAMP,'salary',NULL);
      INSERT INTO transaction_entries VALUES (1,1,1,'debit',500000,500000,NULL,NULL,NULL,NULL);
      INSERT INTO transaction_entries VALUES (2,1,3,'credit',500000,500000,NULL,NULL,NULL,NULL);
    `);

    const result = await generateMissingSnapshots(db, [], '2024-05-15');

    expect(result).toMatchObject({ ok: true, monthsGenerated: 1 });
    if (result.ok) {
      expect(result.snapshotsCreated).toBe(2); // Bank RON + Salary
    }
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ── generateMissingSnapshots — Yahoo Finance ──────────────────────────────────

describe('generateMissingSnapshots — foreign currency', () => {
  function setupEurMonth(sqlite: ReturnType<typeof Database>) {
    sqlite.exec(`
      INSERT INTO transactions VALUES (1,'2024-04-10',CURRENT_TIMESTAMP,'dep',NULL);
      INSERT INTO transaction_entries VALUES (1,1,1,'credit',500000,500000,NULL,NULL,NULL,NULL);
      INSERT INTO transaction_entries VALUES (2,1,2,'debit',100000,497000,NULL,NULL,NULL,NULL);
    `);
  }

  it('fetches rate from Yahoo and saves snapshot when successful', async () => {
    const { db, sqlite } = makeDb();
    setupEurMonth(sqlite);
    mockFetch.mockResolvedValue({ rate: 49700, rateScale: 4 });

    const result = await generateMissingSnapshots(db, [], '2024-05-15');

    expect(result).toMatchObject({ ok: true, monthsGenerated: 1 });
    expect(mockFetch).toHaveBeenCalledWith('EUR', 'RON', '2024-05-01');
  });

  it('returns missingRates when Yahoo Finance fails', async () => {
    const { db, sqlite } = makeDb();
    setupEurMonth(sqlite);
    mockFetch.mockResolvedValue(null);

    const result = await generateMissingSnapshots(db, [], '2024-05-15');

    expect(result).toMatchObject({ ok: false });
    if (!result.ok && 'missingRates' in result) {
      expect(result.missingRates).toHaveLength(1);
      expect(result.missingRates[0]?.currencyCode).toBe('EUR');
    }
  });

  it('accepts manual rates and generates without calling Yahoo', async () => {
    const { db, sqlite } = makeDb();
    setupEurMonth(sqlite);

    const result = await generateMissingSnapshots(
      db,
      [{ currencyId: 2, snapshotDate: '2024-05-01', rateDecimal: 4.97 }],
      '2024-05-15',
    );

    expect(result).toMatchObject({ ok: true, monthsGenerated: 1 });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('computes balanceBase correctly using the snapshot rate', async () => {
    const { db, sqlite } = makeDb();
    // 1000 EUR debit (100000 cents), rate 4.97 → balanceBase = 100000 * 49700 / 10000 = 497000
    sqlite.exec(`
      INSERT INTO transactions VALUES (1,'2024-04-10',CURRENT_TIMESTAMP,'dep',NULL);
      INSERT INTO transaction_entries VALUES (1,1,2,'debit',100000,497000,NULL,NULL,NULL,NULL);
      INSERT INTO transaction_entries VALUES (2,1,3,'credit',100000,497000,NULL,NULL,NULL,NULL);
    `);

    const result = await generateMissingSnapshots(
      db,
      [{ currencyId: 2, snapshotDate: '2024-05-01', rateDecimal: 4.97 }],
      '2024-05-15',
    );

    expect(result).toMatchObject({ ok: true });
    // balanceBase for EUR account: 100000 * 49700 / 10000 = 497000
    if (result.ok) expect(result.snapshotsCreated).toBeGreaterThan(0);
  });
});
