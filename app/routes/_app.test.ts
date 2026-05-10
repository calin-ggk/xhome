import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSession } from '~/session.server';
import { getNetWorth } from '~/services/dashboard.service';
import { loader } from './_app';

vi.mock('~/session.server');
vi.mock('~/db/client', () => ({ db: {} }));
vi.mock('~/services/dashboard.service');
vi.mock('~/config', () => ({ env: { BASE_CURRENCY: 'RON' } }));

const mockSession = {
  get: vi.fn(),
  set: vi.fn(),
  has: vi.fn(),
  unset: vi.fn(),
  flash: vi.fn(),
  data: {},
  id: 'test-session',
};

const makeArgs = (path = '/') => ({
  request: new Request(`http://localhost${path}`),
  params: {},
  context: {},
});

beforeEach(() => {
  vi.mocked(getSession).mockResolvedValue(mockSession as never);
  vi.mocked(getNetWorth).mockReturnValue(0);
  mockSession.get.mockReset();
});

describe('loader', () => {
  it('redirects to /login when not authenticated', async () => {
    mockSession.get.mockReturnValue(undefined);
    await expect(loader(makeArgs() as never)).rejects.toMatchObject({ status: 302 });
    try {
      await loader(makeArgs() as never);
    } catch (response) {
      expect((response as Response).headers.get('Location')).toBe('/login');
    }
  });

  it('returns net worth when authenticated', async () => {
    mockSession.get.mockReturnValue(true);
    vi.mocked(getNetWorth).mockReturnValue(42000);
    const result = await loader(makeArgs() as never);
    expect(result).toEqual({ netWorth: 42000, baseCurrencyCode: 'RON' });
  });
});
