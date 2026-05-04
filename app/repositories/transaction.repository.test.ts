import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '~/db/schema';
import {
  getTransactionsPaginated,
  getTransactionById,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  hasExchangeRate,
  insertExchangeRate,
  getActiveAccountOptions,
  getAllTagOptions,
} from './transaction.repository';

const DDL = `
  CREATE TABLE currencies (
    id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
    symbol TEXT NOT NULL, decimal_places INTEGER NOT NULL DEFAULT 2,
    is_base INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE securities (
    id INTEGER PRIMARY KEY, ticker TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
    currency_id INTEGER NOT NULL, type TEXT NOT NULL,
    quantity_scale INTEGER NOT NULL DEFAULT 6
  );
  CREATE TABLE accounts (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL,
    account_type TEXT NOT NULL, currency_id INTEGER NOT NULL,
    category TEXT NOT NULL UNIQUE, is_active INTEGER NOT NULL DEFAULT 1,
    security_id INTEGER
  );
  CREATE TABLE transactions (
    id INTEGER PRIMARY KEY, date TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    description TEXT, hash TEXT UNIQUE
  );
  CREATE TABLE transaction_entries (
    id INTEGER PRIMARY KEY, transaction_id INTEGER NOT NULL,
    account_id INTEGER NOT NULL, side TEXT NOT NULL,
    amount INTEGER NOT NULL, amount_base INTEGER NOT NULL,
    quantity INTEGER, interest_rate INTEGER, maturity_date TEXT, memo TEXT
  );
  CREATE TABLE tags (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE
  );
  CREATE TABLE transaction_tag_map (
    transaction_id INTEGER NOT NULL, tag_id INTEGER NOT NULL,
    PRIMARY KEY (transaction_id, tag_id)
  );
  CREATE TABLE exchange_rates (
    id INTEGER PRIMARY KEY, currency_id INTEGER NOT NULL,
    rate INTEGER NOT NULL, date TEXT NOT NULL,
    UNIQUE (currency_id, date)
  );
`;

function makeDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(DDL);
  sqlite.exec(`
    INSERT INTO currencies VALUES (1, 'RON', 'Romanian Leu', 'RON', 2, 1);
    INSERT INTO currencies VALUES (2, 'EUR', 'Euro', '€', 2, 0);
    INSERT INTO accounts VALUES (1, 'Bank RON', 'debit',  'simple', 1, 'asset/bank/ron', 1, NULL);
    INSERT INTO accounts VALUES (2, 'Bank EUR', 'debit',  'simple', 2, 'asset/bank/eur', 1, NULL);
    INSERT INTO accounts VALUES (3, 'Salary',   'credit', 'simple', 1, 'income/salary',  1, NULL);
    INSERT INTO tags VALUES (1, 'groceries');
    INSERT INTO tags VALUES (2, 'travel');
  `);
  return { db: drizzle(sqlite, { schema }), sqlite };
}

const debitEntry  = { accountId: 1, side: 'debit'  as const, amount: 10000, amountBase: 10000, quantity: null, interestRate: null, maturityDate: null, memo: null };
const creditEntry = { accountId: 3, side: 'credit' as const, amount: 10000, amountBase: 10000, quantity: null, interestRate: null, maturityDate: null, memo: null };

describe('createTransaction', () => {
  it('inserts transaction, entries, and tags atomically', () => {
    const { db } = makeDb();
    const tx = createTransaction(
      db,
      { date: '2024-01-15', description: 'Salary', hash: null },
      [debitEntry, creditEntry],
      [1],
    );
    expect(tx.id).toBeGreaterThan(0);
    expect(tx.date).toBe('2024-01-15');

    const detail = getTransactionById(db, tx.id);
    expect(detail?.entries).toHaveLength(2);
    expect(detail?.tagIds).toEqual([1]);
  });

  it('returns created transaction with correct fields', () => {
    const { db } = makeDb();
    const tx = createTransaction(
      db,
      { date: '2024-06-01', description: 'Test', hash: null },
      [debitEntry, creditEntry],
      [],
    );
    expect(tx.description).toBe('Test');
  });
});

