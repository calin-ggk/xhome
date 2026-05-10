import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as repo from '~/repositories/security.repository';
import * as currencyRepo from '~/repositories/currency.repository';
import {
  getAllSecurities,
  getSecurityFormData,
  getSecurityEditFormData,
  createSecurity,
  updateSecurity,
  deleteSecurity,
} from './security.service';
import type { Security, Currency } from '~/db/schema';

vi.mock('~/repositories/security.repository');
vi.mock('~/repositories/currency.repository');

const mockSecurity: Security = {
  id: 1, ticker: 'AAPL', name: 'Apple Inc.', currencyId: 1, type: 'stock', quantityScale: 6,
};
const mockCurrency: Currency = {
  id: 1, code: 'USD', name: 'US Dollar', symbol: '$', decimalPlaces: 2,
};
const formData = { ticker: 'AAPL', name: 'Apple Inc.', currencyId: 1, type: 'stock' as const, quantityScale: 6 };

beforeEach(() => { vi.resetAllMocks(); });

describe('getAllSecurities', () => {
  it('delegates to repo', () => {
    vi.mocked(repo.getAllSecurities).mockReturnValue([{ ...mockSecurity, currencyCode: 'USD' }]);
    expect(getAllSecurities({} as never)).toHaveLength(1);
  });
});

describe('getSecurityFormData', () => {
  it('returns currencies list', () => {
    vi.mocked(currencyRepo.getAllCurrencies).mockReturnValue([mockCurrency]);
    expect(getSecurityFormData({} as never).currencies).toHaveLength(1);
  });
});

describe('getSecurityEditFormData', () => {
  it('returns null when not found', () => {
    vi.mocked(repo.getSecurityById).mockReturnValue(undefined);
    expect(getSecurityEditFormData({} as never, 999)).toBeNull();
  });

  it('returns security and currencies', () => {
    vi.mocked(repo.getSecurityById).mockReturnValue(mockSecurity);
    vi.mocked(currencyRepo.getAllCurrencies).mockReturnValue([mockCurrency]);
    const result = getSecurityEditFormData({} as never, 1);
    expect(result?.security.ticker).toBe('AAPL');
    expect(result?.currencies).toHaveLength(1);
  });
});

describe('createSecurity', () => {
  it('returns ok:true on success', () => {
    vi.mocked(repo.createSecurity).mockReturnValue(mockSecurity);
    expect(createSecurity({} as never, formData)).toEqual({ ok: true });
  });

  it('returns ok:false on UNIQUE constraint', () => {
    vi.mocked(repo.createSecurity).mockImplementation(() => {
      throw new Error('UNIQUE constraint failed: securities.ticker');
    });
    expect(createSecurity({} as never, formData)).toEqual({ ok: false, error: 'securities.duplicateTicker' });
  });

  it('rethrows unexpected errors', () => {
    vi.mocked(repo.createSecurity).mockImplementation(() => { throw new Error('disk error'); });
    expect(() => createSecurity({} as never, formData)).toThrow('disk error');
  });
});

describe('updateSecurity', () => {
  it('returns ok:true on success', () => {
    vi.mocked(repo.getSecurityById).mockReturnValue(mockSecurity);
    vi.mocked(repo.updateSecurity).mockReturnValue(mockSecurity);
    expect(updateSecurity({} as never, 1, formData)).toEqual({ ok: true });
  });

  it('returns ok:false when not found', () => {
    vi.mocked(repo.getSecurityById).mockReturnValue(undefined);
    expect(updateSecurity({} as never, 999, formData)).toEqual({ ok: false, error: 'securities.notFound' });
  });

  it('returns ok:false on UNIQUE constraint', () => {
    vi.mocked(repo.getSecurityById).mockReturnValue(mockSecurity);
    vi.mocked(repo.updateSecurity).mockImplementation(() => {
      throw new Error('UNIQUE constraint failed: securities.ticker');
    });
    expect(updateSecurity({} as never, 1, formData)).toEqual({ ok: false, error: 'securities.duplicateTicker' });
  });
});

describe('deleteSecurity', () => {
  it('returns ok:true on success', () => {
    vi.mocked(repo.getSecurityById).mockReturnValue(mockSecurity);
    vi.mocked(repo.isUsedByAccounts).mockReturnValue(false);
    expect(deleteSecurity({} as never, 1)).toEqual({ ok: true });
    expect(repo.deleteSecurity).toHaveBeenCalled();
  });

  it('returns ok:false when not found', () => {
    vi.mocked(repo.getSecurityById).mockReturnValue(undefined);
    expect(deleteSecurity({} as never, 999)).toEqual({ ok: false, error: 'securities.notFound' });
  });

  it('returns ok:false when used by accounts', () => {
    vi.mocked(repo.getSecurityById).mockReturnValue(mockSecurity);
    vi.mocked(repo.isUsedByAccounts).mockReturnValue(true);
    expect(deleteSecurity({} as never, 1)).toEqual({ ok: false, error: 'securities.cannotDeleteUsed' });
  });
});
