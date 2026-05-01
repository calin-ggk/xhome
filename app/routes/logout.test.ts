import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSession, destroySession } from '../session.server';
import { action } from './logout';

vi.mock('../session.server');

const mockSession = {
  get: vi.fn(),
  set: vi.fn(),
  has: vi.fn(),
  unset: vi.fn(),
  flash: vi.fn(),
  data: {},
  id: 'test-session',
};

beforeEach(() => {
  vi.mocked(getSession).mockResolvedValue(mockSession as never);
  vi.mocked(destroySession).mockResolvedValue('');
});

describe('action', () => {
  it('destroys the session and redirects to /login', async () => {
    const request = new Request('http://localhost/logout', { method: 'POST' });
    const response = await action({ request, params: {}, context: {} } as never) as Response;

    expect(vi.mocked(destroySession)).toHaveBeenCalledWith(mockSession);
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/login');
  });
});
