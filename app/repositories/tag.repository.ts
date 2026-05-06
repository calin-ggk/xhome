import { asc, count, eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { tags, transactionTagMap } from '~/db/schema';
import type { Tag, InsertTag } from '~/db/schema';
import type * as schema from '~/db/schema';

export function getAllTags(
  db: BetterSQLite3Database<typeof schema>,
): Tag[] {
  return db.select().from(tags).orderBy(asc(tags.name)).all();
}

export function getTagById(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
): Tag | undefined {
  return db.select().from(tags).where(eq(tags.id, id)).get() ?? undefined;
}

export function createTag(
  db: BetterSQLite3Database<typeof schema>,
  data: InsertTag,
): Tag {
  return db.insert(tags).values(data).returning().all()[0]!;
}

export function updateTag(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
  data: Partial<InsertTag>,
): Tag | undefined {
  return db.update(tags).set(data).where(eq(tags.id, id)).returning().all()[0];
}

export function deleteTag(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
): void {
  db.delete(tags).where(eq(tags.id, id)).run();
}

export function isUsedByTransactions(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
): boolean {
  const row = db.select({ n: count() }).from(transactionTagMap).where(eq(transactionTagMap.tagId, id)).get();
  return (row?.n ?? 0) > 0;
}
