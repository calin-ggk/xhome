import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '~/db/schema';
import type { Transaction } from '~/db/schema';
import type { TransactionFormData } from '~/schemas/transaction.schema';
import * as repo from '~/repositories/transaction.repository';
import { logger } from '~/lib/logger';
import type {
  TransactionListRow, TransactionDetail, AccountOption,
  ExchangeRateRow, TagOption, BaseCurrency,
  TransactionFilters, TransactionPage,
} from '~/repositories/transaction.repository';

export type { TransactionListRow, TransactionDetail, AccountOption, ExchangeRateRow, TagOption, BaseCurrency, TransactionFilters, TransactionPage };

export type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: string };

// ── Page data ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;//25;

export function getTransactionsPageData(
  db: BetterSQLite3Database<typeof schema>,
  filters: TransactionFilters,
  page: number,
) {
  const result      = repo.getTransactionsPaginated(db, filters, page, PAGE_SIZE);
  const filterTags  = repo.getAllTagOptions(db);
  const baseCurrency = repo.getBaseCurrency(db);
  return { ...result, filterTags, baseCurrency };
}

export function getNewTransactionFormData(db: BetterSQLite3Database<typeof schema>) {
  return {
    accounts:      repo.getActiveAccountOptions(db),
    exchangeRates: repo.getAllExchangeRates(db),
    tags:          repo.getAllTagOptions(db),
    baseCurrency:  repo.getBaseCurrency(db),
    today:         new Date().toISOString().slice(0, 10),
  };
}

export function getEditTransactionFormData(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
): {
  transaction: TransactionDetail;
  accounts: AccountOption[];
  exchangeRates: ExchangeRateRow[];
  tags: TagOption[];
  baseCurrency: BaseCurrency | null;
} | null {
  const transaction = repo.getTransactionById(db, id);
  if (!transaction) return null;
  return {
    transaction,
    accounts:      repo.getAllAccountOptions(db),
    exchangeRates: repo.getAllExchangeRates(db),
    tags:          repo.getAllTagOptions(db),
    baseCurrency:  repo.getBaseCurrency(db),
  };
}

// ── Mutations ────────────────────────────────────────────────────────────────

export function createTransaction(
  db: BetterSQLite3Database<typeof schema>,
  data: TransactionFormData,
): ServiceResult<Transaction> {
  const accountMap = buildAccountMap(repo.getAllAccountOptions(db));
  let entryRows: ReturnType<typeof buildEntryRows>;
  try {
    entryRows = buildEntryRows(data, accountMap);
  } catch {
    return { ok: false, error: 'transactions.invalidAccount' };
  }
  const tx = repo.createTransaction(
    db,
    { date: data.date, description: data.description ?? null },
    entryRows,
    data.tagIds,
  );
  saveNewRates(db, data, accountMap);
  logger.info({ event: 'transaction.created', id: tx.id, date: data.date });
  return { ok: true, data: tx };
}

export function updateTransaction(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
  data: TransactionFormData,
): ServiceResult<Transaction> {
  const accountMap = buildAccountMap(repo.getAllAccountOptions(db));
  let entryRows: ReturnType<typeof buildEntryRows>;
  try {
    entryRows = buildEntryRows(data, accountMap);
  } catch {
    return { ok: false, error: 'transactions.invalidAccount' };
  }
  const tx = repo.updateTransaction(
    db,
    id,
    { date: data.date, description: data.description ?? null },
    entryRows,
    data.tagIds,
  );
  if (!tx) return { ok: false, error: 'transactions.notFound' };
  saveNewRates(db, data, accountMap);
  logger.info({ event: 'transaction.updated', id });
  return { ok: true, data: tx };
}

export function deleteTransaction(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
): ServiceResult<void> {
  repo.deleteTransaction(db, id);
  logger.info({ event: 'transaction.deleted', id });
  return { ok: true, data: undefined };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildAccountMap(all: AccountOption[]): Map<number, AccountOption> {
  return new Map(all.map(a => [a.id, a]));
}

function buildEntryRows(
  data: TransactionFormData,
  accountMap: Map<number, AccountOption>,
) {
  return data.entries.map(e => {
    const account = accountMap.get(e.accountId);
    if (!account) throw new Error(`Account ${e.accountId} not found`);

    const amtCents    = Math.round(parseFloat(e.amountStr) * 100);
    const rateDecimal = parseFloat(e.rateStr) || 1;
    const amountBase  = Math.round(amtCents * rateDecimal);

    let quantity: number | null = null;
    if (e.quantityStr && account.accountType === 'security') {
      quantity = Math.round(parseFloat(e.quantityStr) * 1e6);
    }

    let interestRate: number | null = null;
    let maturityDate: string | null = null;
    if (account.accountType === 'deposit') {
      if (e.interestRatePct) interestRate = Math.round(parseFloat(e.interestRatePct) * 100);
      if (e.maturityDate)    maturityDate = e.maturityDate;
    }

    return {
      accountId:    e.accountId,
      side:         e.side,
      amount:       amtCents,
      amountBase,
      quantity,
      interestRate,
      maturityDate,
      memo:         e.memo || null,
    };
  });
}

function saveNewRates(
  db: BetterSQLite3Database<typeof schema>,
  data: TransactionFormData,
  accountMap: Map<number, AccountOption>,
): void {
  const seen = new Set<number>();
  for (const e of data.entries) {
    const account = accountMap.get(e.accountId);
    if (!account || account.isBaseCurrency) continue;
    if (seen.has(account.currencyId)) continue;
    seen.add(account.currencyId);

    if (repo.hasExchangeRate(db, account.currencyId, data.date)) continue;

    const rateDecimal = parseFloat(e.rateStr) || 1;
    const rateScale   = 4;
    const storedRate  = Math.round(rateDecimal * Math.pow(10, rateScale));
    repo.insertExchangeRate(db, account.currencyId, data.date, storedRate, rateScale);
  }
}
