import { desc, eq, gte, like, or, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { accounts, transactions, transactionEntries } from '~/db/schema';
import type * as schema from '~/db/schema';

export function getNetWorthBase(db: BetterSQLite3Database<typeof schema>): number {
  const row = db
    .select({
      netWorth: sql<number>`COALESCE(SUM(
        CASE WHEN ${transactionEntries.side} = 'debit'
          THEN ${transactionEntries.amountBase}
          ELSE -${transactionEntries.amountBase} END
      ), 0)`,
    })
    .from(transactionEntries)
    .innerJoin(accounts, eq(transactionEntries.accountId, accounts.id))
    .where(or(
      like(accounts.category, 'asset/%'),
      like(accounts.category, 'liability/%'),
    ))
    .get();
  return row?.netWorth ?? 0;
}

export function getRecentTransactions(
  db: BetterSQLite3Database<typeof schema>,
  limit = 10,
): Array<{ id: number; date: string; description: string | null; totalBase: number }> {
  return db
    .select({
      id: transactions.id,
      date: transactions.date,
      description: transactions.description,
      totalBase: sql<number>`SUM(CASE WHEN ${transactionEntries.side} = 'debit' THEN ${transactionEntries.amountBase} ELSE 0 END)`,
    })
    .from(transactions)
    .innerJoin(transactionEntries, eq(transactionEntries.transactionId, transactions.id))
    .groupBy(transactions.id)
    .orderBy(desc(transactions.date), desc(transactions.createdAt))
    .limit(limit)
    .all();
}

export function getCurrentMonthSummary(
  db: BetterSQLite3Database<typeof schema>,
  startDate: string,
): { income: number; expenses: number } {
  const row = db
    .select({
      income: sql<number>`COALESCE(SUM(CASE WHEN ${accounts.category} LIKE 'income/%' AND ${transactionEntries.side} = 'credit' THEN ${transactionEntries.amountBase} ELSE 0 END), 0)`,
      expenses: sql<number>`COALESCE(SUM(CASE WHEN ${accounts.category} LIKE 'expense/%' AND ${transactionEntries.side} = 'debit' THEN ${transactionEntries.amountBase} ELSE 0 END), 0)`,
    })
    .from(transactionEntries)
    .innerJoin(accounts, eq(transactionEntries.accountId, accounts.id))
    .innerJoin(transactions, eq(transactionEntries.transactionId, transactions.id))
    .where(gte(transactions.date, startDate))
    .get();
  return { income: row?.income ?? 0, expenses: row?.expenses ?? 0 };
}

export function getMonthlyCashFlow(
  db: BetterSQLite3Database<typeof schema>,
  startDate: string,
): Array<{ month: string; income: number; expenses: number }> {
  return db
    .select({
      month: sql<string>`strftime('%Y-%m', ${transactions.date})`,
      income: sql<number>`COALESCE(SUM(CASE WHEN ${accounts.category} LIKE 'income/%' AND ${transactionEntries.side} = 'credit' THEN ${transactionEntries.amountBase} ELSE 0 END), 0)`,
      expenses: sql<number>`COALESCE(SUM(CASE WHEN ${accounts.category} LIKE 'expense/%' AND ${transactionEntries.side} = 'debit' THEN ${transactionEntries.amountBase} ELSE 0 END), 0)`,
    })
    .from(transactionEntries)
    .innerJoin(accounts, eq(transactionEntries.accountId, accounts.id))
    .innerJoin(transactions, eq(transactionEntries.transactionId, transactions.id))
    .where(gte(transactions.date, startDate))
    .groupBy(sql`strftime('%Y-%m', ${transactions.date})`)
    .orderBy(sql`strftime('%Y-%m', ${transactions.date})`)
    .all();
}
