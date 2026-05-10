import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as svc from '~/services/currency.service';
import { loader as listLoader, action as listAction } from './api.v1.currencies._index';
import { loader as detailLoader, action as detailAction } from './api.v1.currencies.$id';

vi.mock('~/db/client', () => ({ db: {} }));
vi.mock('~/services/currency.service');
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

const mockCurrency = { id: 1, code: 'USD', name: 'US Dollar', symbol: '$', decimalPlaces: 2 };
const validBody    = { code: 'EUR', name: 'Euro', symbol: '€', decimalPlaces: 2 };

beforeEach(() => { vi.resetAllMocks(); });

describe('GET /api/v1/currencies', () => {
  it('returns 401 without API key', async () => {
    const res = await listLoader({ request: new Request('http://localhost/api/v1/currencies'), params: {}, context: {} } as never) as Response;
    expect(res.status).toBe(401);
  });

  it('returns currency list', async () => {
    vi.mocked(svc.getAllCurrencies).mockReturnValue([mockCurrency as never]);
    const req = makeReq('GET', 'http://localhost/api/v1/currencies');
    const res = await listLoader({ request: req, params: {}, context: {} } as never) as Response;
    const json = await res.json();
    expect(json.data).toHaveLength(1);
    expect(json.data[0].code).toBe('USD');
  });
});

describe('POST /api/v1/currencies', () => {
  it('creates currency and returns 201', async () => {
    vi.mocked(svc.createCurrency).mockReturnValue({ ok: true });
    const req = makeReq('POST', 'http://localhost/api/v1/currencies', validBody);
    const res = await listAction({ request: req, params: {}, context: {} } as never) as Response;
    expect(res.status).toBe(201);
  });

  it('returns 422 for invalid body', async () => {
    const req = makeReq('POST', 'http://localhost/api/v1/currencies', { code: 'x' });
    const res = await listAction({ request: req, params: {}, context: {} } as never) as Response;
    expect(res.status).toBe(422);
  });

  it('returns 409 on duplicate code', async () => {
    vi.mocked(svc.createCurrency).mockReturnValue({ ok: false, error: 'currencies.duplicateCode' });
    const req = makeReq('POST', 'http://localhost/api/v1/currencies', validBody);
    const res = await listAction({ request: req, params: {}, context: {} } as never) as Response;
    expect(res.status).toBe(409);
  });
});

describe('GET /api/v1/currencies/:id', () => {
  it('returns 404 when not found', async () => {
    vi.mocked(svc.getCurrencyById).mockReturnValue(undefined);
    const req = makeReq('GET', 'http://localhost/api/v1/currencies/99');
    const res = await detailLoader({ request: req, params: { id: '99' }, context: {} } as never) as Response;
    expect(res.status).toBe(404);
  });

  it('returns currency', async () => {
    vi.mocked(svc.getCurrencyById).mockReturnValue(mockCurrency as never);
    const req = makeReq('GET', 'http://localhost/api/v1/currencies/1');
    const res = await detailLoader({ request: req, params: { id: '1' }, context: {} } as never) as Response;
    const json = await res.json();
    expect(json.data.code).toBe('USD');
  });
});

describe('DELETE /api/v1/currencies/:id', () => {
  it('deletes currency', async () => {
    vi.mocked(svc.deleteCurrency).mockReturnValue({ ok: true });
    const req = makeReq('DELETE', 'http://localhost/api/v1/currencies/1');
    const res = await detailAction({ request: req, params: { id: '1' }, context: {} } as never) as Response;
    expect(res.status).toBe(200);
  });

  it('returns 409 when currency cannot be deleted', async () => {
    vi.mocked(svc.deleteCurrency).mockReturnValue({ ok: false, error: 'currencies.isBase' });
    const req = makeReq('DELETE', 'http://localhost/api/v1/currencies/1');
    const res = await detailAction({ request: req, params: { id: '1' }, context: {} } as never) as Response;
    expect(res.status).toBe(409);
  });
});
