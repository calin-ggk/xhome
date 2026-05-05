import { and, eq, lt, ne, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import {
  accountMonthlySnapshots, accounts, currencies,
  exchangeRates, securities, transactionEntries, transactions,
} from '~/db/schema';
import type { InsertAccountMonthlySnapshot } from '~/db/schema';
import type * as schema from '~/db/schema';

// ── Public types ─────────────────────────────────────────────────────────────

export type AccountBalance = {
  accountId:      number;
  currencyId:     number;
  isBaseCurrency: number;
  balance:        number;
};

export type SecurityAccountInfo = {
  accountId:      number;
  securityId:     number;
  ticker:         string;
  quantityScale:  number;
  currencyId:     number;
  decimalPlaces:  number;
  isBaseCurrency: number;
  netQuantity:    number;
};

export type RequiredRate = {
  currencyId:   number;
  currencyCode: string;
  snapshotDate: string; // YYYY-MM-01 (first of next month)
};

export type SnapshotRate = { rate: number; rateScale: number };

// ── Read queries ──────────────────────────────────────────────────────────────

/**
 * Returns snapshot dates (YYYY-MM-01, first of the following month) for all
 * closed months that have transaction entries but no saved snapshot.
 */
export function getMissingSnapshotMonths(
  db: BetterSQLite3Database<typeof schema>,
  today = new Date().toISOString().slice(0, 10),
): string[] {
  const currentMonthStart = today.slice(0, 7) + '-01';

  const txMonths = db
    .select({ ym: sql<string>`strftime('%Y-%m', ${transactions.date})` })
    .from(transactions)
    .where(lt(transactions.date, currentMonthStart))
    .groupBy(sql`strftime('%Y-%m', ${transactions.date})`)
    .orderBy(sql`strftime('%Y-%m', ${transactions.date})`)
    .all();

  if (txMonths.length === 0) return [];

  const snapshotDates = new Set(
    db.selectDistinct({ date: accountMonthlySnapshots.date })
      .from(accountMonthlySnapshots)
      .all()
      .map(r => r.date),
  );

  return txMonths
    .map(r => toNextMonthFirst(r.ym))
    .filter(sd => !snapshotDates.has(sd));
}

/**
 * Returns the running balance for every account that has any entry
 * with transaction date < snapshotDate.
 */
export function computeAccountBalancesAtDate(
  db: BetterSQLite3Database<typeof schema>,
  snapshotDate: string,
): AccountBalance[] {
  return db
    .select({
      accountId:      transactionEntries.accountId,
      currencyId:     accounts.currencyId,
      isBaseCurrency: currencies.isBase,
      balance: sql<number>`SUM(CASE WHEN ${transactionEntries.side}='debit' THEN ${transactionEntries.amount} ELSE -(${transactionEntries.amount}) END)`,
    })
    .from(transactionEntries)
    .innerJoin(transactions, eq(transactionEntries.transactionId, transactions.id))
    .innerJoin(accounts,     eq(transactionEntries.accountId, accounts.id))
    .innerJoin(currencies,   eq(accounts.currencyId, currencies.id))
    .where(and(lt(transactions.date, snapshotDate), ne(accounts.accountType, 'security')))
    .groupBy(transactionEntries.accountId)
    .all();
}

/**
 * Returns net quantity and pricing metadata for every security account that
 * has any entry with transaction date < snapshotDate.
 */
export function getSecurityAccountQuantities(
  db: BetterSQLite3Database<typeof schema>,
  snapshotDate: string,
): SecurityAccountInfo[] {
  return db
    .select({
      accountId:      transactionEntries.accountId,
      securityId:     securities.id,
      ticker:         securities.ticker,
      quantityScale:  securities.quantityScale,
      currencyId:     accounts.currencyId,
      decimalPlaces:  currencies.decimalPlaces,
      isBaseCurrency: currencies.isBase,
      netQuantity: sql<number>`SUM(CASE WHEN ${transactionEntries.side}='debit' THEN ${transactionEntries.quantity} ELSE -(${transactionEntries.quantity}) END)`,
    })
    .from(transactionEntries)
    .innerJoin(transactions, eq(transactionEntries.transactionId, transactions.id))
    .innerJoin(accounts,     eq(transactionEntries.accountId, accounts.id))
    .innerJoin(securities,   eq(accounts.securityId, securities.id))
    .innerJoin(currencies,   eq(accounts.currencyId, currencies.id))
    .where(and(lt(transactions.date, snapshotDate), eq(accounts.accountType, 'security')))
    .groupBy(transactionEntries.accountId)
    .all();
}

/**
 * Returns all distinct non-base currencies used by accounts with entries
 * before snapshotDate, filtered to those without an exact rate on snapshotDate.
 */
export function getRequiredRates(
  db: BetterSQLite3Database<typeof schema>,
  snapshotDate: string,
): RequiredRate[] {
  const needed = db
    .selectDistinct({ currencyId: accounts.currencyId, currencyCode: currencies.code })
    .from(transactionEntries)
    .innerJoin(transactions, eq(transactionEntries.transactionId, transactions.id))
    .innerJoin(accounts,     eq(transactionEntries.accountId, accounts.id))
    .innerJoin(currencies,   eq(accounts.currencyId, currencies.id))
    .where(and(lt(transactions.date, snapshotDate), eq(currencies.isBase, 0)))
    .all();

  return needed
    .filter(c => !getExchangeRate(db, c.currencyId, snapshotDate))
    .map(c => ({ ...c, snapshotDate }));
}

export function getExchangeRate(
  db: BetterSQLite3Database<typeof schema>,
  currencyId: number,
  date: string,
): SnapshotRate | null {
  return db
    .select({ rate: exchangeRates.rate, rateScale: exchangeRates.rateScale })
    .from(exchangeRates)
    .where(and(eq(exchangeRates.currencyId, currencyId), eq(exchangeRates.date, date)))
    .get() ?? null;
}

export function getBaseCurrencyCode(
  db: BetterSQLite3Database<typeof schema>,
): string {
  return db
    .select({ code: currencies.code })
    .from(currencies)
    .where(eq(currencies.isBase, 1))
    .get()?.code ?? '';
}

export function getSnapshotCount(
  db: BetterSQLite3Database<typeof schema>,
): number {
  return db
    .select({ count: sql<number>`COUNT(DISTINCT ${accountMonthlySnapshots.date})` })
    .from(accountMonthlySnapshots)
    .get()?.count ?? 0;
}

// ── Write queries ─────────────────────────────────────────────────────────────

export function upsertExchangeRate(
  db: BetterSQLite3Database<typeof schema>,
  currencyId: number,
  date: string,
  rate: number,
  rateScale: number,
): void {
  db.insert(exchangeRates)
    .values({ currencyId, date, rate, rateScale })
    .onConflictDoUpdate({
      target: [exchangeRates.currencyId, exchangeRates.date],
      set: { rate: sql`excluded.rate`, rateScale: sql`excluded.rate_scale` },
    })
    .run();
}

export function upsertSnapshots(
  db: BetterSQLite3Database<typeof schema>,
  rows: Omit<InsertAccountMonthlySnapshot, 'id'>[],
): void {
  if (rows.length === 0) return;
  db.insert(accountMonthlySnapshots)
    .values(rows)
    .onConflictDoUpdate({
      target: [accountMonthlySnapshots.accountId, accountMonthlySnapshots.date],
      set: {
        balance:     sql`excluded.balance`,
        balanceBase: sql`excluded.balance_base`,
      },
    })
    .run();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toNextMonthFirst(ym: string): string {
  const [yearStr, monthStr] = ym.split('-');
  // month (1-indexed) used as 0-indexed month in Date.UTC naturally gives next month
  return new Date(Date.UTC(parseInt(yearStr!, 10), parseInt(monthStr!, 10), 1))
    .toISOString()
    .slice(0, 10);
}
