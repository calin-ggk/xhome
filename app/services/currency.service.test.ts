import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as repo from '~/repositories/currency.repository';
import {
  getAllCurrencies,
  getCurrencyById,
  createCurrency,
  updateCurrency,
  deleteCurrency,
  setBaseCurrency,
} from './currency.service';
import type { Currency } from '~/db/schema';

vi.mock('~/repositories/currency.repository');

const mockCurrency: Currency = {
  id: 1, code: 'RON', name: 'Romanian Leu', symbol: 'RON', decimalPlaces: 2, isBase: 1,
};

const formData = { code: 'USD', name: 'US Dollar', symbol: '$', decimalPlaces: 2 };

beforeEach(() => { vi.resetAllMocks(); });

describe('getAllCurrencies', () => {
  it('delegates to repo', () => {
    vi.mocked(repo.getAllCurrencies).mockReturnValue([mockCurrency]);
    expect(getAllCurrencies({} as never)).toEqual([mockCurrency]);
  });
});

describe('getCurrencyById', () => {
  it('returns currency from repo', () => {
    vi.mocked(repo.getCurrencyById).mockReturnValue(mockCurrency);
    expect(getCurrencyById({} as never, 1)).toEqual(mockCurrency);
  });

  it('returns undefined when not found', () => {
    vi.mocked(repo.getCurrencyById).mockReturnValue(undefined);
    expect(getCurrencyById({} as never, 999)).toBeUndefined();
  });
});

describe('createCurrency', () => {
  it('returns ok:true on success', () => {
    vi.mocked(repo.createCurrency).mockReturnValue(mockCurrency);
    expect(createCurrency({} as never, formData)).toEqual({ ok: true });
  });

  it('returns ok:false with duplicateCode on UNIQUE error', () => {
    vi.mocked(repo.createCurrency).mockImplementation(() => {
      throw new Error('UNIQUE constraint failed: currencies.code');
    });
    expect(createCurrency({} as never, formData)).toEqual({ ok: false, error: 'currencies.duplicateCode' });
  });

  it('rethrows unexpected errors', () => {
    vi.mocked(repo.createCurrency).mockImplementation(() => { throw new Error('disk error'); });
    expect(() => createCurrency({} as never, formData)).toThrow('disk error');
  });
});

describe('updateCurrency', () => {
  it('returns ok:true on success', () => {
    vi.mocked(repo.getCurrencyById).mockReturnValue(mockCurrency);
    vi.mocked(repo.updateCurrency).mockReturnValue(mockCurrency);
    expect(updateCurrency({} as never, 1, formData)).toEqual({ ok: true });
  });

  it('returns ok:false when currency not found', () => {
    vi.mocked(repo.getCurrencyById).mockReturnValue(undefined);
    expect(updateCurrency({} as never, 999, formData)).toEqual({ ok: false, error: 'currencies.notFound' });
  });

  it('returns ok:false on UNIQUE constraint', () => {
    vi.mocked(repo.getCurrencyById).mockReturnValue(mockCurrency);
    vi.mocked(repo.updateCurrency).mockImplementation(() => {
      throw new Error('UNIQUE constraint failed: currencies.code');
    });
    expect(updateCurrency({} as never, 1, formData)).toEqual({ ok: false, error: 'currencies.duplicateCode' });
  });
});

describe('deleteCurrency', () => {
  it('returns ok:true when deletion succeeds', () => {
    vi.mocked(repo.getCurrencyById).mockReturnValue({ ...mockCurrency, isBase: 0 });
    vi.mocked(repo.isUsedByAccounts).mockReturnValue(false);
    vi.mocked(repo.isUsedBySecurities).mockReturnValue(false);
    vi.mocked(repo.isUsedByExchangeRates).mockReturnValue(false);
    expect(deleteCurrency({} as never, 1)).toEqual({ ok: true });
    expect(repo.deleteCurrency).toHaveBeenCalled();
  });

  it('returns ok:false when not found', () => {
    vi.mocked(repo.getCurrencyById).mockReturnValue(undefined);
    expect(deleteCurrency({} as never, 999)).toEqual({ ok: false, error: 'currencies.notFound' });
  });

  it('returns ok:false when currency is base', () => {
    vi.mocked(repo.getCurrencyById).mockReturnValue(mockCurrency); // isBase: 1
    expect(deleteCurrency({} as never, 1)).toEqual({ ok: false, error: 'currencies.cannotDeleteBase' });
  });

  it('returns ok:false when used by accounts', () => {
    vi.mocked(repo.getCurrencyById).mockReturnValue({ ...mockCurrency, isBase: 0 });
    vi.mocked(repo.isUsedByAccounts).mockReturnValue(true);
    expect(deleteCurrency({} as never, 1)).toEqual({ ok: false, error: 'currencies.cannotDeleteUsed' });
  });

  it('returns ok:false when used by securities', () => {
    vi.mocked(repo.getCurrencyById).mockReturnValue({ ...mockCurrency, isBase: 0 });
    vi.mocked(repo.isUsedByAccounts).mockReturnValue(false);
    vi.mocked(repo.isUsedBySecurities).mockReturnValue(true);
    expect(deleteCurrency({} as never, 1)).toEqual({ ok: false, error: 'currencies.cannotDeleteUsed' });
  });
});

describe('setBaseCurrency', () => {
  it('clears all and sets the given currency as base', () => {
    vi.mocked(repo.getCurrencyById).mockReturnValue(mockCurrency);
    expect(setBaseCurrency({} as never, 1)).toEqual({ ok: true });
    expect(repo.clearAllBaseCurrencies).toHaveBeenCalled();
    expect(repo.setBaseCurrencyFlag).toHaveBeenCalledWith(expect.anything(), 1);
  });

  it('returns ok:false when not found', () => {
    vi.mocked(repo.getCurrencyById).mockReturnValue(undefined);
    expect(setBaseCurrency({} as never, 999)).toEqual({ ok: false, error: 'currencies.notFound' });
  });
});
