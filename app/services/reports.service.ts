import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '~/db/schema';
import { logger } from '~/lib/logger';
import {
  getBalanceSheetFromSnapshots,
  getBalanceSheetLive,
  getBaseCurrencyCode,
  getIncomeStatementData,
  getLiveRegularBalances,
  getLiveSecurityQuantities,
  getNetWorthHistoryByCurrency,
  getSecuritiesHistory,
  hasSnapshotForDate,
  type BalanceSheetRow,
  type IncomeRow,
} from '~/repositories/reports.repository';
import { fetchCurrentPrices } from '~/lib/yahoo-finance';

export type ReportAccount = {
  id: number;
  name: string;
  category: string;
  balanceBase: number;
};

export type ReportSection = {
  accounts: ReportAccount[];
  total: number;
};

export type BalanceSheetData = {
  asOfDate: string;
  isSnapshot: boolean;
  assets: ReportSection;
  liabilities: ReportSection;
  equity: ReportSection;
  netWorth: number;
};

export type IncomeStatementData = {
  startDate: string | null;
  endDate: string | null;
  income: ReportSection;
  expenses: ReportSection;
  netIncome: number;
  incomeTree: SpendingNode[];
  expensesTree: SpendingNode[];
};

export type NetWorthHistoryPoint = {
  month: string;    // 'YYYY-MM' of the closing period
  display: string;  // e.g. 'Apr 2024'
  netWorthBase: number;
};

// Pivoted chart point: { month, display, total, [currencyCode]: number }
export type NetWorthChartPoint = Record<string, string | number> & {
  month: string;
  display: string;
  total: number;
};

export type MissingLiveRate  = { currencyId: number; currencyCode: string };
export type MissingLivePrice = { securityId: number; ticker: string };
export type ManualLiveRate   = { currencyId: number; rateDecimal: number };
export type ManualLivePrice  = { securityId: number; priceDecimal: number };

export type LiveDataStatus =
  | { state: 'ok' }
  | { state: 'missing'; missingRates: MissingLiveRate[]; missingPrices: MissingLivePrice[] };

export type NetWorthByCurrencyData = {
  currencies: string[];
  points: NetWorthChartPoint[];
  liveStatus: LiveDataStatus;
};

export type SpendingNode = {
  label: string;
  category: string;
  accountId: number | null;
  amount: number;
  children: SpendingNode[];
};

export type SecurityLine = {
  accountId: number;
  accountName: string;
  ticker: string;
  securityName: string;
  label: string;
};

export type SecuritiesHistoryData = {
  securities: SecurityLine[];
  // Pivoted: { date, display, [accountId]: balanceBase (cents) }[]
  points: Array<Record<string, string | number>>;
  // Pivoted: { date, display, [accountId]: pct_return (%) }[]
  pctPoints: Array<Record<string, string | number>>;
  liveStatus: LiveDataStatus;
};

