import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSession } from './session.server';
import { loader } from './root';

vi.mock('./session.server');

const mockSession = {
  get: vi.fn(),
  set: vi.fn(),
  has: vi.fn(),
  unset: vi.fn(),
  flash: vi.fn(),
  data: {},
  id: 'test-session',
};

const makeArgs = (path: string) => ({
  request: new Request(`http://localhost${path}`),
  params: {},
  context: {},
});

beforeEach(() => {
  vi.mocked(getSession).mockResolvedValue(mockSession as never);
  mockSession.get.mockReset();
});

describe('loader', () => {
  it('redirects to /login when unauthenticated on a protected route', async () => {
    mockSession.get.mockReturnValue(undefined);
    await expect(loader(makeArgs('/') as never)).rejects.toMatchObject({
      status: 302,
      headers: expect.objectContaining({
        get: expect.any(Function),
      }),
    });
    try {
      await loader(makeArgs('/') as never);
    } catch (response) {
      expect((response as Response).headers.get('Location')).toBe('/login');
    }
  });

  it('does not redirect on /login (public path)', async () => {
    mockSession.get.mockReturnValue(undefined);
    const result = await loader(makeArgs('/login') as never);
    expect(result).toBeNull();
  });

  it('does not redirect when authenticated', async () => {
    mockSession.get.mockReturnValue(true);
    const result = await loader(makeArgs('/') as never);
    expect(result).toBeNull();
  });
});