describe('getTransactionsPaginated', () => {
  it('returns empty result when no transactions', () => {
    const { db } = makeDb();
    const result = getTransactionsPaginated(db, {}, 1, 25);
    expect(result.rows).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.pageCount).toBe(0);
  });

  it('returns transactions ordered by date desc', () => {
    const { db } = makeDb();
    createTransaction(db, { date: '2024-01-01', description: 'A', hash: null }, [debitEntry, creditEntry], []);
    createTransaction(db, { date: '2024-03-01', description: 'B', hash: null }, [debitEntry, creditEntry], []);
    createTransaction(db, { date: '2024-02-01', description: 'C', hash: null }, [debitEntry, creditEntry], []);
    const { rows } = getTransactionsPaginated(db, {}, 1, 25);
    expect(rows.map(r => r.date)).toEqual(['2024-03-01', '2024-02-01', '2024-01-01']);
  });

  it('aggregates entry count, debit base, and tags per row', () => {
    const { db } = makeDb();
    const tx = createTransaction(
      db,
      { date: '2024-01-15', description: null, hash: null },
      [debitEntry, creditEntry],
      [1],
    );
    const { rows } = getTransactionsPaginated(db, {}, 1, 25);
    expect(rows[0]?.entryCount).toBe(2);
    expect(rows[0]?.debitBase).toBe(10000);
    expect(rows[0]?.tags).toEqual(['groceries']);
    void tx;
  });

  it('paginates correctly', () => {
    const { db } = makeDb();
    for (let i = 1; i <= 5; i++) {
      createTransaction(db, { date: `2024-0${i}-01`, description: `T${i}`, hash: null }, [debitEntry, creditEntry], []);
    }
    const page1 = getTransactionsPaginated(db, {}, 1, 2);
    expect(page1.total).toBe(5);
    expect(page1.pageCount).toBe(3);
    expect(page1.rows).toHaveLength(2);
    const page3 = getTransactionsPaginated(db, {}, 3, 2);
    expect(page3.rows).toHaveLength(1);
  });

  it('filters by description (q)', () => {
    const { db } = makeDb();
    createTransaction(db, { date: '2024-01-01', description: 'groceries run', hash: null }, [debitEntry, creditEntry], []);
    createTransaction(db, { date: '2024-01-02', description: 'salary payment', hash: null }, [debitEntry, creditEntry], []);
    const { rows, total } = getTransactionsPaginated(db, { q: 'salary' }, 1, 25);
    expect(total).toBe(1);
    expect(rows[0]?.description).toBe('salary payment');
  });

  it('filters by date range', () => {
    const { db } = makeDb();
    createTransaction(db, { date: '2024-01-01', description: 'Jan', hash: null }, [debitEntry, creditEntry], []);
    createTransaction(db, { date: '2024-03-01', description: 'Mar', hash: null }, [debitEntry, creditEntry], []);
    createTransaction(db, { date: '2024-06-01', description: 'Jun', hash: null }, [debitEntry, creditEntry], []);
    const { rows } = getTransactionsPaginated(db, { dateFrom: '2024-02-01', dateTo: '2024-05-01' }, 1, 25);
    expect(rows.map(r => r.description)).toEqual(['Mar']);
  });

  it('filters by tagId and returns empty when no match', () => {
    const { db } = makeDb();
    createTransaction(db, { date: '2024-01-01', description: 'A', hash: null }, [debitEntry, creditEntry], [1]);
    createTransaction(db, { date: '2024-01-02', description: 'B', hash: null }, [debitEntry, creditEntry], []);
    const { rows } = getTransactionsPaginated(db, { tagId: 1 }, 1, 25);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.description).toBe('A');
    const { rows: empty } = getTransactionsPaginated(db, { tagId: 2 }, 1, 25);
    expect(empty).toHaveLength(0);
  });
});