// Convert a snapshot date (YYYY-MM-01, first of next month) to its closing period month
function snapshotDateToDisplayMonth(snapshotDate: string): { month: string; display: string } {
  const [yearStr, monthStr] = snapshotDate.split('-');
  const year = parseInt(yearStr!, 10);
  const month = parseInt(monthStr!, 10); // 1-indexed; month-2 as 0-indexed = previous month
  const prevDate = new Date(Date.UTC(year, month - 2, 1));
  const prevYear = prevDate.getUTCFullYear();
  const prevMonth = prevDate.getUTCMonth() + 1;
  const display = prevDate.toLocaleString('en', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  return { month: `${prevYear}-${String(prevMonth).padStart(2, '0')}`, display };
}

function buildCategoryTree(rows: IncomeRow[], prefix: string): SpendingNode[] {
  const filtered = rows.filter(r => r.category.startsWith(prefix) && r.totalBase > 0);
  const nodes = new Map<string, SpendingNode>();

  for (const row of filtered) {
    const parts = row.category.split('/');
    for (let i = 1; i < parts.length; i++) {
      const path = parts.slice(0, i + 1).join('/');
      if (!nodes.has(path)) {
        nodes.set(path, { label: parts[i]!, category: path, accountId: null, amount: 0, children: [] });
      }
    }
    const leaf = nodes.get(row.category);
    if (leaf) { leaf.accountId = row.accountId; leaf.amount = row.totalBase; }
  }

  const sorted = [...nodes.keys()].sort((a, b) => b.split('/').length - a.split('/').length);
  for (const path of sorted) {
    const node = nodes.get(path)!;
    const parentPath = path.split('/').slice(0, -1).join('/');
    const parent = nodes.get(parentPath);
    if (parent) { parent.children.push(node); parent.amount += node.amount; }
  }

  for (const node of nodes.values()) node.children.sort((a, b) => b.amount - a.amount);

  return [...nodes.values()]
    .filter(n => n.category.split('/').length === 2)
    .sort((a, b) => b.amount - a.amount);
}

// First day of the month AFTER ym (used as snapshot key)
function nextMonthFirst(ym: string): string {
  const [yStr, mStr] = ym.split('-');
  // m (1-indexed) used as 0-indexed in Date.UTC → gives next month
  return new Date(Date.UTC(parseInt(yStr!, 10), parseInt(mStr!, 10), 1))
    .toISOString()
    .slice(0, 10);
}

// Last day of the given YYYY-MM month
function lastDayOfMonth(ym: string): string {
  const [yStr, mStr] = ym.split('-');
  // Day 0 of the next month (0-indexed m = 1-indexed m+1) = last day of current month
  return new Date(Date.UTC(parseInt(yStr!, 10), parseInt(mStr!, 10), 0))
    .toISOString()
    .slice(0, 10);
}

function bsSection(rows: BalanceSheetRow[], flip: boolean): ReportSection {
  const accs = rows
    .map(r => ({
      id: r.accountId,
      name: r.name,
      category: r.category,
      balanceBase: flip ? -r.balanceBase : r.balanceBase,
    }))
    .filter(a => a.balanceBase !== 0);
  return { accounts: accs, total: accs.reduce((s, a) => s + a.balanceBase, 0) };
}

function isSection(rows: IncomeRow[]): ReportSection {
  const accs = rows
    .map(r => ({ id: r.accountId, name: r.name, category: r.category, balanceBase: r.totalBase }))
    .filter(a => a.balanceBase !== 0);
  return { accounts: accs, total: accs.reduce((s, a) => s + a.balanceBase, 0) };
}

// ── Live current-month helpers ────────────────────────────────────────────────

type LiveNWResult =
  | { ok: true;  byCurrency: { currencyCode: string; netWorthBase: number }[] }
  | { ok: false; missingRates: MissingLiveRate[]; missingPrices: MissingLivePrice[] };

async function computeLiveNetWorthByCurrency(
  db: BetterSQLite3Database<typeof schema>,
  today: string,
  manualRates: ManualLiveRate[],
  manualPrices: ManualLivePrice[],
): Promise<LiveNWResult> {
  const baseCurrency    = getBaseCurrencyCode(db);
  const regularBalances = getLiveRegularBalances(db, today);
  const secQuantities   = getLiveSecurityQuantities(db, today);

  if (regularBalances.length === 0 && secQuantities.length === 0) {
    return { ok: true, byCurrency: [] };
  }

  const manualRateMap  = new Map(manualRates.map(r => [r.currencyId, r.rateDecimal]));
  const manualPriceMap = new Map(manualPrices.map(p => [p.securityId, p.priceDecimal]));

  // Non-base currencies still needing FX from Yahoo Finance
  const needFxFor = new Map<string, MissingLiveRate>();
  for (const b of regularBalances) {
    if (!b.isBaseCurrency && !manualRateMap.has(b.currencyId)) {
      needFxFor.set(b.currencyCode, { currencyId: b.currencyId, currencyCode: b.currencyCode });
    }
  }
  for (const s of secQuantities) {
    if (s.netQuantity !== 0 && !s.isBaseCurrency && !manualRateMap.has(s.currencyId)) {
      needFxFor.set(s.currencyCode, { currencyId: s.currencyId, currencyCode: s.currencyCode });
    }
  }

  // Securities with non-zero quantity still needing prices
  const needPriceFor = secQuantities
    .filter(s => s.netQuantity !== 0 && !manualPriceMap.has(s.securityId))
    .map(s => ({ securityId: s.securityId, ticker: s.ticker }));

  const fxSymbols     = [...needFxFor.keys()].map(code => `${code}${baseCurrency}=X`);
  const tickerSymbols = needPriceFor.map(s => s.ticker);
  const allSymbols    = [...new Set([...fxSymbols, ...tickerSymbols])];

  const fetched = allSymbols.length > 0
    ? await fetchCurrentPrices(allSymbols)
    : new Map<string, number>();

  // Resolve FX rates
  const fxRateMap    = new Map<string, number>();
  const missingRates: MissingLiveRate[] = [];
  for (const [code, info] of needFxFor) {
    const price = fetched.get(`${code}${baseCurrency}=X`);
    if (price !== undefined) fxRateMap.set(code, price);
    else missingRates.push(info);
  }
  for (const r of manualRates) {
    const found = [...regularBalances, ...secQuantities].find(a => a.currencyId === r.currencyId);
    if (found) fxRateMap.set(found.currencyCode, r.rateDecimal);
  }

  // Resolve security prices
  const priceMap      = new Map<number, number>();
  const missingPrices: MissingLivePrice[] = [];
  for (const sec of needPriceFor) {
    const price = fetched.get(sec.ticker);
    if (price !== undefined) priceMap.set(sec.securityId, price);
    else missingPrices.push(sec);
  }
  for (const [id, price] of manualPriceMap) priceMap.set(id, price);

  if (missingRates.length > 0 || missingPrices.length > 0) {
    logger.warn({ event: 'reports.live.missing_symbols', missingRates, missingPrices });
    return { ok: false, missingRates, missingPrices };
  }

  // Compute net worth by currency (debit-positive convention)
  const byCurrency = new Map<string, number>();

  for (const b of regularBalances) {
    const balanceBase = b.isBaseCurrency
      ? b.balance
      : Math.round(b.balance * fxRateMap.get(b.currencyCode)!);
    byCurrency.set(b.currencyCode, (byCurrency.get(b.currencyCode) ?? 0) + balanceBase);
  }

  for (const s of secQuantities) {
    if (s.netQuantity === 0) continue;
    const marketCents = Math.round(
      (s.netQuantity / Math.pow(10, s.quantityScale))
      * priceMap.get(s.securityId)!
      * Math.pow(10, s.decimalPlaces),
    );
    const balanceBase = s.isBaseCurrency
      ? marketCents
      : Math.round(marketCents * fxRateMap.get(s.currencyCode)!);
    byCurrency.set(s.currencyCode, (byCurrency.get(s.currencyCode) ?? 0) + balanceBase);
  }

  return {
    ok: true,
    byCurrency: [...byCurrency.entries()].map(([currencyCode, netWorthBase]) => ({ currencyCode, netWorthBase })),
  };
}

type LiveSecResult =
  | { ok: true;  rows: Array<{ accountId: number; accountName: string; ticker: string; securityName: string; balanceBase: number }> }
  | { ok: false; missingRates: MissingLiveRate[]; missingPrices: MissingLivePrice[] };

async function computeLiveSecurities(
  db: BetterSQLite3Database<typeof schema>,
  today: string,
  manualRates: ManualLiveRate[],
  manualPrices: ManualLivePrice[],
): Promise<LiveSecResult> {
  const baseCurrency  = getBaseCurrencyCode(db);
  const secQuantities = getLiveSecurityQuantities(db, today);

  if (secQuantities.length === 0) return { ok: true, rows: [] };

  const manualRateMap  = new Map(manualRates.map(r => [r.currencyId, r.rateDecimal]));
  const manualPriceMap = new Map(manualPrices.map(p => [p.securityId, p.priceDecimal]));

  const needFxFor = new Map<string, MissingLiveRate>();
  for (const s of secQuantities) {
    if (s.netQuantity !== 0 && !s.isBaseCurrency && !manualRateMap.has(s.currencyId)) {
      needFxFor.set(s.currencyCode, { currencyId: s.currencyId, currencyCode: s.currencyCode });
    }
  }

  const needPriceFor = secQuantities
    .filter(s => s.netQuantity !== 0 && !manualPriceMap.has(s.securityId))
    .map(s => ({ securityId: s.securityId, ticker: s.ticker }));

  const fxSymbols     = [...needFxFor.keys()].map(code => `${code}${baseCurrency}=X`);
  const tickerSymbols = needPriceFor.map(s => s.ticker);
  const allSymbols    = [...new Set([...fxSymbols, ...tickerSymbols])];

  const fetched = allSymbols.length > 0
    ? await fetchCurrentPrices(allSymbols)
    : new Map<string, number>();

  const fxRateMap    = new Map<string, number>();
  const missingRates: MissingLiveRate[] = [];
  for (const [code, info] of needFxFor) {
    const price = fetched.get(`${code}${baseCurrency}=X`);
    if (price !== undefined) fxRateMap.set(code, price);
    else missingRates.push(info);
  }
  for (const r of manualRates) {
    const found = secQuantities.find(a => a.currencyId === r.currencyId);
    if (found) fxRateMap.set(found.currencyCode, r.rateDecimal);
  }

  const priceMap      = new Map<number, number>();
  const missingPrices: MissingLivePrice[] = [];
  for (const sec of needPriceFor) {
    const price = fetched.get(sec.ticker);
    if (price !== undefined) priceMap.set(sec.securityId, price);
    else missingPrices.push(sec);
  }
  for (const [id, price] of manualPriceMap) priceMap.set(id, price);

  if (missingRates.length > 0 || missingPrices.length > 0) {
    logger.warn({ event: 'reports.live.missing_symbols', missingRates, missingPrices });
    return { ok: false, missingRates, missingPrices };
  }

  const rows = secQuantities.map(s => {
    if (s.netQuantity === 0) {
      return { accountId: s.accountId, accountName: s.accountName, ticker: s.ticker, securityName: s.securityName, balanceBase: 0 };
    }
    const marketCents = Math.round(
      (s.netQuantity / Math.pow(10, s.quantityScale))
      * priceMap.get(s.securityId)!
      * Math.pow(10, s.decimalPlaces),
    );
    const balanceBase = s.isBaseCurrency
      ? marketCents
      : Math.round(marketCents * fxRateMap.get(s.currencyCode)!);
    return { accountId: s.accountId, accountName: s.accountName, ticker: s.ticker, securityName: s.securityName, balanceBase };
  });

  return { ok: true, rows };
}

// ── Public service functions ──────────────────────────────────────────────────

export function getBalanceSheet(
  db: BetterSQLite3Database<typeof schema>,
  month: string,
  today: string,
): BalanceSheetData {
  const snapshotDate = nextMonthFirst(month);
  const useSnapshot = hasSnapshotForDate(db, snapshotDate);

  let rows: BalanceSheetRow[];
  let asOfDate: string;

  if (useSnapshot) {
    rows = getBalanceSheetFromSnapshots(db, snapshotDate);
    asOfDate = lastDayOfMonth(month);
  } else {
    const isCurrentMonth = month === today.slice(0, 7);
    asOfDate = isCurrentMonth ? today : lastDayOfMonth(month);
    rows = getBalanceSheetLive(db, asOfDate);
  }

  const assets      = bsSection(rows.filter(r => r.category.startsWith('asset/')),     false);
  const liabilities = bsSection(rows.filter(r => r.category.startsWith('liability/')), true);
  const equity      = bsSection(rows.filter(r => r.category.startsWith('equity/')),    true);

  return {
    asOfDate,
    isSnapshot: useSnapshot,
    assets,
    liabilities,
    equity,
    netWorth: assets.total - liabilities.total,
  };
}

export function getNetWorthHistoryData(
  db: BetterSQLite3Database<typeof schema>,
): NetWorthHistoryPoint[] {
  return getNetWorthHistoryByCurrency(db).map(r => {
    const { month, display } = snapshotDateToDisplayMonth(r.date);
    return { month, display, netWorthBase: r.netWorthBase };
  });
}

export async function getNetWorthByCurrencyData(
  db: BetterSQLite3Database<typeof schema>,
  fromMonth: string | null,
  toMonth: string | null,
  today    = new Date().toISOString().slice(0, 10),
  manualRates:  ManualLiveRate[]  = [],
  manualPrices: ManualLivePrice[] = [],
): Promise<NetWorthByCurrencyData> {
  const currentMonth  = today.slice(0, 7);
  const syntheticDate = nextMonthFirst(currentMonth);

  const baseRows = getNetWorthHistoryByCurrency(db).filter(r => {
    const { month } = snapshotDateToDisplayMonth(r.date);
    return (!fromMonth || month >= fromMonth) && (!toMonth || month <= toMonth);
  });

  const currentInRange = (!fromMonth || currentMonth >= fromMonth) && (!toMonth || currentMonth <= toMonth);
  const alreadyCovered = baseRows.some(r => r.date === syntheticDate);

  let liveAdditions: typeof baseRows = [];
  let liveStatus: LiveDataStatus = { state: 'ok' };

  if (currentInRange && !alreadyCovered) {
    const liveResult = await computeLiveNetWorthByCurrency(db, today, manualRates, manualPrices);
    if (liveResult.ok) {
      liveAdditions = liveResult.byCurrency.map(r => ({ date: syntheticDate, ...r }));
    } else {
      liveStatus = { state: 'missing', missingRates: liveResult.missingRates, missingPrices: liveResult.missingPrices };
    }
  }

  const rows = [...baseRows, ...liveAdditions];

  const currencySet    = new Set<string>();
  const displayByMonth = new Map<string, string>();
  const valuesByMonth  = new Map<string, Map<string, number>>();

  for (const r of rows) {
    const { month, display } = snapshotDateToDisplayMonth(r.date);
    currencySet.add(r.currencyCode);
    displayByMonth.set(month, display);
    if (!valuesByMonth.has(month)) valuesByMonth.set(month, new Map());
    valuesByMonth.get(month)!.set(r.currencyCode, r.netWorthBase);
  }

  const sortedCurrencies = [...currencySet].sort();
  const points: NetWorthChartPoint[] = [];

  for (const month of [...displayByMonth.keys()].sort()) {
    const display = displayByMonth.get(month)!;
    const byCode  = valuesByMonth.get(month)!;
    let total = 0;
    const point: NetWorthChartPoint = { month, display, total: 0 };
    for (const code of sortedCurrencies) {
      const v = byCode.get(code) ?? 0;
      point[code] = v;
      total += v;
    }
    point.total = total;
    points.push(point);
  }

  return { currencies: sortedCurrencies, points, liveStatus };
}

export async function getSecuritiesHistoryData(
  db: BetterSQLite3Database<typeof schema>,
  fromMonth: string | null = null,
  toMonth:   string | null = null,
  today    = new Date().toISOString().slice(0, 10),
  manualRates:  ManualLiveRate[]  = [],
  manualPrices: ManualLivePrice[] = [],
): Promise<SecuritiesHistoryData> {
  const noData: SecuritiesHistoryData = { securities: [], points: [], pctPoints: [], liveStatus: { state: 'ok' } };

  const currentMonth  = today.slice(0, 7);
  const syntheticDate = nextMonthFirst(currentMonth);

  const baseRows = getSecuritiesHistory(db).filter(r => {
    const { month } = snapshotDateToDisplayMonth(r.date);
    return (!fromMonth || month >= fromMonth) && (!toMonth || month <= toMonth);
  });

  const currentInRange = (!fromMonth || currentMonth >= fromMonth) && (!toMonth || currentMonth <= toMonth);
  const alreadyCovered = baseRows.some(r => r.date === syntheticDate);

  let liveRows: typeof baseRows = [];
  let liveStatus: LiveDataStatus = { state: 'ok' };

  if (currentInRange && !alreadyCovered) {
    const liveResult = await computeLiveSecurities(db, today, manualRates, manualPrices);
    if (liveResult.ok) {
      liveRows = liveResult.rows.map(r => ({ date: syntheticDate, ...r }));
    } else {
      liveStatus = { state: 'missing', missingRates: liveResult.missingRates, missingPrices: liveResult.missingPrices };
    }
  }

  const rows = [...baseRows, ...liveRows];
  if (rows.length === 0) return { ...noData, liveStatus };

  const secMap = new Map<number, SecurityLine>();
  for (const r of rows) {
    if (!secMap.has(r.accountId)) {
      secMap.set(r.accountId, {
        accountId: r.accountId,
        accountName: r.accountName,
        ticker: r.ticker,
        securityName: r.securityName,
        label: `${r.ticker} (${r.accountName})`,
      });
    }
  }

  const dates = [...new Set(rows.map(r => r.date))].sort();
  const points: Array<Record<string, string | number>> = dates.map(date => {
    const { month, display } = snapshotDateToDisplayMonth(date);
    const point: Record<string, string | number> = { date, month, display };
    for (const [accountId] of secMap) {
      const row = rows.find(r => r.date === date && r.accountId === accountId);
      point[String(accountId)] = row?.balanceBase ?? 0;
    }
    return point;
  });

  const firstNonZeroIdx = new Map<number, number>();
  for (const [accountId] of secMap) {
    const key = String(accountId);
    const idx = points.findIndex(p => (p[key] as number) > 0);
    if (idx !== -1) firstNonZeroIdx.set(accountId, idx);
  }

  const pctPoints: Array<Record<string, string | number>> = points.map((p, i) => {
    const out: Record<string, string | number> = { date: p['date']!, month: p['month']!, display: p['display']! };
    for (const [accountId] of secMap) {
      const key      = String(accountId);
      const firstIdx = firstNonZeroIdx.get(accountId);
      if (firstIdx === undefined || i < firstIdx) continue;
      const first = points[firstIdx]![key] as number;
      const cur   = p[key] as number;
      out[key] = +((cur - first) / Math.abs(first) * 100).toFixed(2);
    }
    return out;
  });

  return { securities: [...secMap.values()], points, pctPoints, liveStatus };
}

export function getIncomeStatement(
  db: BetterSQLite3Database<typeof schema>,
  startDate: string | null,
  endDate: string | null,
): IncomeStatementData {
  const rows = getIncomeStatementData(db, startDate, endDate);

  const income   = isSection(rows.filter(r => r.category.startsWith('income/')));
  const expenses = isSection(rows.filter(r => r.category.startsWith('expense/')));

  return {
    startDate,
    endDate,
    income,
    expenses,
    netIncome: income.total - expenses.total,
    incomeTree:   buildCategoryTree(rows, 'income/'),
    expensesTree: buildCategoryTree(rows, 'expense/'),
  };
}
