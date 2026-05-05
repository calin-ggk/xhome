import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '~/db/schema';
import * as repo from '~/repositories/snapshot.repository';
import type { RequiredRate, SecurityAccountInfo } from '~/repositories/snapshot.repository';
import { fetchExchangeRate, fetchSecurityPrice } from '~/lib/yahoo-finance';
import { logger } from '~/lib/logger';

// ── Public types ──────────────────────────────────────────────────────────────

export type MissingRate = RequiredRate;

export type ManualRate = {
  currencyId:   number;
  snapshotDate: string;
  rateDecimal:  number;
};

export type MissingSecurityPrice = {
  securityId:   number;
  accountId:    number;
  ticker:       string;
  snapshotDate: string;
};

export type ManualSecurityPrice = {
  securityId:   number;
  snapshotDate: string;
  priceDecimal: number;
};

export type SnapshotStatus = {
  missingMonths: string[]; // snapshot dates YYYY-MM-01
  snapshotCount: number;
};

export type GenerateOutcome =
  | { ok: true;  monthsGenerated: number; snapshotsCreated: number }
  | { ok: false; missingRates: MissingRate[]; missingPrices: MissingSecurityPrice[] }
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
  manualPrices: ManualSecurityPrice[] = [],
  today?: string,
): Promise<GenerateOutcome> {
  const missingMonths = repo.getMissingSnapshotMonths(db, today);

  if (missingMonths.length === 0) {
    return { ok: true, monthsGenerated: 0, snapshotsCreated: 0 };
  }

  // Persist any manually provided exchange rates first
  for (const m of manualRates) {
    const stored = Math.round(m.rateDecimal * Math.pow(10, 4));
    repo.upsertExchangeRate(db, m.currencyId, m.snapshotDate, stored, 4);
  }

  // Build a lookup for manually provided security prices (securityId:snapshotDate → priceDecimal)
  const manualPriceMap = new Map<string, number>();
  for (const p of manualPrices) {
    manualPriceMap.set(`${p.securityId}:${p.snapshotDate}`, p.priceDecimal);
  }

  // Collect security quantities per snapshot date (single DB call per month, reused later)
  const secQuantitiesMap = new Map<string, SecurityAccountInfo[]>();
  const neededPrices = new Map<string, MissingSecurityPrice>();

  for (const snapshotDate of missingMonths) {
    const quantities = repo.getSecurityAccountQuantities(db, snapshotDate);
    secQuantitiesMap.set(snapshotDate, quantities);
    for (const sq of quantities) {
      if (sq.netQuantity === 0) continue; // no position — balance is 0, no price needed
      const key = `${sq.securityId}:${snapshotDate}`;
      if (!manualPriceMap.has(key)) {
        neededPrices.set(key, { securityId: sq.securityId, accountId: sq.accountId, ticker: sq.ticker, snapshotDate });
      }
    }
  }

  // Collect all exchange rates still needed across every missing month
  const neededRates = new Map<string, RequiredRate>();
  for (const snapshotDate of missingMonths) {
    for (const r of repo.getRequiredRates(db, snapshotDate)) {
      neededRates.set(`${r.currencyId}:${r.snapshotDate}`, r);
    }
  }

  // Try Yahoo Finance for each missing exchange rate
  const baseCurrencyCode = repo.getBaseCurrencyCode(db);
  const stillMissingRates: MissingRate[] = [];

  for (const [, required] of neededRates) {
    const fetched = await fetchExchangeRate(required.currencyCode, baseCurrencyCode, required.snapshotDate);
    if (fetched) {
      repo.upsertExchangeRate(db, required.currencyId, required.snapshotDate, fetched.rate, fetched.rateScale);
    } else {
      stillMissingRates.push(required);
    }
  }

  // Try Yahoo Finance for each missing security price; keep resolved prices in memory
  const resolvedPrices = new Map<string, { rate: number; rateScale: number }>();
  for (const [key, dec] of manualPriceMap) {
    resolvedPrices.set(key, { rate: Math.round(dec * Math.pow(10, 4)), rateScale: 4 });
  }

  const stillMissingPrices: MissingSecurityPrice[] = [];

  for (const [key, info] of neededPrices) {
    const fetched = await fetchSecurityPrice(info.ticker, info.snapshotDate);
    if (fetched) {
      resolvedPrices.set(key, fetched);
    } else {
      stillMissingPrices.push(info);
    }
  }

  if (stillMissingRates.length > 0 || stillMissingPrices.length > 0) {
    return { ok: false, missingRates: stillMissingRates, missingPrices: stillMissingPrices };
  }

  // All rates and prices resolved — compute and save snapshots
  try {
    let snapshotsCreated = 0;

    for (const snapshotDate of missingMonths) {
      // Non-security accounts: running balance from transaction amounts
      const balances = repo.computeAccountBalancesAtDate(db, snapshotDate);
      const regularRows = balances.map(b => {
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

      // Security accounts: market value = net_quantity × close_price
      const secQuantities = secQuantitiesMap.get(snapshotDate) ?? [];
      const secRows = secQuantities.map(sq => {
        if (sq.netQuantity === 0) {
          return { accountId: sq.accountId, date: snapshotDate, balance: 0, balanceBase: 0 };
        }

        const priceRow = resolvedPrices.get(`${sq.securityId}:${snapshotDate}`);
        if (!priceRow) throw new Error(`No price for security ${sq.securityId} at ${snapshotDate}`);

        // Compute market value in the security's currency (smallest unit / cents)
        const balance = Math.round(
          (sq.netQuantity / Math.pow(10, sq.quantityScale)) *
          (priceRow.rate  / Math.pow(10, priceRow.rateScale)) *
          Math.pow(10, sq.decimalPlaces),
        );

        let balanceBase: number;
        if (sq.isBaseCurrency) {
          balanceBase = balance;
        } else {
          const rateRow = repo.getExchangeRate(db, sq.currencyId, snapshotDate);
          if (!rateRow) throw new Error(`No rate for currency ${sq.currencyId} at ${snapshotDate}`);
          balanceBase = Math.round(balance * rateRow.rate / Math.pow(10, rateRow.rateScale));
        }

        return { accountId: sq.accountId, date: snapshotDate, balance, balanceBase };
      });

      repo.upsertSnapshots(db, [...regularRows, ...secRows]);
      snapshotsCreated += regularRows.length + secRows.length;
    }

    logger.info({ event: 'snapshot.generated', months: missingMonths.length, accounts: snapshotsCreated });
    return { ok: true, monthsGenerated: missingMonths.length, snapshotsCreated };
  } catch (err) {
    logger.error({ event: 'snapshot.generate_failed', error: String(err) });
    return { ok: false, error: 'snapshots.generateFailed' };
  }
}
