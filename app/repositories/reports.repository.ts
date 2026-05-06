import { and, eq, gte, like, lte, or, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { accountMonthlySnapshots, accounts, currencies, securities, transactionEntries, transactions } from '~/db/schema';
import type * as schema from '~/db/schema';

export type BalanceSheetRow = {
  accountId: number;
  name: string;
  category: string;
  balanceBase: number;
};

export type IncomeRow = {
  accountId: number;
  name: string;
  category: string;
  totalBase: number;
};

export type NetWorthPoint = {
  date: string;
  netWorthBase: number;
};

export type NetWorthPointByCurrency = {
  date: string;
  currencyCode: string;
  netWorthBase: number;
};

export type SecurityHistoryPoint = {
  date: string;
  accountId: number;
  accountName: string;
  ticker: string;
  securityName: string;
  balanceBase: number;
};


export function hasSnapshotForDate(
  db: BetterSQLite3Database<typeof schema>,
  snapshotDate: string,
): boolean {
  const row = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(accountMonthlySnapshots)
    .where(eq(accountMonthlySnapshots.date, snapshotDate))
    .get();
  return (row?.count ?? 0) > 0;
}

export function getBalanceSheetFromSnapshots(
  db: BetterSQLite3Database<typeof schema>,
  snapshotDate: string,
): BalanceSheetRow[] {
  return db
    .select({
      accountId: accounts.id,
      name: accounts.name,
      category: accounts.category,
      balanceBase: accountMonthlySnapshots.balanceBase,
    })
    .from(accountMonthlySnapshots)
    .innerJoin(accounts, eq(accountMonthlySnapshots.accountId, accounts.id))
    .where(and(
      eq(accountMonthlySnapshots.date, snapshotDate),
      or(
        like(accounts.category, 'asset/%'),
        like(accounts.category, 'liability/%'),
        like(accounts.category, 'equity/%'),
      ),
    ))
    .orderBy(accounts.category)
    .all();
}

export function getBalanceSheetLive(
  db: BetterSQLite3Database<typeof schema>,
  asOfDate: string,
): BalanceSheetRow[] {
  return db
    .select({
      accountId: accounts.id,
      name: accounts.name,
      category: accounts.category,
      balanceBase: sql<number>`SUM(CASE WHEN ${transactionEntries.side} = 'debit' THEN ${transactionEntries.amountBase} ELSE -${transactionEntries.amountBase} END)`,
    })
    .from(transactionEntries)
    .innerJoin(transactions, eq(transactionEntries.transactionId, transactions.id))
    .innerJoin(accounts, eq(transactionEntries.accountId, accounts.id))
    .where(and(
      lte(transactions.date, asOfDate),
      or(
        like(accounts.category, 'asset/%'),
        like(accounts.category, 'liability/%'),
        like(accounts.category, 'equity/%'),
      ),
    ))
    .groupBy(accounts.id)
    .orderBy(accounts.category)
    .all();
}

export function getNetWorthHistory(
  db: BetterSQLite3Database<typeof schema>,
): NetWorthPoint[] {
  return db
    .select({
      date: accountMonthlySnapshots.date,
      netWorthBase: sql<number>`SUM(${accountMonthlySnapshots.balanceBase})`,
    })
    .from(accountMonthlySnapshots)
    .innerJoin(accounts, eq(accountMonthlySnapshots.accountId, accounts.id))
    .where(or(
      like(accounts.category, 'asset/%'),
      like(accounts.category, 'liability/%'),
    ))
    .groupBy(accountMonthlySnapshots.date)
    .orderBy(accountMonthlySnapshots.date)
    .all();
}

export function getNetWorthHistoryByCurrency(
  db: BetterSQLite3Database<typeof schema>,
): NetWorthPointByCurrency[] {
  return db
    .select({
      date: accountMonthlySnapshots.date,
      currencyCode: currencies.code,
      netWorthBase: sql<number>`SUM(${accountMonthlySnapshots.balanceBase})`,
    })
    .from(accountMonthlySnapshots)
    .innerJoin(accounts, eq(accountMonthlySnapshots.accountId, accounts.id))
    .innerJoin(currencies, eq(accounts.currencyId, currencies.id))
    .where(or(
      like(accounts.category, 'asset/%'),
      like(accounts.category, 'liability/%'),
    ))
    .groupBy(accountMonthlySnapshots.date, currencies.code)
    .orderBy(accountMonthlySnapshots.date, currencies.code)
    .all();
}

export function getSecuritiesHistory(
  db: BetterSQLite3Database<typeof schema>,
): SecurityHistoryPoint[] {
  return db
    .select({
      date: accountMonthlySnapshots.date,
      accountId: accounts.id,
      accountName: accounts.name,
      ticker: securities.ticker,
      securityName: securities.name,
      balanceBase: accountMonthlySnapshots.balanceBase,
    })
    .from(accountMonthlySnapshots)
    .innerJoin(accounts, eq(accountMonthlySnapshots.accountId, accounts.id))
    .innerJoin(securities, eq(accounts.securityId, securities.id))
    .where(eq(accounts.accountType, 'security'))
    .orderBy(accountMonthlySnapshots.date, accounts.id)
    .all();
}

export function getIncomeStatementData(
  db: BetterSQLite3Database<typeof schema>,
  startDate: string | null,
  endDate: string | null,
): IncomeRow[] {
  return db
    .select({
      accountId: accounts.id,
      name: accounts.name,
      category: accounts.category,
      // Net activity: income credits minus debits; expense debits minus credits
      totalBase: sql<number>`SUM(CASE
        WHEN ${accounts.category} LIKE 'income/%' THEN
          CASE WHEN ${transactionEntries.side} = 'credit' THEN ${transactionEntries.amountBase} ELSE -${transactionEntries.amountBase} END
        WHEN ${accounts.category} LIKE 'expense/%' THEN
          CASE WHEN ${transactionEntries.side} = 'debit' THEN ${transactionEntries.amountBase} ELSE -${transactionEntries.amountBase} END
        ELSE 0
      END)`,
    })
    .from(transactionEntries)
    .innerJoin(transactions, eq(transactionEntries.transactionId, transactions.id))
    .innerJoin(accounts, eq(transactionEntries.accountId, accounts.id))
    .where(and(
      or(
        like(accounts.category, 'income/%'),
        like(accounts.category, 'expense/%'),
      ),
      startDate ? gte(transactions.date, startDate) : undefined,
      endDate   ? lte(transactions.date, endDate)   : undefined,
    ))
    .groupBy(accounts.id)
    .orderBy(accounts.category)
    .all();
}
