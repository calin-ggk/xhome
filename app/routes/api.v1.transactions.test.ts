import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as svc from '~/services/transaction.service';
import { loader as listLoader, action as listAction } from './api.v1.transactions._index';
import { loader as detailLoader, action as detailAction } from './api.v1.transactions.$id';

vi.mock('~/db/client', () => ({ db: {} }));
vi.mock('~/services/transaction.service');
vi.mock('~/config', () => ({
  env: { API_KEY: 'test-api-key-1234567890' },
}));

function makeReq(method: string, url: string, body?: unknown) {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': 'test-api-key-1234567890' },
    body: body !== undefined ? JSON.stringify(body) : null,
  });
}

const mockPage = {
  rows: [{ id: 1, date: '2025-01-01', description: 'Groceries', entryCount: 2, debitBase: 10000, tags: ['food'] }],
  total: 1, page: 1, pageSize: 10, pageCount: 1,
  filterTags: [], baseCurrency: { code: 'USD', symbol: '$', decimalPlaces: 2 },
};

const validBody = {
  date: '2025-01-15',
  description: 'Test transaction',
  tagIds: [],
  entries: [
    { accountId: 1, side: 'debit',  amountStr: '100.00', rateStr: '1.0' },
    { accountId: 2, side: 'credit', amountStr: '100.00', rateStr: '1.0' },
  ],
};

beforeEach(() => { vi.resetAllMocks(); });

describe('GET /api/v1/transactions', () => {
  it('returns 401 without API key', async () => {
    const res = await listLoader({ request: new Request('http://localhost/api/v1/transactions'), params: {}, context: {} } as never) as Response;
    expect(res.status).toBe(401);
  });

  it('returns paginated transactions', async () => {
    vi.mocked(svc.getTransactionsPageData).mockReturnValue(mockPage as never);
    const req = makeReq('GET', 'http://localhost/api/v1/transactions?page=1');
    const res = await listLoader({ request: req, params: {}, context: {} } as never) as Response;
    const json = await res.json();
    expect(json.data.rows).toHaveLength(1);
    expect(json.data.total).toBe(1);
  });

  it('passes filters to service', async () => {
    vi.mocked(svc.getTransactionsPageData).mockReturnValue(mockPage as never);
    const req = makeReq('GET', 'http://localhost/api/v1/transactions?q=food&dateFrom=2025-01-01&dateTo=2025-01-31&tagId=5');
    await listLoader({ request: req, params: {}, context: {} } as never);
    expect(svc.getTransactionsPageData).toHaveBeenCalledWith(
      expect.anything(),
      { q: 'food', dateFrom: '2025-01-01', dateTo: '2025-01-31', tagId: 5 },
      1,
    );
  });
});

describe('POST /api/v1/transactions', () => {
  it('creates transaction and returns 201', async () => {
    vi.mocked(svc.createTransaction).mockReturnValue({ ok: true, data: { id: 1 } as never });
    const req = makeReq('POST', 'http://localhost/api/v1/transactions', validBody);
    const res = await listAction({ request: req, params: {}, context: {} } as never) as Response;
    expect(res.status).toBe(201);
  });

  it('returns 422 for unbalanced entries', async () => {
    const unbalanced = {
      ...validBody,
      entries: [
        { accountId: 1, side: 'debit',  amountStr: '100.00', rateStr: '1.0' },
        { accountId: 2, side: 'credit', amountStr: '50.00',  rateStr: '1.0' },
      ],
    };
    const req = makeReq('POST', 'http://localhost/api/v1/transactions', unbalanced);
    const res = await listAction({ request: req, params: {}, context: {} } as never) as Response;
    expect(res.status).toBe(422);
  });
});

describe('GET /api/v1/transactions/:id', () => {
  it('returns 404 when not found', async () => {
    vi.mocked(svc.getEditTransactionFormData).mockReturnValue(null);
    const req = makeReq('GET', 'http://localhost/api/v1/transactions/99');
    const res = await detailLoader({ request: req, params: { id: '99' }, context: {} } as never) as Response;
    expect(res.status).toBe(404);
  });

  it('returns transaction detail', async () => {
    vi.mocked(svc.getEditTransactionFormData).mockReturnValue({
      transaction: { id: 1, date: '2025-01-01', description: null, entries: [], tagIds: [] } as never,
      accounts: [], exchangeRates: [], tags: [], baseCurrency: null,
    });
    const req = makeReq('GET', 'http://localhost/api/v1/transactions/1');
    const res = await detailLoader({ request: req, params: { id: '1' }, context: {} } as never) as Response;
    const json = await res.json();
    expect(json.data.id).toBe(1);
  });
});

describe('DELETE /api/v1/transactions/:id', () => {
  it('deletes transaction', async () => {
    vi.mocked(svc.deleteTransaction).mockReturnValue({ ok: true, data: undefined });
    const req = makeReq('DELETE', 'http://localhost/api/v1/transactions/1');
    const res = await detailAction({ request: req, params: { id: '1' }, context: {} } as never) as Response;
    expect(res.status).toBe(200);
  });
});
