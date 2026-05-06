import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as repo from '~/repositories/tag.repository';
import {
  getAllTags,
  getTagById,
  createTag,
  updateTag,
  deleteTag,
} from './tag.service';
import type { Tag } from '~/db/schema';

vi.mock('~/repositories/tag.repository');

const mockTag: Tag = { id: 1, name: 'groceries' };
const formData = { name: 'groceries' };

beforeEach(() => { vi.resetAllMocks(); });

describe('getAllTags', () => {
  it('delegates to repo', () => {
    vi.mocked(repo.getAllTags).mockReturnValue([mockTag]);
    expect(getAllTags({} as never)).toEqual([mockTag]);
  });
});

describe('getTagById', () => {
  it('returns tag from repo', () => {
    vi.mocked(repo.getTagById).mockReturnValue(mockTag);
    expect(getTagById({} as never, 1)).toEqual(mockTag);
  });

  it('returns undefined when not found', () => {
    vi.mocked(repo.getTagById).mockReturnValue(undefined);
    expect(getTagById({} as never, 999)).toBeUndefined();
  });
});

describe('createTag', () => {
  it('returns ok:true on success', () => {
    vi.mocked(repo.createTag).mockReturnValue(mockTag);
    expect(createTag({} as never, formData)).toEqual({ ok: true });
  });

  it('returns ok:false with duplicateName on UNIQUE error', () => {
    vi.mocked(repo.createTag).mockImplementation(() => {
      throw new Error('UNIQUE constraint failed: tags.name');
    });
    expect(createTag({} as never, formData)).toEqual({ ok: false, error: 'tags.duplicateName' });
  });

  it('rethrows unexpected errors', () => {
    vi.mocked(repo.createTag).mockImplementation(() => { throw new Error('disk error'); });
    expect(() => createTag({} as never, formData)).toThrow('disk error');
  });
});

describe('updateTag', () => {
  it('returns ok:true on success', () => {
    vi.mocked(repo.getTagById).mockReturnValue(mockTag);
    vi.mocked(repo.updateTag).mockReturnValue(mockTag);
    expect(updateTag({} as never, 1, formData)).toEqual({ ok: true });
  });

  it('returns ok:false when tag not found', () => {
    vi.mocked(repo.getTagById).mockReturnValue(undefined);
    expect(updateTag({} as never, 999, formData)).toEqual({ ok: false, error: 'tags.notFound' });
  });

  it('returns ok:false on UNIQUE constraint', () => {
    vi.mocked(repo.getTagById).mockReturnValue(mockTag);
    vi.mocked(repo.updateTag).mockImplementation(() => {
      throw new Error('UNIQUE constraint failed: tags.name');
    });
    expect(updateTag({} as never, 1, formData)).toEqual({ ok: false, error: 'tags.duplicateName' });
  });
});

describe('deleteTag', () => {
  it('returns ok:true when deletion succeeds', () => {
    vi.mocked(repo.getTagById).mockReturnValue(mockTag);
    vi.mocked(repo.isUsedByTransactions).mockReturnValue(false);
    expect(deleteTag({} as never, 1)).toEqual({ ok: true });
    expect(repo.deleteTag).toHaveBeenCalled();
  });

  it('returns ok:false when not found', () => {
    vi.mocked(repo.getTagById).mockReturnValue(undefined);
    expect(deleteTag({} as never, 999)).toEqual({ ok: false, error: 'tags.notFound' });
  });

  it('returns ok:false when tag is in use', () => {
    vi.mocked(repo.getTagById).mockReturnValue(mockTag);
    vi.mocked(repo.isUsedByTransactions).mockReturnValue(true);
    expect(deleteTag({} as never, 1)).toEqual({ ok: false, error: 'tags.cannotDeleteUsed' });
    expect(repo.deleteTag).not.toHaveBeenCalled();
  });
});
