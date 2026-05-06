import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as svc from '~/services/account.service';
import { loader as listLoader, action as listAction } from './api.v1.accounts._index';
import { loader as detailLoader, action as detailAction } from './api.v1.accounts.$id';

vi.mock('~/db/client', () => ({ db: {} }));
vi.mock('~/services/account.service');
vi.mock('~/config', () => ({
  env: { API_KEY: 'test-api-key-1234567890' },
}));

const AUTH = { 'X-Api-Key': 'test-api-key-1234567890' };

function makeReq(method: string, url: string, body?: unknown, headers?: Record<string, string>) {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': 'test-api-key-1234567890', ...headers },
    body: body !== undefined ? JSON.stringify(body) : null,
  });
}

const mockAccount = {
  id: 1, name: 'Bank', type: 'debit', accountType: 'simple',
  category: 'asset/bank', isActive: 1, currencyCode: 'USD', securityTicker: null,
};

beforeEach(() => { vi.resetAllMocks(); });

describe('GET /api/v1/accounts', () => {
  it('returns 401 without API key', async () => {
    const req = new Request('http://localhost/api/v1/accounts');
    const res = await listLoader({ request: req, params: {}, context: {} } as never);
    expect((res as Response).status).toBe(401);
  });

  it('returns account list', async () => {
    vi.mocked(svc.getAccountsPageData).mockReturnValue({ groups: [{ prefix: 'asset', accounts: [mockAccount as never] }] });
    const req = makeReq('GET', 'http://localhost/api/v1/accounts');
    const res = await listLoader({ request: req, params: {}, context: {} } as never) as Response;
    const json = await res.json();
    expect(json.data).toHaveLength(1);
    expect(json.data[0].name).toBe('Bank');
  });
});

describe('POST /api/v1/accounts', () => {
  const validBody = {
    name: 'Savings', type: 'debit', accountType: 'simple',
    currencyId: 1, category: 'asset/savings', isActive: 1,
  };

  it('creates account and returns 201', async () => {
    vi.mocked(svc.createAccount).mockReturnValue({ ok: true, data: { id: 2, ...validBody, securityId: null } as never });
    const req = makeReq('POST', 'http://localhost/api/v1/accounts', validBody);
    const res = await listAction({ request: req, params: {}, context: {} } as never) as Response;
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.id).toBe(2);
  });

  it('returns 422 for invalid body', async () => {
    const req = makeReq('POST', 'http://localhost/api/v1/accounts', { name: '' });
    const res = await listAction({ request: req, params: {}, context: {} } as never) as Response;
    expect(res.status).toBe(422);
  });

  it('returns 409 on service conflict', async () => {
    vi.mocked(svc.createAccount).mockReturnValue({ ok: false, error: 'accounts.duplicateCategory' });
    const req = makeReq('POST', 'http://localhost/api/v1/accounts', validBody);
    const res = await listAction({ request: req, params: {}, context: {} } as never) as Response;
    expect(res.status).toBe(409);
  });
});

describe('GET /api/v1/accounts/:id', () => {
  it('returns 404 when not found', async () => {
    vi.mocked(svc.getEditAccountFormData).mockReturnValue(null);
    const req = makeReq('GET', 'http://localhost/api/v1/accounts/99');
    const res = await detailLoader({ request: req, params: { id: '99' }, context: {} } as never) as Response;
    expect(res.status).toBe(404);
  });

  it('returns account detail', async () => {
    vi.mocked(svc.getEditAccountFormData).mockReturnValue({
      account: { ...mockAccount, currencyId: 1, securityId: null } as never,
      currencies: [],
      securities: [],
    });
    const req = makeReq('GET', 'http://localhost/api/v1/accounts/1');
    const res = await detailLoader({ request: req, params: { id: '1' }, context: {} } as never) as Response;
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.id).toBe(1);
  });
});

describe('DELETE /api/v1/accounts/:id', () => {
  it('returns 200 on success', async () => {
    vi.mocked(svc.deleteAccount).mockReturnValue({ ok: true, data: undefined });
    const req = makeReq('DELETE', 'http://localhost/api/v1/accounts/1');
    const res = await detailAction({ request: req, params: { id: '1' }, context: {} } as never) as Response;
    expect(res.status).toBe(200);
  });

  it('returns 409 when account has entries', async () => {
    vi.mocked(svc.deleteAccount).mockReturnValue({ ok: false, error: 'accounts.cannotDelete' });
    const req = makeReq('DELETE', 'http://localhost/api/v1/accounts/1');
    const res = await detailAction({ request: req, params: { id: '1' }, context: {} } as never) as Response;
    expect(res.status).toBe(409);
  });
});
