import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '~/db/schema';
import * as repo from '~/repositories/reconciliation.repository';
import type { AccountOption } from '~/repositories/reconciliation.repository';
import { fetchExchangeRate } from '~/lib/yahoo-finance';
import { logger } from '~/lib/logger';

export type { AccountOption };

// ── Public types ──────────────────────────────────────────────────────────────

export type AccountWithStatus = AccountOption & { reconciled: boolean };

export type PageData = {
  accounts:     AccountWithStatus[];
  pendingCount: number;
  selected: {
    account:      AccountOption;
    bookBalance:  number;
  } | null;
  baseCurrencyCode: string;
  today:        string;
};

export type UserEntry = {
  accountId: number;
  side:      'debit' | 'credit';
  amount:    number;
};

export type SaveInput = {
  accountId:        number;
  realBalanceCents: number;
  userEntries:      UserEntry[];
  today:            string;
};

export type ServiceResult<T> =
  | { ok: true;  data: T }
  | { ok: false; error: string };

// ── Service functions ─────────────────────────────────────────────────────────

export function getReconciliationPageData(
  db: BetterSQLite3Database<typeof schema>,
  accountId?: number,
  today = new Date().toISOString().slice(0, 10),
): PageData {
  const allAccounts = repo.getAccountsForReconciliation(db);
  const reconciledIds = repo.getReconciledAccountIds(db, today);
  const baseCurrency = repo.getBaseCurrency(db);

  const accounts: AccountWithStatus[] = allAccounts.map(a => ({
    ...a,
    reconciled: reconciledIds.has(a.id),
  }));

  const pendingCount = accounts.filter(a => !a.reconciled).length;

  let selected: PageData['selected'] = null;
  if (accountId != null) {
    const account = allAccounts.find(a => a.id === accountId);
    if (account) {
      selected = { account, bookBalance: computeBookBalance(db, accountId) };
    }
  }

  return {
    accounts,
    pendingCount,
    selected,
    baseCurrencyCode: baseCurrency?.code ?? '',
    today,
  };
}

