import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '~/db/schema';
import {
  getBalanceSheetFromSnapshots,
  getBalanceSheetLive,
  getIncomeStatementData,
  hasSnapshotForDate,
  type BalanceSheetRow,
  type IncomeRow,
} from '~/repositories/reports.repository';

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
  startDate: string;
  endDate: string;
  income: ReportSection;
  expenses: ReportSection;
  netIncome: number;
};

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

export function getIncomeStatement(
  db: BetterSQLite3Database<typeof schema>,
  startDate: string,
  endDate: string,
): IncomeStatementData {
  const rows = getIncomeStatementData(db, startDate, endDate);

  const income   = isSection(rows.filter(r => r.category.startsWith('income/')));
  const expenses = isSection(rows.filter(r => r.category.startsWith('expense/')));

  return { startDate, endDate, income, expenses, netIncome: income.total - expenses.total };
}
