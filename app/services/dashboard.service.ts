import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '~/db/schema';
import {
  getNetWorthBase,
  getRecentTransactions,
  getCurrentMonthSummary,
  getMonthlyCashFlow,
} from '~/repositories/dashboard.repository';

export function getNetWorth(db: BetterSQLite3Database<typeof schema>): number {
  return getNetWorthBase(db);
}

function monthStartDate(monthsBack = 0): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - monthsBack);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export function getDashboardData(db: BetterSQLite3Database<typeof schema>) {
  const netWorth = getNetWorthBase(db);
  const { income, expenses } = getCurrentMonthSummary(db, monthStartDate(0));
  const recentTransactions = getRecentTransactions(db, 10);
  const cashFlow = getMonthlyCashFlow(db, monthStartDate(5));

  return {
    netWorth,
    currentMonth: { income, expenses, net: income - expenses },
    recentTransactions,
    cashFlow,
  };
}
