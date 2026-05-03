import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '~/db/schema';
import type { Account } from '~/db/schema';
import type { AccountFormData } from '~/schemas/account.schema';
import type { AccountListRow, AccountDetailRow } from '~/repositories/account.repository';
import * as repo from '~/repositories/account.repository';

export type { AccountListRow, AccountDetailRow };

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type AccountGroup = { prefix: string; accounts: AccountListRow[] };

const CANONICAL_ORDER = ['asset', 'liability', 'equity', 'income', 'expense'];

export function getAccountsPageData(
  db: BetterSQLite3Database<typeof schema>,
): { groups: AccountGroup[] } {
  const rows = repo.getAllAccounts(db);
  const map = new Map<string, AccountListRow[]>();
  for (const row of rows) {
    const prefix = row.category.split('/')[0] ?? row.category;
    const existing = map.get(prefix);
    if (existing) {
      existing.push(row);
    } else {
      map.set(prefix, [row]);
    }
  }
  const knownKeys   = CANONICAL_ORDER.filter(k => map.has(k));
  const unknownKeys = [...map.keys()].filter(k => !CANONICAL_ORDER.includes(k)).sort();
  const groups: AccountGroup[] = [...knownKeys, ...unknownKeys].map(prefix => ({
    prefix,
    accounts: map.get(prefix)!,
  }));
  return { groups };
}

export function getNewAccountFormData(
  db: BetterSQLite3Database<typeof schema>,
) {
  return {
    currencies: repo.getAllCurrencies(db),
    securities: repo.getAllSecurities(db),
  };
}

export function getEditAccountFormData(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
): { account: AccountDetailRow; currencies: ReturnType<typeof repo.getAllCurrencies>; securities: ReturnType<typeof repo.getAllSecurities> } | null {
  const account = repo.getAccountById(db, id);
  if (!account) return null;
  return {
    account,
    currencies: repo.getAllCurrencies(db),
    securities: repo.getAllSecurities(db),
  };
}

export function createAccount(
  db: BetterSQLite3Database<typeof schema>,
  data: AccountFormData,
): ServiceResult<Account> {
  try {
    const account = repo.createAccount(db, {
      name:        data.name,
      type:        data.type,
      accountType: data.accountType,
      currencyId:  data.currencyId,
      category:    data.category,
      isActive:    data.isActive ?? 1,
      securityId:  data.securityId ?? null,
    });
    return { ok: true, data: account };
  } catch (e) {
    if (e instanceof Error && e.message.includes('UNIQUE constraint failed: accounts.category')) {
      return { ok: false, error: 'accounts.duplicateCategory' };
    }
    throw e;
  }
}

export function updateAccount(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
  data: AccountFormData,
): ServiceResult<Account> {
  const existing = repo.getAccountById(db, id);
  if (!existing) return { ok: false, error: 'accounts.notFound' };
  try {
    const account = repo.updateAccount(db, id, {
      name:        data.name,
      type:        data.type,
      accountType: data.accountType,
      currencyId:  data.currencyId,
      category:    data.category,
      isActive:    data.isActive ?? 1,
      securityId:  data.securityId ?? null,
    });
    return { ok: true, data: account! };
  } catch (e) {
    if (e instanceof Error && e.message.includes('UNIQUE constraint failed: accounts.category')) {
      return { ok: false, error: 'accounts.duplicateCategory' };
    }
    throw e;
  }
}

export function deleteAccount(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
): ServiceResult<void> {
  if (repo.hasTransactionEntries(db, id)) {
    return { ok: false, error: 'accounts.cannotDelete' };
  }
  repo.deleteAccount(db, id);
  return { ok: true, data: undefined };
}
