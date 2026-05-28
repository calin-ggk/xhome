import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as repo from '~/repositories/transaction.repository';
import {
  createTransaction,
  updateTransaction,
  deleteTransaction,
  getTransactionForRepeat,
} from './transaction.service';
import type { AccountOption } from '~/repositories/transaction.repository';

vi.mock('~/repositories/transaction.repository');
vi.mock('~/repositories/currency.repository');
vi.mock('~/config', () => ({ env: { BASE_CURRENCY: 'RON' } }));

const mockTx = { id: 1, date: '2024-01-15', description: 'Salary', hash: null, createdAt: '' };

const baseAccount: AccountOption = {
  id: 1, category: 'asset/bank', name: 'Bank RON',
  currencyId: 1, currencyCode: 'RON', currencyDecimalPlaces: 2,
  accountType: 'simple', quantityScale: null,
};
const foreignAccount: AccountOption = {
  id: 2, category: 'asset/bank/eur', name: 'Bank EUR',
  currencyId: 2, currencyCode: 'EUR', currencyDecimalPlaces: 2,
  accountType: 'simple', quantityScale: null,
};
const incomeAccount: AccountOption = {
  id: 3, category: 'income/salary', name: 'Salary',
  currencyId: 1, currencyCode: 'RON', currencyDecimalPlaces: 2,
  accountType: 'simple', quantityScale: null,
};
const securityAccountScale0: AccountOption = {
  id: 4, category: 'asset/securities/snp', name: 'SNP',
  currencyId: 1, currencyCode: 'RON', currencyDecimalPlaces: 2,
  accountType: 'security', quantityScale: 0,
};
const securityAccountScale6: AccountOption = {
  id: 5, category: 'asset/securities/btc', name: 'BTC',
  currencyId: 1, currencyCode: 'RON', currencyDecimalPlaces: 2,
  accountType: 'security', quantityScale: 6,
};

const formData = {
  date:        '2024-01-15',
  description: 'Salary',
  tagIds:      [] as number[],
  entries: [
    { accountId: 1, side: 'debit'  as const, amountStr: '100.00', rateStr: '1', memo: '', quantityStr: null, interestRatePct: null, maturityDate: null },
    { accountId: 3, side: 'credit' as const, amountStr: '100.00', rateStr: '1', memo: '', quantityStr: null, interestRatePct: null, maturityDate: null },
  ],
};

beforeEach(() => { vi.resetAllMocks(); });

