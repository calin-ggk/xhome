import { asc, count, eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { accounts, currencies, exchangeRates, securities } from '~/db/schema';
import type { Currency, InsertCurrency } from '~/db/schema';
import type * as schema from '~/db/schema';

export function getAllCurrencies(
  db: BetterSQLite3Database<typeof schema>,
): Currency[] {
  return db.select().from(currencies).orderBy(asc(currencies.code)).all();
}

export function getCurrencyById(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
): Currency | undefined {
  return db.select().from(currencies).where(eq(currencies.id, id)).get() ?? undefined;
}

export function createCurrency(
  db: BetterSQLite3Database<typeof schema>,
  data: InsertCurrency,
): Currency {
  return db.insert(currencies).values(data).returning().all()[0]!;
}

export function updateCurrency(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
  data: Partial<InsertCurrency>,
): Currency | undefined {
  return db.update(currencies).set(data).where(eq(currencies.id, id)).returning().all()[0];
}

export function deleteCurrency(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
): void {
  db.delete(currencies).where(eq(currencies.id, id)).run();
}

export function isUsedByAccounts(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
): boolean {
  const row = db.select({ n: count() }).from(accounts).where(eq(accounts.currencyId, id)).get();
  return (row?.n ?? 0) > 0;
}

export function isUsedBySecurities(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
): boolean {
  const row = db.select({ n: count() }).from(securities).where(eq(securities.currencyId, id)).get();
  return (row?.n ?? 0) > 0;
}

export function isUsedByExchangeRates(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
): boolean {
  const row = db.select({ n: count() }).from(exchangeRates).where(eq(exchangeRates.currencyId, id)).get();
  return (row?.n ?? 0) > 0;
}

export function clearAllBaseCurrencies(
  db: BetterSQLite3Database<typeof schema>,
): void {
  db.update(currencies).set({ isBase: 0 }).run();
}

export function setBaseCurrencyFlag(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
): void {
  db.update(currencies).set({ isBase: 1 }).where(eq(currencies.id, id)).run();
}
