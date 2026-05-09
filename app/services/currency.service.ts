import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '~/db/schema';
import type { Currency } from '~/db/schema';
import type { CurrencyFormData } from '~/schemas/currency.schema';
import * as repo from '~/repositories/currency.repository';
import { hasAnyTransactions } from '~/repositories/transaction.repository';
import { logger } from '~/lib/logger';

type CurrencyResult = { ok: true } | { ok: false; error: string };

export function getAllCurrencies(
  db: BetterSQLite3Database<typeof schema>,
): Currency[] {
  return repo.getAllCurrencies(db);
}

export function getCurrencyById(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
): Currency | undefined {
  return repo.getCurrencyById(db, id);
}

export function getBaseCurrency(
  db: BetterSQLite3Database<typeof schema>,
): Currency | null {
  return repo.getBaseCurrency(db);
}

export function createCurrency(
  db: BetterSQLite3Database<typeof schema>,
  data: CurrencyFormData,
): CurrencyResult {
  try {
    repo.createCurrency(db, {
      code:         data.code,
      name:         data.name,
      symbol:       data.symbol,
      decimalPlaces: data.decimalPlaces,
      isBase:       0,
    });
    logger.info({ event: 'currency.created', code: data.code });
    return { ok: true };
  } catch (e) {
    if (e instanceof Error && e.message.includes('UNIQUE constraint failed: currencies.code')) {
      return { ok: false, error: 'currencies.duplicateCode' };
    }
    throw e;
  }
}

export function updateCurrency(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
  data: CurrencyFormData,
): CurrencyResult {
  const existing = repo.getCurrencyById(db, id);
  if (!existing) return { ok: false, error: 'currencies.notFound' };
  try {
    repo.updateCurrency(db, id, {
      code:         data.code,
      name:         data.name,
      symbol:       data.symbol,
      decimalPlaces: data.decimalPlaces,
    });
    logger.info({ event: 'currency.updated', id, code: data.code });
    return { ok: true };
  } catch (e) {
    if (e instanceof Error && e.message.includes('UNIQUE constraint failed: currencies.code')) {
      return { ok: false, error: 'currencies.duplicateCode' };
    }
    throw e;
  }
}

export function deleteCurrency(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
): CurrencyResult {
  const existing = repo.getCurrencyById(db, id);
  if (!existing) return { ok: false, error: 'currencies.notFound' };
  if (existing.isBase) return { ok: false, error: 'currencies.cannotDeleteBase' };
  if (
    repo.isUsedByAccounts(db, id) ||
    repo.isUsedBySecurities(db, id) ||
    repo.isUsedByExchangeRates(db, id)
  ) {
    return { ok: false, error: 'currencies.cannotDeleteUsed' };
  }
  repo.deleteCurrency(db, id);
  logger.info({ event: 'currency.deleted', id, code: existing.code });
  return { ok: true };
}

export function setBaseCurrency(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
): CurrencyResult {
  const existing = repo.getCurrencyById(db, id);
  if (!existing) return { ok: false, error: 'currencies.notFound' };
  if (hasAnyTransactions(db)) return { ok: false, error: 'currencies.cannotChangeBase' };
  repo.clearAllBaseCurrencies(db);
  repo.setBaseCurrencyFlag(db, id);
  logger.info({ event: 'currency.base.set', id, code: existing.code });
  return { ok: true };
}