describe('getTransactionById', () => {
  it('returns null for non-existent id', () => {
    const { db } = makeDb();
    expect(getTransactionById(db, 999)).toBeNull();
  });

  it('returns full detail including entries and tagIds', () => {
    const { db } = makeDb();
    const tx = createTransaction(
      db,
      { date: '2024-01-15', description: 'Salary', hash: null },
      [debitEntry, creditEntry],
      [1, 2],
    );
    const detail = getTransactionById(db, tx.id);
    expect(detail).not.toBeNull();
    expect(detail!.entries).toHaveLength(2);
    expect(detail!.tagIds.sort()).toEqual([1, 2]);
    expect(detail!.entries[0]).toMatchObject({ side: 'debit', amount: 10000, currencyCode: 'RON' });
  });
});

describe('updateTransaction', () => {
  it('replaces entries and tags', () => {
    const { db } = makeDb();
    const tx = createTransaction(
      db,
      { date: '2024-01-01', description: 'Old', hash: null },
      [debitEntry, creditEntry],
      [1],
    );
    updateTransaction(
      db,
      tx.id,
      { date: '2024-02-01', description: 'New' },
      [{ ...debitEntry, amount: 5000, amountBase: 5000 }, { ...creditEntry, amount: 5000, amountBase: 5000 }],
      [2],
    );
    const detail = getTransactionById(db, tx.id);
    expect(detail?.description).toBe('New');
    expect(detail?.entries[0]?.amount).toBe(5000);
    expect(detail?.tagIds).toEqual([2]);
  });

  it('returns null for non-existent id', () => {
    const { db } = makeDb();
    const result = updateTransaction(db, 999, { description: 'X' }, [debitEntry, creditEntry], []);
    expect(result).toBeNull();
  });
});

describe('deleteTransaction', () => {
  it('removes the transaction and its entries', () => {
    const { db } = makeDb();
    const tx = createTransaction(
      db,
      { date: '2024-01-01', description: 'Temp', hash: null },
      [debitEntry, creditEntry],
      [],
    );
    deleteTransaction(db, tx.id);
    expect(getTransactionById(db, tx.id)).toBeNull();
  });
});

describe('hasExchangeRate / insertExchangeRate', () => {
  it('hasExchangeRate returns false when not found', () => {
    const { db } = makeDb();
    expect(hasExchangeRate(db, 2, '2024-01-15')).toBe(false);
  });

  it('insertExchangeRate stores a rate and hasExchangeRate returns true', () => {
    const { db } = makeDb();
    insertExchangeRate(db, 2, '2024-01-15', 500);
    expect(hasExchangeRate(db, 2, '2024-01-15')).toBe(true);
  });

  it('insertExchangeRate ignores duplicate (onConflictDoNothing)', () => {
    const { db } = makeDb();
    insertExchangeRate(db, 2, '2024-01-15', 500);
    expect(() => insertExchangeRate(db, 2, '2024-01-15', 510)).not.toThrow();
  });
});

describe('getActiveAccountOptions', () => {
  it('returns only active accounts with currency info', () => {
    const { db, sqlite } = makeDb();
    sqlite.exec(`INSERT INTO accounts VALUES (4, 'Inactive', 'debit', 'simple', 1, 'asset/inactive', 0, NULL)`);
    const rows = getActiveAccountOptions(db);
    expect(rows.every(r => r.isBaseCurrency !== undefined)).toBe(true);
    expect(rows.map(r => r.category)).not.toContain('asset/inactive');
  });
});

describe('getAllTagOptions', () => {
  it('returns all tags ordered by name', () => {
    const { db } = makeDb();
    const rows = getAllTagOptions(db);
    expect(rows.map(r => r.name)).toEqual(['groceries', 'travel']);
  });
});
