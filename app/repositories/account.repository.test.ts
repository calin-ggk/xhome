import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '~/db/schema';
import {
  getAllAccounts,
  getAccountById,
  createAccount,
  updateAccount,
  deleteAccount,
  hasTransactionEntries,
  getAllCurrencies,
  getAllSecurities,
} from './account.repository';

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
  CREATE TABLE transaction_entries (
    id INTEGER PRIMARY KEY,
    transaction_id INTEGER NOT NULL, account_id INTEGER NOT NULL,
    side TEXT NOT NULL, amount INTEGER NOT NULL, amount_base INTEGER NOT NULL,
    quantity INTEGER, interest_rate INTEGER, maturity_date TEXT, memo TEXT
  );
`;

function makeDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(DDL);
  sqlite.exec(`
    INSERT INTO currencies VALUES (1, 'RON', 'Romanian Leu', 'RON', 2, 1);
    INSERT INTO currencies VALUES (2, 'USD', 'US Dollar',    '$',   2, 0);
    INSERT INTO securities  VALUES (1, 'AAPL', 'Apple Inc.', 2, 'stock', 4);
  `);
  return { db: drizzle(sqlite, { schema }), sqlite };
}

describe('getAllAccounts', () => {
  it('returns empty array when no accounts', () => {
    const { db } = makeDb();
    expect(getAllAccounts(db)).toEqual([]);
  });

  it('returns accounts sorted by category ascending', () => {
    const { db, sqlite } = makeDb();
    sqlite.exec(`
      INSERT INTO accounts VALUES (1, 'Salary', 'credit', 'simple', 1, 'income/salary', 1, 0, NULL);
      INSERT INTO accounts VALUES (2, 'Bank',   'debit',  'simple', 1, 'asset/bank',    1, 0, NULL);
    `);
    const rows = getAllAccounts(db);
    expect(rows.map(r => r.category)).toEqual(['asset/bank', 'income/salary']);
  });

  it('joins currency code correctly', () => {
    const { db, sqlite } = makeDb();
    sqlite.exec(`INSERT INTO accounts VALUES (1, 'Bank', 'debit', 'simple', 1, 'asset/bank', 1, 0, NULL)`);
    const [row] = getAllAccounts(db);
    expect(row?.currencyCode).toBe('RON');
  });

  it('returns null securityTicker for non-security accounts', () => {
    const { db, sqlite } = makeDb();
    sqlite.exec(`INSERT INTO accounts VALUES (1, 'Bank', 'debit', 'simple', 1, 'asset/bank', 1, 0, NULL)`);
    const [row] = getAllAccounts(db);
    expect(row?.securityTicker).toBeNull();
  });

  it('joins security ticker when security_id is set', () => {
    const { db, sqlite } = makeDb();
    sqlite.exec(`INSERT INTO accounts VALUES (1, 'Apple', 'debit', 'security', 2, 'asset/shares/aapl', 1, 0, 1)`);
    const [row] = getAllAccounts(db);
    expect(row?.securityTicker).toBe('AAPL');
  });
});

describe('getAccountById', () => {
  it('returns undefined for non-existent id', () => {
    const { db } = makeDb();
    expect(getAccountById(db, 999)).toBeUndefined();
  });

  it('returns the account with joined currency code', () => {
    const { db, sqlite } = makeDb();
    sqlite.exec(`INSERT INTO accounts VALUES (1, 'Bank', 'debit', 'simple', 1, 'asset/bank', 1, 0, NULL)`);
    const row = getAccountById(db, 1);
    expect(row).toBeDefined();
    expect(row?.name).toBe('Bank');
    expect(row?.currencyCode).toBe('RON');
    expect(row?.securityTicker).toBeNull();
  });

  it('returns security ticker for security accounts', () => {
    const { db, sqlite } = makeDb();
    sqlite.exec(`INSERT INTO accounts VALUES (1, 'Apple', 'debit', 'security', 2, 'asset/shares/aapl', 1, 0, 1)`);
    const row = getAccountById(db, 1);
    expect(row?.securityTicker).toBe('AAPL');
  });
});

describe('createAccount', () => {
  it('inserts and returns the new account', () => {
    const { db } = makeDb();
    const account = createAccount(db, {
      name: 'Cash', type: 'debit', accountType: 'simple',
      currencyId: 1, category: 'asset/cash', isActive: 1, securityId: null,
    });
    expect(account.id).toBeGreaterThan(0);
    expect(account.name).toBe('Cash');
    expect(account.category).toBe('asset/cash');
  });

  it('throws on duplicate category', () => {
    const { db } = makeDb();
    createAccount(db, {
      name: 'Cash', type: 'debit', accountType: 'simple',
      currencyId: 1, category: 'asset/cash', isActive: 1, securityId: null,
    });
    expect(() =>
      createAccount(db, {
        name: 'Cash2', type: 'debit', accountType: 'simple',
        currencyId: 1, category: 'asset/cash', isActive: 1, securityId: null,
      })
    ).toThrow();
  });
});

describe('updateAccount', () => {
  it('updates fields and returns updated row', () => {
    const { db } = makeDb();
    const created = createAccount(db, {
      name: 'Bank', type: 'debit', accountType: 'simple',
      currencyId: 1, category: 'asset/bank', isActive: 1, securityId: null,
    });
    const updated = updateAccount(db, created.id, { name: 'Bank RON', isActive: 0 });
    expect(updated?.name).toBe('Bank RON');
    expect(updated?.isActive).toBe(0);
  });

  it('returns undefined for non-existent id', () => {
    const { db } = makeDb();
    expect(updateAccount(db, 999, { name: 'X' })).toBeUndefined();
  });
});

describe('deleteAccount', () => {
  it('removes the account row', () => {
    const { db } = makeDb();
    const account = createAccount(db, {
      name: 'Temp', type: 'debit', accountType: 'simple',
      currencyId: 1, category: 'asset/temp', isActive: 1, securityId: null,
    });
    deleteAccount(db, account.id);
    expect(getAccountById(db, account.id)).toBeUndefined();
  });
});

describe('hasTransactionEntries', () => {
  let db: ReturnType<typeof makeDb>['db'];
  let sqlite: ReturnType<typeof makeDb>['sqlite'];
  let accountId: number;

  beforeEach(() => {
    ({ db, sqlite } = makeDb());
    const account = createAccount(db, {
      name: 'Bank', type: 'debit', accountType: 'simple',
      currencyId: 1, category: 'asset/bank', isActive: 1, securityId: null,
    });
    accountId = account.id;
  });

  it('returns false when account has no entries', () => {
    expect(hasTransactionEntries(db, accountId)).toBe(false);
  });

  it('returns true when account has at least one entry', () => {
    sqlite.exec(`
      INSERT INTO transaction_entries VALUES (1, 1, ${accountId}, 'debit', 100, 100, NULL, NULL, NULL, NULL)
    `);
    expect(hasTransactionEntries(db, accountId)).toBe(true);
  });
});

describe('getAllCurrencies', () => {
  it('returns all currencies with id, code, name', () => {
    const { db } = makeDb();
    const rows = getAllCurrencies(db);
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.code).sort()).toEqual(['RON', 'USD']);
  });
});

describe('getAllSecurities', () => {
  it('returns all securities with id, ticker, name', () => {
    const { db } = makeDb();
    const rows = getAllSecurities(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.ticker).toBe('AAPL');
  });
});
