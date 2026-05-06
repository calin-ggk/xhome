import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '~/db/schema';
import type { Tag } from '~/db/schema';
import type { TagFormData } from '~/schemas/tag.schema';
import * as repo from '~/repositories/tag.repository';
import { logger } from '~/lib/logger';

type TagResult = { ok: true } | { ok: false; error: string };

export function getAllTags(
  db: BetterSQLite3Database<typeof schema>,
): Tag[] {
  return repo.getAllTags(db);
}

export function getTagById(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
): Tag | undefined {
  return repo.getTagById(db, id);
}

export function createTag(
  db: BetterSQLite3Database<typeof schema>,
  data: TagFormData,
): TagResult {
  try {
    repo.createTag(db, { name: data.name });
    logger.info({ event: 'tag.created', name: data.name });
    return { ok: true };
  } catch (e) {
    if (e instanceof Error && e.message.includes('UNIQUE constraint failed: tags.name')) {
      return { ok: false, error: 'tags.duplicateName' };
    }
    throw e;
  }
}

export function updateTag(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
  data: TagFormData,
): TagResult {
  const existing = repo.getTagById(db, id);
  if (!existing) return { ok: false, error: 'tags.notFound' };
  try {
    repo.updateTag(db, id, { name: data.name });
    logger.info({ event: 'tag.updated', id, name: data.name });
    return { ok: true };
  } catch (e) {
    if (e instanceof Error && e.message.includes('UNIQUE constraint failed: tags.name')) {
      return { ok: false, error: 'tags.duplicateName' };
    }
    throw e;
  }
}

export function deleteTag(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
): TagResult {
  const existing = repo.getTagById(db, id);
  if (!existing) return { ok: false, error: 'tags.notFound' };
  if (repo.isUsedByTransactions(db, id)) {
    return { ok: false, error: 'tags.cannotDeleteUsed' };
  }
  repo.deleteTag(db, id);
  logger.info({ event: 'tag.deleted', id, name: existing.name });
  return { ok: true };
}
