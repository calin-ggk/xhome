import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '~/db/schema';
import {
  getBalanceSheetFromSnapshots,
  getBalanceSheetLive,
  getIncomeStatementData,
  getNetWorthHistory,
  getSecuritiesHistory,
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

export type SpendingNode = {
  label: string;
  category: string;
  accountId: number | null;
  amount: number;
  children: SpendingNode[];
};

export type SpendingTreeData = {
  startDate: string | null;
  endDate: string | null;
  roots: SpendingNode[];
  total: number;
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

function buildSpendingTree(rows: IncomeRow[]): SpendingNode[] {
  return buildCategoryTree(rows, 'expense/');
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
  return getNetWorthHistory(db).map(r => ({
    ...snapshotDateToDisplayMonth(r.date),
    netWorthBase: r.netWorthBase,
  }));
}

export function getSpendingTreeData(
  db: BetterSQLite3Database<typeof schema>,
  startDate: string | null,
  endDate: string | null,
): SpendingTreeData {
  const rows = getIncomeStatementData(db, startDate, endDate);
  const roots = buildSpendingTree(rows);
  return { startDate, endDate, roots, total: roots.reduce((s, n) => s + n.amount, 0) };
}

export function getSecuritiesHistoryData(
  db: BetterSQLite3Database<typeof schema>,
): SecuritiesHistoryData {
  const rows = getSecuritiesHistory(db);
  if (rows.length === 0) return { securities: [], points: [] };

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
    const { display } = snapshotDateToDisplayMonth(date);
    const point: Record<string, string | number> = { date, display };
    for (const [accountId] of secMap) {
      const row = rows.find(r => r.date === date && r.accountId === accountId);
      point[String(accountId)] = row?.balanceBase ?? 0;
    }
    return point;
  });

  return { securities: [...secMap.values()], points };
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
