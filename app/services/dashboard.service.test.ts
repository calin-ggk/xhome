import { describe, it, expect, vi } from 'vitest';
import * as repo from '~/repositories/dashboard.repository';
import { getNetWorth } from './dashboard.service';

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
