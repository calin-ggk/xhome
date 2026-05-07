import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '~/db/schema';
import type { Security, Currency } from '~/db/schema';
import type { SecurityFormData } from '~/schemas/security.schema';
import * as repo from '~/repositories/security.repository';
import { getAllCurrencies } from '~/repositories/currency.repository';
import { logger } from '~/lib/logger';

export type { SecurityRow } from '~/repositories/security.repository';

type SecurityResult = { ok: true } | { ok: false; error: string };

export function getAllSecurities(
  db: BetterSQLite3Database<typeof schema>,
) {
  return repo.getAllSecurities(db);
}

export function getSecurityFormData(
  db: BetterSQLite3Database<typeof schema>,
): { currencies: Currency[] } {
  return { currencies: getAllCurrencies(db) };
}

export function getSecurityEditFormData(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
): { security: Security; currencies: Currency[] } | null {
  const security = repo.getSecurityById(db, id);
  if (!security) return null;
  return { security, currencies: getAllCurrencies(db) };
}

export function createSecurity(
  db: BetterSQLite3Database<typeof schema>,
  data: SecurityFormData,
): SecurityResult {
  try {
    repo.createSecurity(db, {
      ticker:        data.ticker,
      name:          data.name,
      currencyId:    data.currencyId,
      type:          data.type,
      quantityScale: data.quantityScale,
    });
    logger.info({ event: 'security.created', ticker: data.ticker });
    return { ok: true };
  } catch (e) {
    if (e instanceof Error && e.message.includes('UNIQUE constraint failed: securities.ticker')) {
      return { ok: false, error: 'securities.duplicateTicker' };
    }
    throw e;
  }
}

export function updateSecurity(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
  data: SecurityFormData,
): SecurityResult {
  const existing = repo.getSecurityById(db, id);
  if (!existing) return { ok: false, error: 'securities.notFound' };
  try {
    repo.updateSecurity(db, id, {
      ticker:        data.ticker,
      name:          data.name,
      currencyId:    data.currencyId,
      type:          data.type,
      quantityScale: data.quantityScale,
    });
    logger.info({ event: 'security.updated', id, ticker: data.ticker });
    return { ok: true };
  } catch (e) {
    if (e instanceof Error && e.message.includes('UNIQUE constraint failed: securities.ticker')) {
      return { ok: false, error: 'securities.duplicateTicker' };
    }
    throw e;
  }
}

export function deleteSecurity(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
): SecurityResult {
  const existing = repo.getSecurityById(db, id);
  if (!existing) return { ok: false, error: 'securities.notFound' };
  if (repo.isUsedByAccounts(db, id)) {
    return { ok: false, error: 'securities.cannotDeleteUsed' };
  }
  repo.deleteSecurity(db, id);
  logger.info({ event: 'security.deleted', id, ticker: existing.ticker });
  return { ok: true };
}
