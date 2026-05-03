import { describe, it, expect, vi } from 'vitest';
import * as repo from '~/repositories/dashboard.repository';
import { getNetWorth, getDashboardData } from './dashboard.service';

vi.mock('~/repositories/dashboard.repository');

describe('getNetWorth', () => {
  it('returns net worth cents from repository', () => {
    vi.mocked(repo.getNetWorthBase).mockReturnValue(150000);
    expect(getNetWorth({} as never)).toBe(150000);
  });

  it('returns 0 when repository returns 0', () => {
    vi.mocked(repo.getNetWorthBase).mockReturnValue(0);
    expect(getNetWorth({} as never)).toBe(0);
  });
});

describe('getDashboardData', () => {
  it('assembles all dashboard data from repositories', () => {
    vi.mocked(repo.getNetWorthBase).mockReturnValue(200000);
    vi.mocked(repo.getCurrentMonthSummary).mockReturnValue({ income: 50000, expenses: 20000 });
    vi.mocked(repo.getRecentTransactions).mockReturnValue([
      { id: 1, date: '2024-01-15', description: 'Salary', totalBase: 50000 },
    ]);
    vi.mocked(repo.getMonthlyCashFlow).mockReturnValue([
      { month: '2023-08', income: 40000, expenses: 15000 },
    ]);

    const result = getDashboardData({} as never);

    expect(result.netWorth).toBe(200000);
    expect(result.currentMonth).toEqual({ income: 50000, expenses: 20000, net: 30000 });
    expect(result.recentTransactions).toHaveLength(1);
    expect(result.cashFlow).toHaveLength(1);
  });

  it('computes net as income minus expenses', () => {
    vi.mocked(repo.getNetWorthBase).mockReturnValue(0);
    vi.mocked(repo.getCurrentMonthSummary).mockReturnValue({ income: 10000, expenses: 15000 });
    vi.mocked(repo.getRecentTransactions).mockReturnValue([]);
    vi.mocked(repo.getMonthlyCashFlow).mockReturnValue([]);

    const result = getDashboardData({} as never);
    expect(result.currentMonth.net).toBe(-5000);
  });
});
