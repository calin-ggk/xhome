import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '~/db/schema';
import {
  getAllCurrencies,
  getCurrencyById,
  getCurrencyByCode,
  createCurrency,
  updateCurrency,
  deleteCurrency,
  isUsedByAccounts,
  isUsedBySecurities,
  isUsedByExchangeRates,
} from './currency.repository';

const DDL = `
  CREATE TABLE currencies (
    id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL, symbol TEXT NOT NULL,
    decimal_places INTEGER NOT NULL DEFAULT 2
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
  CREATE TABLE exchange_rates (
    id INTEGER PRIMARY KEY, currency_id INTEGER NOT NULL,
    rate INTEGER NOT NULL, rate_scale INTEGER NOT NULL DEFAULT 4,
    date TEXT NOT NULL, UNIQUE(currency_id, date)
  );
`;

function makeDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(DDL);
  sqlite.exec(`INSERT INTO currencies VALUES (1, 'RON', 'Romanian Leu', 'RON', 2)`);
  return { db: drizzle(sqlite, { schema }), sqlite };
}

describe('getAllCurrencies', () => {
  it('returns all currencies ordered by code', () => {
    const { db, sqlite } = makeDb();
    sqlite.exec(`INSERT INTO currencies VALUES (2, 'USD', 'US Dollar', '$', 2)`);
    expect(getAllCurrencies(db).map(c => c.code)).toEqual(['RON', 'USD']);
  });
});

describe('getCurrencyById', () => {
  it('returns the currency when it exists', () => {
    const { db } = makeDb();
    expect(getCurrencyById(db, 1)?.code).toBe('RON');
  });

  it('returns undefined for unknown id', () => {
    const { db } = makeDb();
    expect(getCurrencyById(db, 999)).toBeUndefined();
  });
});

describe('getCurrencyByCode', () => {
  it('returns the currency when it exists', () => {
    const { db } = makeDb();
    expect(getCurrencyByCode(db, 'RON')?.id).toBe(1);
  });

  it('returns undefined for unknown code', () => {
    const { db } = makeDb();
    expect(getCurrencyByCode(db, 'XYZ')).toBeUndefined();
  });
});

describe('createCurrency', () => {
  it('creates and returns a new currency', () => {
    const { db } = makeDb();
    const result = createCurrency(db, { code: 'EUR', name: 'Euro', symbol: '€', decimalPlaces: 2 });
    expect(result.code).toBe('EUR');
    expect(result.id).toBeTruthy();
  });
});

describe('updateCurrency', () => {
  it('updates and returns the currency', () => {
    const { db } = makeDb();
    const result = updateCurrency(db, 1, { name: 'Leu Updated' });
    expect(result?.name).toBe('Leu Updated');
  });

  it('returns undefined for unknown id', () => {
    const { db } = makeDb();
    expect(updateCurrency(db, 999, { name: 'X' })).toBeUndefined();
  });
});

describe('deleteCurrency', () => {
  it('deletes the currency', () => {
    const { db } = makeDb();
    deleteCurrency(db, 1);
    expect(getCurrencyById(db, 1)).toBeUndefined();
  });
});

describe('isUsedByAccounts', () => {
  it('returns false when not used', () => {
    const { db } = makeDb();
    expect(isUsedByAccounts(db, 1)).toBe(false);
  });

  it('returns true when used by an account', () => {
    const { db, sqlite } = makeDb();
    sqlite.exec(`INSERT INTO accounts VALUES (1, 'Bank', 'debit', 'simple', 1, 'asset/bank', 1, NULL)`);
    expect(isUsedByAccounts(db, 1)).toBe(true);
  });
});

describe('isUsedBySecurities', () => {
  it('returns false when not used', () => {
    const { db } = makeDb();
    expect(isUsedBySecurities(db, 1)).toBe(false);
  });

  it('returns true when used by a security', () => {
    const { db, sqlite } = makeDb();
    sqlite.exec(`INSERT INTO securities VALUES (1, 'AAPL', 'Apple', 1, 'stock', 6)`);
    expect(isUsedBySecurities(db, 1)).toBe(true);
  });
});

describe('isUsedByExchangeRates', () => {
  it('returns false when not used', () => {
    const { db } = makeDb();
    expect(isUsedByExchangeRates(db, 1)).toBe(false);
  });

  it('returns true when used by exchange rates', () => {
    const { db, sqlite } = makeDb();
    sqlite.exec(`INSERT INTO exchange_rates VALUES (1, 1, 10000, 4, '2024-01-01')`);
    expect(isUsedByExchangeRates(db, 1)).toBe(true);
  });
});
