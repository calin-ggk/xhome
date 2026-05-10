import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '~/db/schema';

// Mock repository and yahoo-finance
vi.mock('~/repositories/reconciliation.repository');
vi.mock('~/repositories/currency.repository');
vi.mock('~/lib/yahoo-finance');
vi.mock('~/config', () => ({ env: { BASE_CURRENCY: 'RON' } }));

import * as repo from '~/repositories/reconciliation.repository';
import * as currencyRepo from '~/repositories/currency.repository';
import * as yahoo from '~/lib/yahoo-finance';
import {
  computeBookBalance,
  getReconciliationPageData,
  saveReconciliation,
} from './reconciliation.service';

type DB = BetterSQLite3Database<typeof schema>;
const db = {} as DB;

const baseAccount = {
  id: 1, name: 'Bank', type: 'debit', category: 'asset/bank',
  currencyId: 1, currencyCode: 'RON', decimalPlaces: 2, isReconcilable: 1,
};

const baseCurrency = { id: 1, code: 'RON', name: 'Romanian Leu', symbol: 'RON', decimalPlaces: 2 };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(repo.getAccountsForReconciliation).mockReturnValue([baseAccount]);
  vi.mocked(repo.getReconciledAccountIds).mockReturnValue(new Set());
  vi.mocked(currencyRepo.getCurrencyByCode).mockReturnValue(baseCurrency);
  vi.mocked(repo.getStoredExchangeRate).mockReturnValue({ rate: 10000, rateScale: 4 });
  vi.mocked(repo.saveReconciliationTransaction).mockReturnValue({ id: 42 });
  vi.mocked(repo.saveReconciliationLog).mockReturnValue(undefined);
  vi.mocked(repo.findAccountByCategory).mockReturnValue(null);
  vi.mocked(repo.createReconciliationAccount).mockReturnValue({
    id: 10, name: 'Reconciliation Surplus', type: 'credit', accountType: 'simple',
    category: 'equity/reconciliation-surplus', currencyId: 1, isActive: 1, isReconcilable: 0, securityId: null,
  });
});

// ── computeBookBalance ────────────────────────────────────────────────────────

describe('computeBookBalance', () => {
  it('returns 0 when no snapshot and no entries', () => {
    vi.mocked(repo.getLastSnapshot).mockReturnValue(null);
    vi.mocked(repo.getEntriesSince).mockReturnValue(0);
    expect(computeBookBalance(db, 1)).toBe(0);
  });

  it('returns snapshot balance + delta', () => {
    vi.mocked(repo.getLastSnapshot).mockReturnValue({ balance: 50000, date: '2024-04-01' });
    vi.mocked(repo.getEntriesSince).mockReturnValue(5000);
    expect(computeBookBalance(db, 1)).toBe(55000);
  });

  it('sums all entries when no snapshot', () => {
    vi.mocked(repo.getLastSnapshot).mockReturnValue(null);
    vi.mocked(repo.getEntriesSince).mockReturnValue(20000);
    expect(computeBookBalance(db, 1)).toBe(20000);
  });
});

// ── getReconciliationPageData ─────────────────────────────────────────────────

describe('getReconciliationPageData', () => {
  it('returns all accounts with reconciled flag', () => {
    vi.mocked(repo.getReconciledAccountIds).mockReturnValue(new Set([1]));
    vi.mocked(repo.getLastSnapshot).mockReturnValue(null);
    vi.mocked(repo.getEntriesSince).mockReturnValue(0);
    const data = getReconciliationPageData(db, undefined, '2024-05-01');
    expect(data.accounts[0]!.reconciled).toBe(true);
    expect(data.pendingCount).toBe(0);
    expect(data.selected).toBeNull();
  });

  it('populates selected with book balance when accountId given', () => {
    vi.mocked(repo.getLastSnapshot).mockReturnValue({ balance: 30000, date: '2024-04-01' });
    vi.mocked(repo.getEntriesSince).mockReturnValue(2000);
    const data = getReconciliationPageData(db, 1, '2024-05-01');
    expect(data.selected?.account.id).toBe(1);
    expect(data.selected?.bookBalance).toBe(32000);
  });
});

// ── saveReconciliation ────────────────────────────────────────────────────────

