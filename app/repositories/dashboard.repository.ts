import { eq, like, or, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { accounts, transactionEntries } from '~/db/schema';
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
