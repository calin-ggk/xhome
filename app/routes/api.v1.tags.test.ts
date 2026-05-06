import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as svc from '~/services/tag.service';
import { loader as listLoader, action as listAction } from './api.v1.tags._index';
import { loader as detailLoader, action as detailAction } from './api.v1.tags.$id';

vi.mock('~/db/client', () => ({ db: {} }));
vi.mock('~/services/tag.service');
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

beforeEach(() => { vi.resetAllMocks(); });

describe('GET /api/v1/tags', () => {
  it('returns 401 without API key', async () => {
    const res = await listLoader({ request: new Request('http://localhost/api/v1/tags'), params: {}, context: {} } as never) as Response;
    expect(res.status).toBe(401);
  });

  it('returns tag list', async () => {
    vi.mocked(svc.getAllTags).mockReturnValue([{ id: 1, name: 'food' }]);
    const req = makeReq('GET', 'http://localhost/api/v1/tags');
    const res = await listLoader({ request: req, params: {}, context: {} } as never) as Response;
    const json = await res.json();
    expect(json.data).toHaveLength(1);
  });
});

describe('POST /api/v1/tags', () => {
  it('creates tag and returns 201', async () => {
    vi.mocked(svc.createTag).mockReturnValue({ ok: true });
    const req = makeReq('POST', 'http://localhost/api/v1/tags', { name: 'groceries' });
    const res = await listAction({ request: req, params: {}, context: {} } as never) as Response;
    expect(res.status).toBe(201);
  });

  it('returns 422 for empty name', async () => {
    const req = makeReq('POST', 'http://localhost/api/v1/tags', { name: '' });
    const res = await listAction({ request: req, params: {}, context: {} } as never) as Response;
    expect(res.status).toBe(422);
  });

  it('returns 409 on duplicate', async () => {
    vi.mocked(svc.createTag).mockReturnValue({ ok: false, error: 'tags.duplicateName' });
    const req = makeReq('POST', 'http://localhost/api/v1/tags', { name: 'food' });
    const res = await listAction({ request: req, params: {}, context: {} } as never) as Response;
    expect(res.status).toBe(409);
  });
});

describe('GET /api/v1/tags/:id', () => {
  it('returns 404 when not found', async () => {
    vi.mocked(svc.getTagById).mockReturnValue(undefined);
    const req = makeReq('GET', 'http://localhost/api/v1/tags/99');
    const res = await detailLoader({ request: req, params: { id: '99' }, context: {} } as never) as Response;
    expect(res.status).toBe(404);
  });

  it('returns tag', async () => {
    vi.mocked(svc.getTagById).mockReturnValue({ id: 1, name: 'food' });
    const req = makeReq('GET', 'http://localhost/api/v1/tags/1');
    const res = await detailLoader({ request: req, params: { id: '1' }, context: {} } as never) as Response;
    const json = await res.json();
    expect(json.data.name).toBe('food');
  });
});

describe('DELETE /api/v1/tags/:id', () => {
  it('returns 200 on success', async () => {
    vi.mocked(svc.deleteTag).mockReturnValue({ ok: true });
    const req = makeReq('DELETE', 'http://localhost/api/v1/tags/1');
    const res = await detailAction({ request: req, params: { id: '1' }, context: {} } as never) as Response;
    expect(res.status).toBe(200);
  });

  it('returns 409 when tag is in use', async () => {
    vi.mocked(svc.deleteTag).mockReturnValue({ ok: false, error: 'tags.inUse' });
    const req = makeReq('DELETE', 'http://localhost/api/v1/tags/1');
    const res = await detailAction({ request: req, params: { id: '1' }, context: {} } as never) as Response;
    expect(res.status).toBe(409);
  });
});

describe('PUT /api/v1/tags/:id', () => {
  it('updates tag', async () => {
    vi.mocked(svc.updateTag).mockReturnValue({ ok: true });
    const req = makeReq('PUT', 'http://localhost/api/v1/tags/1', { name: 'updated' });
    const res = await detailAction({ request: req, params: { id: '1' }, context: {} } as never) as Response;
    expect(res.status).toBe(200);
  });
});