describe('saveReconciliation', () => {
  beforeEach(() => {
    vi.mocked(repo.getLastSnapshot).mockReturnValue({ balance: 10000, date: '2024-04-01' });
    vi.mocked(repo.getEntriesSince).mockReturnValue(0);
  });

  it('returns error when account not found', async () => {
    vi.mocked(repo.getAccountsForReconciliation).mockReturnValue([]);
    const r = await saveReconciliation(db, { accountId: 99, realBalanceCents: 10000, userEntries: [], today: '2024-05-01' });
    expect(r.ok).toBe(false);
    expect((r as { ok: false; error: string }).error).toBe('reconcile.notFound');
  });

  it('saves log with null transactionId when diff is 0', async () => {
    const r = await saveReconciliation(db, { accountId: 1, realBalanceCents: 10000, userEntries: [], today: '2024-05-01' });
    expect(r.ok).toBe(true);
    expect((r as { ok: true; data: { transactionId: number | null } }).data.transactionId).toBeNull();
    expect(repo.saveReconciliationLog).toHaveBeenCalledWith(db, expect.objectContaining({ transactionId: null }));
    expect(repo.saveReconciliationTransaction).not.toHaveBeenCalled();
  });

  it('creates surplus transaction when diff > 0 (real > book, debit account)', async () => {
    // book = 10000, real = 15000, diff = +5000
    const r = await saveReconciliation(db, { accountId: 1, realBalanceCents: 15000, userEntries: [], today: '2024-05-01' });
    expect(r.ok).toBe(true);
    expect(repo.createReconciliationAccount).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ category: 'equity/reconciliation-surplus' }),
    );
    const entries = vi.mocked(repo.saveReconciliationTransaction).mock.calls[0]![1].entries;
    expect(entries[0]!.side).toBe('debit');   // fixed: debit bank
    expect(entries[entries.length - 1]!.side).toBe('credit'); // auto: credit surplus
  });

  it('creates deficit transaction when diff < 0 (real < book, debit account)', async () => {
    // book = 10000, real = 8000, diff = -2000
    vi.mocked(repo.createReconciliationAccount).mockReturnValue({
      id: 11, name: 'Reconciliation Deficit', type: 'credit', accountType: 'simple',
      category: 'equity/reconciliation-deficit', currencyId: 1, isActive: 1, isReconcilable: 0, securityId: null,
    });
    const r = await saveReconciliation(db, { accountId: 1, realBalanceCents: 8000, userEntries: [], today: '2024-05-01' });
    expect(r.ok).toBe(true);
    expect(repo.createReconciliationAccount).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ category: 'equity/reconciliation-deficit' }),
    );
    const entries = vi.mocked(repo.saveReconciliationTransaction).mock.calls[0]![1].entries;
    expect(entries[0]!.side).toBe('credit');  // fixed: credit bank
    expect(entries[entries.length - 1]!.side).toBe('debit'); // auto: debit deficit
  });

  it('user entries reduce the auto amount', async () => {
    // book = 10000, real = 15000, diff = +5000
    // user explains 2000 of it via credit income
    const userEntries = [{ accountId: 1, side: 'credit' as const, amount: 2000 }];
    await saveReconciliation(db, { accountId: 1, realBalanceCents: 15000, userEntries, today: '2024-05-01' });
    const entries = vi.mocked(repo.saveReconciliationTransaction).mock.calls[0]![1].entries;
    // auto entry should be 5000 - (-(-2000)) = 5000 - 2000 = 3000
    // fixed signed = +5000; user signed = -2000; auto = -(5000 + (-2000)) = -3000 → credit 3000
    const autoEntry = entries[entries.length - 1]!;
    expect(autoEntry.amount).toBe(3000);
    expect(autoEntry.side).toBe('credit');
  });

  it('fetches exchange rate from yahoo when not stored', async () => {
    // Use a non-base-currency account so the rate lookup is triggered
    const eurAccount = { ...baseAccount, id: 2, category: 'asset/bank-eur', currencyId: 2, currencyCode: 'EUR', isReconcilable: 1 };
    vi.mocked(repo.getAccountsForReconciliation).mockReturnValue([eurAccount]);
    vi.mocked(repo.getStoredExchangeRate).mockReturnValue(null);
    vi.mocked(yahoo.fetchExchangeRate).mockResolvedValue({ rate: 49000, rateScale: 4 });
    await saveReconciliation(db, { accountId: 2, realBalanceCents: 15000, userEntries: [], today: '2024-05-01' });
    expect(yahoo.fetchExchangeRate).toHaveBeenCalled();
    expect(repo.upsertExchangeRate).toHaveBeenCalled();
  });
});