export async function saveReconciliation(
  db: BetterSQLite3Database<typeof schema>,
  input: SaveInput,
): Promise<ServiceResult<{ transactionId: number | null }>> {
  const allAccounts = repo.getAccountsForReconciliation(db);
  const account = allAccounts.find(a => a.id === input.accountId);
  if (!account) return { ok: false, error: 'reconcile.notFound' };

  const bookBalance = computeBookBalance(db, input.accountId);
  const diff = input.realBalanceCents - bookBalance;

  if (diff === 0) {
    repo.saveReconciliationLog(db, {
      accountId:     input.accountId,
      date:          input.today,
      transactionId: null,
      bookBalance,
      realBalance:   input.realBalanceCents,
    });
    logger.info({ event: 'reconciliation.saved', accountId: input.accountId, diff: 0 });
    return { ok: true, data: { transactionId: null } };
  }

  // Resolve exchange rate for the account's currency
  const baseCurrency = repo.getBaseCurrency(db);
  if (!baseCurrency) return { ok: false, error: 'reconcile.notFound' };

  const rate = await resolveExchangeRate(
    db,
    account.currencyId,
    account.currencyCode,
    baseCurrency.code,
    input.today,
  );

  // Fixed entry for the reconciled account
  const fixedSide = deriveFixedSide(account.type, diff);
  const fixedAmount = Math.abs(diff);
  const fixedAmountBase = toBase(fixedAmount, rate);

  // Determine auto side using original-currency sign (rates are always positive so sign is preserved)
  const fixedSigned = toSigned(fixedAmount, fixedSide);
  const userSigned = input.userEntries.reduce(
    (sum, e) => sum + toSigned(e.amount, e.side),
    0,
  );
  const autoSide: 'debit' | 'credit' = (fixedSigned + userSigned) <= 0 ? 'debit' : 'credit';

  // Auto-create the appropriate reconciliation account
  const reconCategory = autoSide === 'credit'
    ? 'equity/reconciliation-surplus'
    : 'equity/reconciliation-deficit';
  const reconName = autoSide === 'credit'
    ? 'Reconciliation Surplus'
    : 'Reconciliation Deficit';

  let reconAccount = repo.findAccountByCategory(db, reconCategory);
  if (!reconAccount) {
    reconAccount = repo.createReconciliationAccount(db, {
      name:       reconName,
      category:   reconCategory,
      currencyId: baseCurrency.id,
    });
  }

  // Build user entry rows — resolve rates per account
  const userEntryRows: repo.EntryInput[] = [];
  for (const e of input.userEntries) {
    const ua = allAccounts.find(a => a.id === e.accountId);
    if (!ua) return { ok: false, error: 'reconcile.invalidAccount' };
    const uRate = await resolveExchangeRate(db, ua.currencyId, ua.currencyCode, baseCurrency.code, input.today);
    userEntryRows.push({
      accountId:  e.accountId,
      side:       e.side,
      amount:     e.amount,
      amountBase: toBase(e.amount, uRate),
    });
  }

  // Auto entry balances in base currency (recon account is always in base currency)
  const userSignedBase = userEntryRows.reduce(
    (sum, e) => sum + toSigned(e.amountBase, e.side),
    0,
  );
  const autoAmountBase = Math.abs(toSigned(fixedAmountBase, fixedSide) + userSignedBase);

  const entries: repo.EntryInput[] = [
    { accountId: input.accountId, side: fixedSide, amount: fixedAmount, amountBase: fixedAmountBase },
    ...userEntryRows,
    { accountId: reconAccount.id, side: autoSide, amount: autoAmountBase, amountBase: autoAmountBase },
  ];

  try {
    const tx = repo.saveReconciliationTransaction(db, {
      date:        input.today,
      description: `Reconciliation – ${account.category} – ${input.today}`,
      entries,
    });

    repo.saveReconciliationLog(db, {
      accountId:     input.accountId,
      date:          input.today,
      transactionId: tx.id,
      bookBalance,
      realBalance:   input.realBalanceCents,
    });

    logger.info({ event: 'reconciliation.saved', accountId: input.accountId, diff, transactionId: tx.id });
    return { ok: true, data: { transactionId: tx.id } };
  } catch (err) {
    logger.error({ event: 'reconciliation.failed', error: String(err) });
    return { ok: false, error: 'reconcile.invalidSubmission' };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function computeBookBalance(
  db: BetterSQLite3Database<typeof schema>,
  accountId: number,
): number {
  const snapshot = repo.getLastSnapshot(db, accountId);
  const sinceDate = snapshot?.date ?? '0000-01-01';
  const delta = repo.getEntriesSince(db, accountId, sinceDate);
  return (snapshot?.balance ?? 0) + delta;
}

function deriveFixedSide(accountType: string, diff: number): 'debit' | 'credit' {
  if (accountType === 'debit') return diff > 0 ? 'debit' : 'credit';
  return diff > 0 ? 'credit' : 'debit';
}

function toSigned(amount: number, side: 'debit' | 'credit'): number {
  return side === 'debit' ? amount : -amount;
}

function toBase(amount: number, rate: { rate: number; rateScale: number }): number {
  return Math.round(amount * rate.rate / Math.pow(10, rate.rateScale));
}

async function resolveExchangeRate(
  db: BetterSQLite3Database<typeof schema>,
  currencyId: number,
  currencyCode: string,
  baseCurrencyCode: string,
  date: string,
): Promise<{ rate: number; rateScale: number }> {
  const stored = repo.getStoredExchangeRate(db, currencyId, date);
  if (stored) return stored;

  if (currencyCode === baseCurrencyCode) {
    return { rate: 10000, rateScale: 4 };
  }

  const fetched = await fetchExchangeRate(currencyCode, baseCurrencyCode, date);
  if (fetched) {
    repo.upsertExchangeRate(db, currencyId, date, fetched.rate, fetched.rateScale);
    return fetched;
  }

  logger.warn({ event: 'reconciliation.rate_missing', currencyCode, date });
  return { rate: 10000, rateScale: 4 };
}
