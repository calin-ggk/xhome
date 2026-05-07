const LOCALE_MAP: Record<string, string> = { en: 'en-US', ro: 'ro-RO' };

export function langToLocale(lang: string): string {
  return LOCALE_MAP[lang] ?? lang;
}

export function fmtAmount(cents: number, dp: number, locale: string): string {
  return (cents / 10 ** dp).toLocaleString(locale, {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
}

// YYYY-MM-DD → localised short date (e.g. "Apr 15, 2025" / "15 apr. 2025")
export function fmtDate(isoDate: string, locale: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString(locale, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

// YYYY-MM → short month+year (e.g. "Apr 2025" / "apr. 2025")
export function fmtMonth(yearMonth: string, locale: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  return new Date(y!, m! - 1, 1).toLocaleString(locale, { month: 'short', year: 'numeric' });
}

// YYYY-MM → long month+year (e.g. "April 2025" / "aprilie 2025")
export function fmtMonthLong(yearMonth: string, locale: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  return new Date(y!, m! - 1, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}

// YYYY-MM → abbreviated month only (e.g. "Apr" / "apr.")
export function fmtShortMonth(yearMonth: string, locale: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  return new Date(y!, m! - 1, 1).toLocaleString(locale, { month: 'short' });
}
