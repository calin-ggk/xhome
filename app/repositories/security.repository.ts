import { asc, count, eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { accounts, currencies, securities } from '~/db/schema';
import type { Security, InsertSecurity } from '~/db/schema';
import type * as schema from '~/db/schema';

export type SecurityRow = Security & { currencyCode: string };

export function getAllSecurities(
  db: BetterSQLite3Database<typeof schema>,
): SecurityRow[] {
  return db
    .select({
      id:            securities.id,
      ticker:        securities.ticker,
      name:          securities.name,
      currencyId:    securities.currencyId,
      type:          securities.type,
      quantityScale: securities.quantityScale,
      currencyCode:  currencies.code,
    })
    .from(securities)
    .innerJoin(currencies, eq(securities.currencyId, currencies.id))
    .orderBy(asc(securities.ticker))
    .all() as SecurityRow[];
}

export function getSecurityById(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
): Security | undefined {
  return db.select().from(securities).where(eq(securities.id, id)).get() ?? undefined;
}

export function createSecurity(
  db: BetterSQLite3Database<typeof schema>,
  data: InsertSecurity,
): Security {
  return db.insert(securities).values(data).returning().all()[0]!;
}

export function updateSecurity(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
  data: Partial<InsertSecurity>,
): Security | undefined {
  return db.update(securities).set(data).where(eq(securities.id, id)).returning().all()[0];
}

export function deleteSecurity(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
): void {
  db.delete(securities).where(eq(securities.id, id)).run();
}

export function isUsedByAccounts(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
): boolean {
  const row = db.select({ n: count() }).from(accounts).where(eq(accounts.securityId, id)).get();
  return (row?.n ?? 0) > 0;
}
