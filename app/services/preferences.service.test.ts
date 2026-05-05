import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as repo from '~/repositories/preferences.repository';
import { getPreferences, updatePreferences, computeDateRange } from './preferences.service';

vi.mock('~/repositories/preferences.repository');
vi.mock('~/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }));

beforeEach(() => { vi.resetAllMocks(); });

describe('getPreferences', () => {
  it('delegates to repository', () => {
    const prefs = { id: 1, defaultReportRange: 'current_year' };
    vi.mocked(repo.getPreferences).mockReturnValue(prefs);
    expect(getPreferences({} as never)).toEqual(prefs);
  });
});

describe('updatePreferences', () => {
  it('calls upsertPreferences and returns ok', () => {
    vi.mocked(repo.upsertPreferences).mockReturnValue({ id: 1, defaultReportRange: 'last_6_months' });
    const result = updatePreferences({} as never, { defaultReportRange: 'last_6_months' });
    expect(result.ok).toBe(true);
    expect(repo.upsertPreferences).toHaveBeenCalledWith({}, { defaultReportRange: 'last_6_months' });
  });
});

describe('computeDateRange', () => {
  it('current_month: from is first of month', () => {
    const { from, to } = computeDateRange('current_month', '2026-05-15');
    expect(from).toBe('2026-05-01');
    expect(to).toBe('2026-05-15');
  });

  it('current_year: from is Jan 1 of current year', () => {
    const { from, to } = computeDateRange('current_year', '2026-05-15');
    expect(from).toBe('2026-01-01');
    expect(to).toBe('2026-05-15');
  });

  it('last_3_months: wraps across year boundary', () => {
    const { from, to } = computeDateRange('last_3_months', '2026-02-10');
    expect(from).toBe('2025-11-01');
    expect(to).toBe('2026-02-10');
  });

  it('last_6_months: same year', () => {
    const { from, to } = computeDateRange('last_6_months', '2026-08-20');
    expect(from).toBe('2026-02-01');
    expect(to).toBe('2026-08-20');
  });

  it('last_12_months: exactly one year back', () => {
    const { from, to } = computeDateRange('last_12_months', '2026-05-05');
    expect(from).toBe('2025-05-01');
    expect(to).toBe('2026-05-05');
  });

  it('all: returns null for both bounds', () => {
    const { from, to } = computeDateRange('all', '2026-05-05');
    expect(from).toBeNull();
    expect(to).toBeNull();
  });
});
