import { asc, count, eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { accounts, currencies, securities, transactionEntries } from '~/db/schema';
import type { Account, InsertAccount } from '~/db/schema';
import type * as schema from '~/db/schema';

export type AccountListRow = {
  id: number;
  name: string;
  type: string;
  accountType: string;
  category: string;
  isActive: number;
  currencyCode: string;
  securityTicker: string | null;
};

export type AccountDetailRow = Account & {
  currencyCode: string;
  securityTicker: string | null;
};

export function getAllAccounts(
  db: BetterSQLite3Database<typeof schema>,
): AccountListRow[] {
  return db
    .select({
      id:             accounts.id,
      name:           accounts.name,
      type:           accounts.type,
      accountType:    accounts.accountType,
      category:       accounts.category,
      isActive:       accounts.isActive,
      currencyCode:   currencies.code,
      securityTicker: securities.ticker,
    })
    .from(accounts)
    .innerJoin(currencies, eq(accounts.currencyId, currencies.id))
    .leftJoin(securities, eq(accounts.securityId, securities.id))
    .orderBy(asc(accounts.category))
    .all();
}

export function getAccountById(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
): AccountDetailRow | undefined {
  const row = db
    .select({
      id:              accounts.id,
      name:            accounts.name,
      type:            accounts.type,
      accountType:     accounts.accountType,
      currencyId:      accounts.currencyId,
      category:        accounts.category,
      isActive:        accounts.isActive,
      isReconcilable:  accounts.isReconcilable,
      securityId:      accounts.securityId,
      currencyCode:    currencies.code,
      securityTicker:  securities.ticker,
    })
    .from(accounts)
    .innerJoin(currencies, eq(accounts.currencyId, currencies.id))
    .leftJoin(securities, eq(accounts.securityId, securities.id))
    .where(eq(accounts.id, id))
    .get();
  return row ?? undefined;
}

export function createAccount(
  db: BetterSQLite3Database<typeof schema>,
  data: InsertAccount,
): Account {
  const result = db.insert(accounts).values(data).returning().all();
  return result[0]!;
}

export function updateAccount(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
  data: Partial<InsertAccount>,
): Account | undefined {
  const result = db.update(accounts).set(data).where(eq(accounts.id, id)).returning().all();
  return result[0];
}

export function deleteAccount(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
): void {
  db.delete(accounts).where(eq(accounts.id, id)).run();
}

export function hasTransactionEntries(
  db: BetterSQLite3Database<typeof schema>,
  accountId: number,
): boolean {
  const row = db
    .select({ total: count() })
    .from(transactionEntries)
    .where(eq(transactionEntries.accountId, accountId))
    .get();
  return (row?.total ?? 0) > 0;
}

export function getAllCurrencies(
  db: BetterSQLite3Database<typeof schema>,
): Array<{ id: number; code: string; name: string }> {
  return db.select({ id: currencies.id, code: currencies.code, name: currencies.name }).from(currencies).all();
}

export function getAllSecurities(
  db: BetterSQLite3Database<typeof schema>,
): Array<{ id: number; ticker: string; name: string }> {
  return db.select({ id: securities.id, ticker: securities.ticker, name: securities.name }).from(securities).all();
}
