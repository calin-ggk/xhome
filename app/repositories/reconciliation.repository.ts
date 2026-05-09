import { and, desc, eq, gte, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import {
  accounts, accountMonthlySnapshots, currencies, exchangeRates,
  reconciliationLog, transactions, transactionEntries,
} from '~/db/schema';
import type { Account, InsertAccount } from '~/db/schema';
import type * as schema from '~/db/schema';

// ── Public types ──────────────────────────────────────────────────────────────

export type AccountOption = {
  id:           number;
  name:         string;
  type:         string;
  category:     string;
  currencyId:   number;
  currencyCode: string;
  decimalPlaces: number;
};

export type SnapshotRow = { balance: number; date: string };
export type RateRow     = { rate: number; rateScale: number };

// ── Read queries ──────────────────────────────────────────────────────────────

export function getAccountsForReconciliation(
  db: BetterSQLite3Database<typeof schema>,
): AccountOption[] {
  return db
    .select({
      id:           accounts.id,
      name:         accounts.name,
      type:         accounts.type,
      category:     accounts.category,
      currencyId:   accounts.currencyId,
      currencyCode: currencies.code,
      decimalPlaces: currencies.decimalPlaces,
    })
    .from(accounts)
    .innerJoin(currencies, eq(accounts.currencyId, currencies.id))
    .where(and(eq(accounts.isActive, 1), eq(accounts.isReconcilable, 1)))
    .orderBy(accounts.category)
    .all();
}

export function getReconciledAccountIds(
  db: BetterSQLite3Database<typeof schema>,
  date: string,
): Set<number> {
  const rows = db
    .select({ accountId: reconciliationLog.accountId })
    .from(reconciliationLog)
    .where(eq(reconciliationLog.date, date))
    .all();
  return new Set(rows.map(r => r.accountId));
}

export function getLastSnapshot(
  db: BetterSQLite3Database<typeof schema>,
  accountId: number,
): SnapshotRow | null {
  return db
    .select({ balance: accountMonthlySnapshots.balance, date: accountMonthlySnapshots.date })
    .from(accountMonthlySnapshots)
    .where(eq(accountMonthlySnapshots.accountId, accountId))
    .orderBy(desc(accountMonthlySnapshots.date))
    .limit(1)
    .get() ?? null;
}

export function getEntriesSince(
  db: BetterSQLite3Database<typeof schema>,
  accountId: number,
  sinceDate: string,
): number {
  const row = db
    .select({
      total: sql<number>`SUM(CASE WHEN ${transactionEntries.side}='debit' THEN ${transactionEntries.amount} ELSE -(${transactionEntries.amount}) END)`,
    })
    .from(transactionEntries)
    .innerJoin(transactions, eq(transactionEntries.transactionId, transactions.id))
    .where(and(
      eq(transactionEntries.accountId, accountId),
      gte(transactions.date, sinceDate),
    ))
    .get();
  return row?.total ?? 0;
}

export function findAccountByCategory(
  db: BetterSQLite3Database<typeof schema>,
  category: string,
): Account | null {
  return db
    .select()
    .from(accounts)
    .where(eq(accounts.category, category))
    .get() ?? null;
}

export function getBaseCurrency(
  db: BetterSQLite3Database<typeof schema>,
): { id: number; code: string; decimalPlaces: number } | null {
  return db
    .select({ id: currencies.id, code: currencies.code, decimalPlaces: currencies.decimalPlaces })
    .from(currencies)
    .where(eq(currencies.isBase, 1))
    .get() ?? null;
}

export function getStoredExchangeRate(
  db: BetterSQLite3Database<typeof schema>,
  currencyId: number,
  date: string,
): RateRow | null {
  return db
    .select({ rate: exchangeRates.rate, rateScale: exchangeRates.rateScale })
    .from(exchangeRates)
    .where(and(eq(exchangeRates.currencyId, currencyId), eq(exchangeRates.date, date)))
    .get() ?? null;
}

// ── Write queries ─────────────────────────────────────────────────────────────

export function createReconciliationAccount(
  db: BetterSQLite3Database<typeof schema>,
  data: Pick<InsertAccount, 'name' | 'category' | 'currencyId'>,
): Account {
  const result = db
    .insert(accounts)
    .values({ ...data, type: 'credit', accountType: 'simple', isActive: 1 })
    .returning()
    .all();
  return result[0]!;
}

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

export type EntryInput = {
  accountId:  number;
  side:       'debit' | 'credit';
  amount:     number;
  amountBase: number;
};

export function saveReconciliationTransaction(
  db: BetterSQLite3Database<typeof schema>,
  data: { date: string; description: string; entries: EntryInput[] },
): { id: number } {
  return db.transaction(() => {
    const [tx] = db
      .insert(transactions)
      .values({ date: data.date, description: data.description })
      .returning({ id: transactions.id })
      .all();

    db.insert(transactionEntries)
      .values(data.entries.map(e => ({
        transactionId: tx!.id,
        accountId:     e.accountId,
        side:          e.side,
        amount:        e.amount,
        amountBase:    e.amountBase,
      })))
      .run();

    return tx!;
  });
}

export function saveReconciliationLog(
  db: BetterSQLite3Database<typeof schema>,
  data: { accountId: number; date: string; transactionId: number | null; bookBalance: number; realBalance: number },
): void {
  db.insert(reconciliationLog)
    .values(data)
    .onConflictDoUpdate({
      target: [reconciliationLog.accountId, reconciliationLog.date],
      set: {
        transactionId: sql`excluded.transaction_id`,
        bookBalance:   sql`excluded.book_balance`,
        realBalance:   sql`excluded.real_balance`,
      },
    })
    .run();
}