describe('createTransaction', () => {
  it('returns ok:true and calls repo with computed amountBase', () => {
    vi.mocked(repo.getAllAccountOptions).mockReturnValue([baseAccount, incomeAccount, foreignAccount]);
    vi.mocked(repo.createTransaction).mockReturnValue(mockTx);
    vi.mocked(repo.hasExchangeRate).mockReturnValue(true);

    const result = createTransaction({} as never, formData);

    expect(result).toEqual({ ok: true, data: mockTx });
    const [, , entryRows] = vi.mocked(repo.createTransaction).mock.calls[0]!;
    expect(entryRows[0]).toMatchObject({ amount: 10000, amountBase: 10000, side: 'debit' });
    expect(entryRows[1]).toMatchObject({ amount: 10000, amountBase: 10000, side: 'credit' });
  });

  it('computes amountBase using exchange rate for foreign currency entry', () => {
    vi.mocked(repo.getAllAccountOptions).mockReturnValue([foreignAccount, incomeAccount]);
    vi.mocked(repo.createTransaction).mockReturnValue(mockTx);
    vi.mocked(repo.hasExchangeRate).mockReturnValue(true);

    const data = {
      ...formData,
      entries: [
        { accountId: 2, side: 'debit'  as const, amountStr: '100.00', rateStr: '5', memo: '', quantityStr: null, interestRatePct: null, maturityDate: null },
        { accountId: 3, side: 'credit' as const, amountStr: '500.00', rateStr: '1', memo: '', quantityStr: null, interestRatePct: null, maturityDate: null },
      ],
    };
    createTransaction({} as never, data);

    const [, , entryRows] = vi.mocked(repo.createTransaction).mock.calls[0]!;
    expect(entryRows[0]!.amountBase).toBe(50000); // 10000 EUR cents × 5 rate = 50000 RON cents
  });

  it('saves exchange rate when not found in DB for foreign currency entry', () => {
    vi.mocked(repo.getAllAccountOptions).mockReturnValue([foreignAccount, incomeAccount]);
    vi.mocked(repo.createTransaction).mockReturnValue(mockTx);
    vi.mocked(repo.hasExchangeRate).mockReturnValue(false);

    const data = {
      ...formData,
      entries: [
        { accountId: 2, side: 'debit'  as const, amountStr: '100.00', rateStr: '5', memo: '', quantityStr: null, interestRatePct: null, maturityDate: null },
        { accountId: 3, side: 'credit' as const, amountStr: '500.00', rateStr: '1', memo: '', quantityStr: null, interestRatePct: null, maturityDate: null },
      ],
    };
    createTransaction({} as never, data);

    expect(repo.insertExchangeRate).toHaveBeenCalledWith(
      expect.anything(),
      2,          // EUR currency id
      '2024-01-15',
      50000,      // 5.00 × 10^4
      4,
    );
  });

  it('does not save exchange rate for base currency entries', () => {
    vi.mocked(repo.getAllAccountOptions).mockReturnValue([baseAccount, incomeAccount]);
    vi.mocked(repo.createTransaction).mockReturnValue(mockTx);
    vi.mocked(repo.hasExchangeRate).mockReturnValue(false);

    createTransaction({} as never, formData);

    expect(repo.insertExchangeRate).not.toHaveBeenCalled();
  });

  it('stores quantity as integer shares for quantityScale=0 security', () => {
    vi.mocked(repo.getAllAccountOptions).mockReturnValue([securityAccountScale0, incomeAccount]);
    vi.mocked(repo.createTransaction).mockReturnValue(mockTx);
    vi.mocked(repo.hasExchangeRate).mockReturnValue(true);

    const data = {
      ...formData,
      entries: [
        { accountId: 4, side: 'debit'  as const, amountStr: '12060.00', rateStr: '0.1920', memo: '', quantityStr: '12000', interestRatePct: null, maturityDate: null },
        { accountId: 3, side: 'credit' as const, amountStr: '12060.00', rateStr: '0.1920', memo: '', quantityStr: null,     interestRatePct: null, maturityDate: null },
      ],
    };
    createTransaction({} as never, data);

    const [, , entryRows] = vi.mocked(repo.createTransaction).mock.calls[0]!;
    expect(entryRows[0]!.quantity).toBe(12000); // scale 0: stored as-is
  });

  it('stores quantity as scaled integer for quantityScale=6 security', () => {
    vi.mocked(repo.getAllAccountOptions).mockReturnValue([securityAccountScale6, incomeAccount]);
    vi.mocked(repo.createTransaction).mockReturnValue(mockTx);
    vi.mocked(repo.hasExchangeRate).mockReturnValue(true);

    const data = {
      ...formData,
      entries: [
        { accountId: 5, side: 'debit'  as const, amountStr: '100.00', rateStr: '1', memo: '', quantityStr: '1.5', interestRatePct: null, maturityDate: null },
        { accountId: 3, side: 'credit' as const, amountStr: '100.00', rateStr: '1', memo: '', quantityStr: null,   interestRatePct: null, maturityDate: null },
      ],
    };
    createTransaction({} as never, data);

    const [, , entryRows] = vi.mocked(repo.createTransaction).mock.calls[0]!;
    expect(entryRows[0]!.quantity).toBe(1500000); // 1.5 × 10^6
  });

  it('returns ok:false when account is not found', () => {
    vi.mocked(repo.getAllAccountOptions).mockReturnValue([]);
    const result = createTransaction({} as never, formData);
    expect(result).toEqual({ ok: false, error: 'transactions.invalidAccount' });
  });
});

describe('updateTransaction', () => {
  it('returns ok:true on success', () => {
    vi.mocked(repo.getAllAccountOptions).mockReturnValue([baseAccount, incomeAccount]);
    vi.mocked(repo.updateTransaction).mockReturnValue(mockTx);
    vi.mocked(repo.hasExchangeRate).mockReturnValue(true);

    const result = updateTransaction({} as never, 1, formData);
    expect(result).toEqual({ ok: true, data: mockTx });
  });

  it('returns ok:false when transaction not found', () => {
    vi.mocked(repo.getAllAccountOptions).mockReturnValue([baseAccount, incomeAccount]);
    vi.mocked(repo.updateTransaction).mockReturnValue(null);
    vi.mocked(repo.hasExchangeRate).mockReturnValue(true);

    const result = updateTransaction({} as never, 999, formData);
    expect(result).toEqual({ ok: false, error: 'transactions.notFound' });
  });
});

describe('deleteTransaction', () => {
  it('calls repo and returns ok:true', () => {
    vi.mocked(repo.deleteTransaction).mockReturnValue();
    const result = deleteTransaction({} as never, 1);
    expect(result).toEqual({ ok: true, data: undefined });
    expect(repo.deleteTransaction).toHaveBeenCalledWith(expect.anything(), 1);
  });
});

describe('getTransactionForRepeat', () => {
  it('returns transaction when found', () => {
    const detail = { ...mockTx, entries: [], tagIds: [] } as never;
    vi.mocked(repo.getTransactionById).mockReturnValue(detail);
    expect(getTransactionForRepeat({} as never, 1)).toBe(detail);
    expect(repo.getTransactionById).toHaveBeenCalledWith(expect.anything(), 1);
  });

  it('returns null when transaction not found', () => {
    vi.mocked(repo.getTransactionById).mockReturnValue(null);
    expect(getTransactionForRepeat({} as never, 999)).toBeNull();
  });
});
