import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as repo from '~/repositories/account.repository';
import {
  getAccountsPageData,
  createAccount,
  updateAccount,
  deleteAccount,
} from './account.service';
import type { AccountListRow } from '~/repositories/account.repository';

vi.mock('~/repositories/account.repository');

const mockAccount = {
  id: 1, name: 'Bank', type: 'debit' as const, accountType: 'simple' as const,
  currencyId: 1, category: 'asset/bank', isActive: 1, isReconcilable: 0, securityId: null,
};

function makeRow(category: string): AccountListRow {
  return { id: 1, name: 'X', type: 'debit', accountType: 'simple', category, isActive: 1, isReconcilable: 0, currencyCode: 'RON', securityTicker: null };
}

beforeEach(() => { vi.resetAllMocks(); });

describe('getAccountsPageData', () => {
  it('groups accounts by first category segment in canonical order', () => {
    vi.mocked(repo.getAllAccounts).mockReturnValue([
      makeRow('expense/food'),
      makeRow('asset/bank'),
      makeRow('income/salary'),
      makeRow('liability/loan'),
    ]);
    const { groups } = getAccountsPageData({} as never);
    expect(groups.map(g => g.prefix)).toEqual(['asset', 'liability', 'income', 'expense']);
  });

  it('appends unknown prefixes alphabetically after canonical groups', () => {
    vi.mocked(repo.getAllAccounts).mockReturnValue([
      makeRow('zother/foo'),
      makeRow('asset/bank'),
      makeRow('custom/bar'),
    ]);
    const { groups } = getAccountsPageData({} as never);
    expect(groups.map(g => g.prefix)).toEqual(['asset', 'custom', 'zother']);
  });

  it('returns empty groups array when no accounts', () => {
    vi.mocked(repo.getAllAccounts).mockReturnValue([]);
    const { groups } = getAccountsPageData({} as never);
    expect(groups).toEqual([]);
  });
});

describe('createAccount', () => {
  const data = {
    name: 'Bank', type: 'debit' as const, accountType: 'simple' as const,
    currencyId: 1, category: 'asset/bank', isActive: 1, isReconcilable: 0, securityId: null,
  };

  it('returns ok:true on success', () => {
    vi.mocked(repo.createAccount).mockReturnValue(mockAccount);
    const result = createAccount({} as never, data);
    expect(result).toEqual({ ok: true, data: mockAccount });
  });

  it('returns ok:false with error key on UNIQUE constraint violation', () => {
    vi.mocked(repo.createAccount).mockImplementation(() => {
      throw new Error('UNIQUE constraint failed: accounts.category');
    });
    const result = createAccount({} as never, data);
    expect(result).toEqual({ ok: false, error: 'accounts.duplicateCategory' });
  });

  it('re-throws non-unique errors', () => {
    vi.mocked(repo.createAccount).mockImplementation(() => {
      throw new Error('FOREIGN KEY constraint failed');
    });
    expect(() => createAccount({} as never, data)).toThrow('FOREIGN KEY');
  });
});

describe('updateAccount', () => {
  const data = {
    name: 'Bank', type: 'debit' as const, accountType: 'simple' as const,
    currencyId: 1, category: 'asset/bank', isActive: 1, isReconcilable: 0, securityId: null,
  };

  it('returns ok:false with not-found error when account does not exist', () => {
    vi.mocked(repo.getAccountById).mockReturnValue(undefined);
    const result = updateAccount({} as never, 999, data);
    expect(result).toEqual({ ok: false, error: 'accounts.notFound' });
  });

  it('returns ok:true on success', () => {
    vi.mocked(repo.getAccountById).mockReturnValue({ ...mockAccount, currencyCode: 'RON', securityTicker: null });
    vi.mocked(repo.updateAccount).mockReturnValue(mockAccount);
    const result = updateAccount({} as never, 1, data);
    expect(result).toEqual({ ok: true, data: mockAccount });
  });

  it('returns ok:false on UNIQUE constraint violation', () => {
    vi.mocked(repo.getAccountById).mockReturnValue({ ...mockAccount, currencyCode: 'RON', securityTicker: null });
    vi.mocked(repo.updateAccount).mockImplementation(() => {
      throw new Error('UNIQUE constraint failed: accounts.category');
    });
    const result = updateAccount({} as never, 1, data);
    expect(result).toEqual({ ok: false, error: 'accounts.duplicateCategory' });
  });
});

describe('deleteAccount', () => {
  it('returns ok:false when account has transaction entries', () => {
    vi.mocked(repo.hasTransactionEntries).mockReturnValue(true);
    const result = deleteAccount({} as never, 1);
    expect(result).toEqual({ ok: false, error: 'accounts.cannotDelete' });
    expect(repo.deleteAccount).not.toHaveBeenCalled();
  });

  it('deletes and returns ok:true when account has no entries', () => {
    vi.mocked(repo.hasTransactionEntries).mockReturnValue(false);
    vi.mocked(repo.deleteAccount).mockReturnValue();
    const result = deleteAccount({} as never, 1);
    expect(result).toEqual({ ok: true, data: undefined });
    expect(repo.deleteAccount).toHaveBeenCalledWith(expect.anything(), 1);
  });
});
