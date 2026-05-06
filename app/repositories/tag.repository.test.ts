import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '~/db/schema';
import {
  getAllTags,
  getTagById,
  createTag,
  updateTag,
  deleteTag,
  isUsedByTransactions,
} from './tag.repository';

const DDL = `
  CREATE TABLE tags (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE
  );
  CREATE TABLE transactions (
    id INTEGER PRIMARY KEY, date TEXT NOT NULL,
    description TEXT NOT NULL
  );
  CREATE TABLE transaction_tag_map (
    transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    tag_id         INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    UNIQUE(transaction_id, tag_id)
  );
`;

function makeDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(DDL);
  sqlite.exec(`INSERT INTO tags VALUES (1, 'groceries')`);
  return { db: drizzle(sqlite, { schema }), sqlite };
}

describe('getAllTags', () => {
  it('returns all tags ordered by name', () => {
    const { db, sqlite } = makeDb();
    sqlite.exec(`INSERT INTO tags VALUES (2, 'utilities')`);
    expect(getAllTags(db).map(t => t.name)).toEqual(['groceries', 'utilities']);
  });
});

describe('getTagById', () => {
  it('returns the tag when it exists', () => {
    const { db } = makeDb();
    expect(getTagById(db, 1)?.name).toBe('groceries');
  });

  it('returns undefined for unknown id', () => {
    const { db } = makeDb();
    expect(getTagById(db, 999)).toBeUndefined();
  });
});

describe('createTag', () => {
  it('creates and returns a new tag', () => {
    const { db } = makeDb();
    const result = createTag(db, { name: 'travel' });
    expect(result.name).toBe('travel');
    expect(result.id).toBeTruthy();
  });
});

describe('updateTag', () => {
  it('updates and returns the tag', () => {
    const { db } = makeDb();
    const result = updateTag(db, 1, { name: 'food' });
    expect(result?.name).toBe('food');
  });

  it('returns undefined for unknown id', () => {
    const { db } = makeDb();
    expect(updateTag(db, 999, { name: 'x' })).toBeUndefined();
  });
});

describe('deleteTag', () => {
  it('deletes the tag', () => {
    const { db } = makeDb();
    deleteTag(db, 1);
    expect(getTagById(db, 1)).toBeUndefined();
  });
});

describe('isUsedByTransactions', () => {
  it('returns false when tag is not used', () => {
    const { db } = makeDb();
    expect(isUsedByTransactions(db, 1)).toBe(false);
  });

  it('returns true when tag is linked to a transaction', () => {
    const { db, sqlite } = makeDb();
    sqlite.exec(`INSERT INTO transactions VALUES (1, '2024-01-01', 'Groceries')`);
    sqlite.exec(`INSERT INTO transaction_tag_map VALUES (1, 1)`);
    expect(isUsedByTransactions(db, 1)).toBe(true);
  });
});
