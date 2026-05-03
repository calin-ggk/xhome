import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { getSession, commitSession } from '../session.server';
import { loader, action } from './login';

vi.mock('bcryptjs');
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

const makeArgs = (method = 'GET', body?: FormData) => ({
  request: new Request('http://localhost/login', { method, body }),
  params: {},
  context: {},
});

beforeEach(() => {
  vi.mocked(getSession).mockResolvedValue(mockSession as never);
  vi.mocked(commitSession).mockResolvedValue('test-cookie=value');
  mockSession.get.mockReset();
  mockSession.set.mockReset();
});

describe('loader', () => {
  it('redirects to / when already authenticated', async () => {
    mockSession.get.mockReturnValue(true);
    const response = await loader(makeArgs() as never);
    expect((response as Response).status).toBe(302);
    expect((response as Response).headers.get('Location')).toBe('/');
  });

  it('returns data when not authenticated', async () => {
    mockSession.get.mockReturnValue(undefined);
    const response = await loader(makeArgs() as never);
    expect(response).toEqual({});
  });
});

describe('action', () => {
  it('returns error for wrong password', async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);
    const form = new FormData();
    form.append('username', 'admin');
    form.append('password', 'wrong');
    const result = await action(makeArgs('POST', form) as never);
    expect(result).toEqual({ errorKey: 'login.invalidCredentials' });
  });

  it('returns error for wrong username', async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    const form = new FormData();
    form.append('username', 'notadmin');
    form.append('password', 'anything');
    const result = await action(makeArgs('POST', form) as never);
    expect(result).toEqual({ errorKey: 'login.invalidCredentials' });
  });

  it('redirects to / with session cookie on valid credentials', async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    const form = new FormData();
    form.append('username', 'admin');
    form.append('password', 'correct');
    const response = await action(makeArgs('POST', form) as never) as Response;
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/');
    expect(response.headers.get('Set-Cookie')).toBe('test-cookie=value');
    expect(mockSession.set).toHaveBeenCalledWith('authenticated', true);
  });
});
