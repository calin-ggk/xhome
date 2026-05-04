import { and, asc, desc, eq, gte, inArray, like, lte, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import {
  accounts, currencies, exchangeRates, tags,
  transactionEntries, transactionTagMap, transactions,
} from '~/db/schema';
import type {
  InsertTransaction, InsertTransactionEntry, Transaction, TransactionEntry,
} from '~/db/schema';
import type * as schema from '~/db/schema';

// ── Public types ─────────────────────────────────────────────────────────────

export type TransactionListRow = {
  id: number;
  date: string;
  description: string | null;
  entryCount: number;
  debitBase: number;
  tags: string[];
};

export type TransactionFilters = {
  q?: string;
  dateFrom?: string;
  dateTo?: string;
  tagId?: number;
};

export type TransactionPage = {
  rows: TransactionListRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type AccountOption = {
  id: number;
  category: string;
  name: string;
  currencyId: number;
  currencyCode: string;
  currencyDecimalPlaces: number;
  isBaseCurrency: number;
  accountType: string;
};

export type ExchangeRateRow = {
  currencyId: number;
  rate: number;
  rateScale: number;
  date: string;
};

export type TagOption = { id: number; name: string };

export type TransactionDetail = Transaction & {
  entries: (TransactionEntry & {
    currencyCode: string;
    currencyDecimalPlaces: number;
    isBaseCurrency: number;
  })[];
  tagIds: number[];
};

export type BaseCurrency = { code: string; symbol: string; decimalPlaces: number };

// ── Read queries ─────────────────────────────────────────────────────────────

export function getTransactionsPaginated(
  db: BetterSQLite3Database<typeof schema>,
  filters: TransactionFilters,
  page: number,
  pageSize: number,
): TransactionPage {
  // Resolve tag filter to IDs upfront (avoids a complex subquery)
  let tagTxIds: number[] | undefined;
  if (filters.tagId) {
    tagTxIds = db
      .select({ transactionId: transactionTagMap.transactionId })
      .from(transactionTagMap)
      .where(eq(transactionTagMap.tagId, filters.tagId))
      .all()
      .map(r => r.transactionId);
    if (tagTxIds.length === 0) {
      return { rows: [], total: 0, page, pageSize, pageCount: 0 };
    }
  }

  const where = and(
    filters.q        ? like(transactions.description, `%${filters.q}%`) : undefined,
    filters.dateFrom ? gte(transactions.date, filters.dateFrom)         : undefined,
    filters.dateTo   ? lte(transactions.date, filters.dateTo)           : undefined,
    tagTxIds         ? inArray(transactions.id, tagTxIds)               : undefined,
  );

  const [countRow] = db
    .select({ total: sql<number>`COUNT(*)` })
    .from(transactions)
    .where(where)
    .all();
  const total     = countRow?.total ?? 0;
  const pageCount = Math.ceil(total / pageSize);
  const safePage  = total === 0 ? 1 : Math.min(Math.max(1, page), pageCount);
  const offset    = (safePage - 1) * pageSize;

  const rows = db
    .select({
      id:          transactions.id,
      date:        transactions.date,
      description: transactions.description,
      entryCount:  sql<number>`COUNT(${transactionEntries.id})`,
      debitBase:   sql<number>`COALESCE(SUM(CASE WHEN ${transactionEntries.side}='debit' THEN ${transactionEntries.amountBase} ELSE 0 END),0)`,
    })
    .from(transactions)
    .leftJoin(transactionEntries, eq(transactions.id, transactionEntries.transactionId))
    .where(where)
    .groupBy(transactions.id)
    .orderBy(desc(transactions.date), desc(transactions.id))
    .limit(pageSize)
    .offset(offset)
    .all();

  if (rows.length === 0) {
    return { rows: [], total, page: safePage, pageSize, pageCount };
  }

  const pageIds = rows.map(r => r.id);
  const tagRows = db
    .select({ transactionId: transactionTagMap.transactionId, tagName: tags.name })
    .from(transactionTagMap)
    .innerJoin(tags, eq(transactionTagMap.tagId, tags.id))
    .where(inArray(transactionTagMap.transactionId, pageIds))
    .all();

  const tagsPerTx = new Map<number, string[]>();
  for (const { transactionId, tagName } of tagRows) {
    const arr = tagsPerTx.get(transactionId) ?? [];
    arr.push(tagName);
    tagsPerTx.set(transactionId, arr);
  }

  return {
    rows: rows.map(r => ({ ...r, tags: tagsPerTx.get(r.id) ?? [] })),
    total,
    page: safePage,
    pageSize,
    pageCount,
  };
}

export function getTransactionById(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
): TransactionDetail | null {
  const tx = db
    .select()
    .from(transactions)
    .where(eq(transactions.id, id))
    .get();
  if (!tx) return null;

  const entryRows = db
    .select({
      id:                    transactionEntries.id,
      transactionId:         transactionEntries.transactionId,
      accountId:             transactionEntries.accountId,
      side:                  transactionEntries.side,
      amount:                transactionEntries.amount,
      amountBase:            transactionEntries.amountBase,
      quantity:              transactionEntries.quantity,
      interestRate:          transactionEntries.interestRate,
      maturityDate:          transactionEntries.maturityDate,
      memo:                  transactionEntries.memo,
      currencyCode:          currencies.code,
      currencyDecimalPlaces: currencies.decimalPlaces,
      isBaseCurrency:        currencies.isBase,
    })
    .from(transactionEntries)
    .innerJoin(accounts,   eq(transactionEntries.accountId, accounts.id))
    .innerJoin(currencies, eq(accounts.currencyId, currencies.id))
    .where(eq(transactionEntries.transactionId, id))
    .all();

  const tagRows = db
    .select({ tagId: transactionTagMap.tagId })
    .from(transactionTagMap)
    .where(eq(transactionTagMap.transactionId, id))
    .all();

  return { ...tx, entries: entryRows, tagIds: tagRows.map(r => r.tagId) };
}


export function getActiveAccountOptions(
  db: BetterSQLite3Database<typeof schema>,
): AccountOption[] {
  return db
    .select({
      id:                    accounts.id,
      category:              accounts.category,
      name:                  accounts.name,
      currencyId:            accounts.currencyId,
      currencyCode:          currencies.code,
      currencyDecimalPlaces: currencies.decimalPlaces,
      isBaseCurrency:        currencies.isBase,
      accountType:           accounts.accountType,
    })
    .from(accounts)
    .innerJoin(currencies, eq(accounts.currencyId, currencies.id))
    .where(eq(accounts.isActive, 1))
    .orderBy(asc(accounts.category))
    .all();
}

export function getAllAccountOptions(
  db: BetterSQLite3Database<typeof schema>,
): AccountOption[] {
  return db
    .select({
      id:                    accounts.id,
      category:              accounts.category,
      name:                  accounts.name,
      currencyId:            accounts.currencyId,
      currencyCode:          currencies.code,
      currencyDecimalPlaces: currencies.decimalPlaces,
      isBaseCurrency:        currencies.isBase,
      accountType:           accounts.accountType,
    })
    .from(accounts)
    .innerJoin(currencies, eq(accounts.currencyId, currencies.id))
    .orderBy(asc(accounts.category))
    .all();
}

export function getAllExchangeRates(
  db: BetterSQLite3Database<typeof schema>,
): ExchangeRateRow[] {
  return db
    .select({
      currencyId: exchangeRates.currencyId,
      rate:       exchangeRates.rate,
      rateScale:  exchangeRates.rateScale,
      date:       exchangeRates.date,
    })
    .from(exchangeRates)
    .orderBy(asc(exchangeRates.currencyId), asc(exchangeRates.date))
    .all();
}

export function getBaseCurrency(
  db: BetterSQLite3Database<typeof schema>,
): BaseCurrency | null {
  return db
    .select({ code: currencies.code, symbol: currencies.symbol, decimalPlaces: currencies.decimalPlaces })
    .from(currencies)
    .where(eq(currencies.isBase, 1))
    .get() ?? null;
}

export function getAllTagOptions(
  db: BetterSQLite3Database<typeof schema>,
): TagOption[] {
  return db
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .orderBy(asc(tags.name))
    .all();
}

export function hasExchangeRate(
  db: BetterSQLite3Database<typeof schema>,
  currencyId: number,
  date: string,
): boolean {
  const row = db
    .select({ id: exchangeRates.id })
    .from(exchangeRates)
    .where(and(eq(exchangeRates.currencyId, currencyId), eq(exchangeRates.date, date)))
    .get();
  return row !== undefined;
}

export function insertExchangeRate(
  db: BetterSQLite3Database<typeof schema>,
  currencyId: number,
  date: string,
  rate: number,
  rateScale: number,
): void {
  db.insert(exchangeRates)
    .values({ currencyId, date, rate, rateScale })
    .onConflictDoNothing()
    .run();
}

// ── Write queries ─────────────────────────────────────────────────────────────

export function createTransaction(
  db: BetterSQLite3Database<typeof schema>,
  txData: Omit<InsertTransaction, 'id'>,
  entryRows: Omit<InsertTransactionEntry, 'id' | 'transactionId'>[],
  tagIds: number[],
): Transaction {
  return db.transaction(drizzleTx => {
    const [created] = drizzleTx.insert(transactions).values(txData).returning().all();
    if (!created) throw new Error('Failed to insert transaction');

    for (const entry of entryRows) {
      drizzleTx.insert(transactionEntries)
        .values({ ...entry, transactionId: created.id })
        .run();
    }
    for (const tagId of tagIds) {
      drizzleTx.insert(transactionTagMap)
        .values({ transactionId: created.id, tagId })
        .run();
    }

    return created;
  });
}

export function updateTransaction(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
  txData: Partial<InsertTransaction>,
  entryRows: Omit<InsertTransactionEntry, 'id' | 'transactionId'>[],
  tagIds: number[],
): Transaction | null {
  return db.transaction(drizzleTx => {
    const [updated] = drizzleTx
      .update(transactions).set(txData).where(eq(transactions.id, id))
      .returning().all();
    if (!updated) return null;

    drizzleTx.delete(transactionEntries).where(eq(transactionEntries.transactionId, id)).run();
    for (const entry of entryRows) {
      drizzleTx.insert(transactionEntries)
        .values({ ...entry, transactionId: id })
        .run();
    }

    drizzleTx.delete(transactionTagMap).where(eq(transactionTagMap.transactionId, id)).run();
    for (const tagId of tagIds) {
      drizzleTx.insert(transactionTagMap)
        .values({ transactionId: id, tagId })
        .run();
    }

    return updated;
  });
}

export function deleteTransaction(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
): void {
  db.delete(transactions).where(eq(transactions.id, id)).run();
}
