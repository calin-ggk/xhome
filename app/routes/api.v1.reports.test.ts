import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as svc from '~/services/reports.service';
import { loader as bsLoader }         from './api.v1.reports.balance-sheet';
import { loader as incomeLoader }     from './api.v1.reports.income';
import { loader as nwLoader }         from './api.v1.reports.net-worth';
import { loader as spendingLoader }   from './api.v1.reports.spending';
import { loader as securitiesLoader } from './api.v1.reports.securities';

vi.mock('~/db/client', () => ({ db: {} }));
vi.mock('~/services/reports.service');
vi.mock('~/config', () => ({
  env: { API_KEY: 'test-api-key-1234567890' },
}));

function makeReq(url: string) {
  return new Request(url, {
    headers: { 'X-Api-Key': 'test-api-key-1234567890' },
  });
}

beforeEach(() => { vi.resetAllMocks(); });

describe('GET /api/v1/reports/balance-sheet', () => {
  it('returns 401 without API key', async () => {
    const res = await bsLoader({ request: new Request('http://localhost/api/v1/reports/balance-sheet'), params: {}, context: {} } as never) as Response;
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid month format', async () => {
    const req = makeReq('http://localhost/api/v1/reports/balance-sheet?month=invalid');
    const res = await bsLoader({ request: req, params: {}, context: {} } as never) as Response;
    expect(res.status).toBe(400);
  });

  it('returns balance sheet data', async () => {
    const mockData = { asOfDate: '2025-01-31', isSnapshot: false, assets: { accounts: [], total: 0 }, liabilities: { accounts: [], total: 0 }, equity: { accounts: [], total: 0 }, netWorth: 0 };
    vi.mocked(svc.getBalanceSheet).mockReturnValue(mockData);
    const req = makeReq('http://localhost/api/v1/reports/balance-sheet?month=2025-01');
    const res = await bsLoader({ request: req, params: {}, context: {} } as never) as Response;
    const json = await res.json();
    expect(json.data.asOfDate).toBe('2025-01-31');
  });
});

describe('GET /api/v1/reports/income', () => {
  it('returns 400 for invalid from date', async () => {
    const req = makeReq('http://localhost/api/v1/reports/income?from=bad-date');
    const res = await incomeLoader({ request: req, params: {}, context: {} } as never) as Response;
    expect(res.status).toBe(400);
  });

  it('returns income statement', async () => {
    const mockData = { startDate: null, endDate: null, income: { accounts: [], total: 0 }, expenses: { accounts: [], total: 0 }, netIncome: 0, incomeTree: [], expensesTree: [] };
    vi.mocked(svc.getIncomeStatement).mockReturnValue(mockData);
    const req = makeReq('http://localhost/api/v1/reports/income');
    const res = await incomeLoader({ request: req, params: {}, context: {} } as never) as Response;
    const json = await res.json();
    expect(json.data.netIncome).toBe(0);
  });
});

describe('GET /api/v1/reports/net-worth', () => {
  it('returns net worth history', async () => {
    vi.mocked(svc.getNetWorthHistoryData).mockReturnValue([{ month: '2025-01', display: 'Jan 2025', netWorthBase: 100000 }]);
    const req = makeReq('http://localhost/api/v1/reports/net-worth');
    const res = await nwLoader({ request: req, params: {}, context: {} } as never) as Response;
    const json = await res.json();
    expect(json.data).toHaveLength(1);
  });
});

describe('GET /api/v1/reports/spending', () => {
  it('returns spending tree', async () => {
    vi.mocked(svc.getSpendingTreeData).mockReturnValue({ startDate: null, endDate: null, roots: [], total: 0 });
    const req = makeReq('http://localhost/api/v1/reports/spending');
    const res = await spendingLoader({ request: req, params: {}, context: {} } as never) as Response;
    const json = await res.json();
    expect(json.data.total).toBe(0);
  });
});

describe('GET /api/v1/reports/securities', () => {
  it('returns securities history', async () => {
    vi.mocked(svc.getSecuritiesHistoryData).mockReturnValue({ securities: [], points: [] });
    const req = makeReq('http://localhost/api/v1/reports/securities');
    const res = await securitiesLoader({ request: req, params: {}, context: {} } as never) as Response;
    const json = await res.json();
    expect(json.data.securities).toHaveLength(0);
  });
});
