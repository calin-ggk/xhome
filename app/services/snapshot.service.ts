import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '~/db/schema';
import * as repo from '~/repositories/snapshot.repository';
import type { RequiredRate } from '~/repositories/snapshot.repository';
import { fetchExchangeRate } from '~/lib/yahoo-finance';
import { logger } from '~/lib/logger';

// ── Public types ──────────────────────────────────────────────────────────────

export type MissingRate = RequiredRate;

export type ManualRate = {
  currencyId:   number;
  snapshotDate: string;
  rateDecimal:  number;
};

export type SnapshotStatus = {
  missingMonths: string[]; // snapshot dates YYYY-MM-01
  snapshotCount: number;
};

export type GenerateOutcome =
  | { ok: true;  monthsGenerated: number; snapshotsCreated: number }
  | { ok: false; missingRates: MissingRate[] }
  | { ok: false; error: string };

// ── Service functions ─────────────────────────────────────────────────────────

export function getSnapshotStatus(
  db: BetterSQLite3Database<typeof schema>,
  today?: string,
): SnapshotStatus {
  return {
    missingMonths: repo.getMissingSnapshotMonths(db, today),
    snapshotCount: repo.getSnapshotCount(db),
  };
}

export async function generateMissingSnapshots(
  db: BetterSQLite3Database<typeof schema>,
  manualRates: ManualRate[] = [],
  today?: string,
): Promise<GenerateOutcome> {
  const missingMonths = repo.getMissingSnapshotMonths(db, today);

  if (missingMonths.length === 0) {
    return { ok: true, monthsGenerated: 0, snapshotsCreated: 0 };
  }

  // Persist any manually provided rates first
  for (const m of manualRates) {
    const stored = Math.round(m.rateDecimal * Math.pow(10, 4));
    repo.upsertExchangeRate(db, m.currencyId, m.snapshotDate, stored, 4);
  }

  // Collect all rates still needed across every missing month
  const needed = new Map<string, RequiredRate>();
  for (const snapshotDate of missingMonths) {
    for (const r of repo.getRequiredRates(db, snapshotDate)) {
      needed.set(`${r.currencyId}:${r.snapshotDate}`, r);
    }
  }

  // Try Yahoo Finance for each missing rate
  const baseCurrencyCode = repo.getBaseCurrencyCode(db);
  const stillMissing: MissingRate[] = [];

  for (const [, required] of needed) {
    const fetched = await fetchExchangeRate(
      required.currencyCode,
      baseCurrencyCode,
      required.snapshotDate,
    );
    if (fetched) {
      repo.upsertExchangeRate(
        db, required.currencyId, required.snapshotDate, fetched.rate, fetched.rateScale,
      );
    } else {
      stillMissing.push(required);
    }
  }

  if (stillMissing.length > 0) {
    return { ok: false, missingRates: stillMissing };
  }

  // All rates resolved — compute and save snapshots
  try {
    let snapshotsCreated = 0;
    for (const snapshotDate of missingMonths) {
      const balances = repo.computeAccountBalancesAtDate(db, snapshotDate);
      const rows = balances.map(b => {
        let balanceBase: number;
        if (b.isBaseCurrency) {
          balanceBase = b.balance;
        } else {
          const rateRow = repo.getExchangeRate(db, b.currencyId, snapshotDate);
          if (!rateRow) throw new Error(`No rate for currency ${b.currencyId} at ${snapshotDate}`);
          balanceBase = Math.round(b.balance * rateRow.rate / Math.pow(10, rateRow.rateScale));
        }
        return { accountId: b.accountId, date: snapshotDate, balance: b.balance, balanceBase };
      });
      repo.upsertSnapshots(db, rows);
      snapshotsCreated += rows.length;
    }

    logger.info({ event: 'snapshot.generated', months: missingMonths.length, accounts: snapshotsCreated });
    return { ok: true, monthsGenerated: missingMonths.length, snapshotsCreated };
  } catch (err) {
    logger.error({ event: 'snapshot.generate_failed', error: String(err) });
    return { ok: false, error: 'snapshots.generateFailed' };
  }
}
