import { logger } from '~/lib/logger';

const RATE_SCALE = 4;
const YAHOO_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';

type YahooChart = {
  chart: {
    result: Array<{
      indicators: { quote: Array<{ close: Array<number | null> }> };
    }> | null;
    error: unknown;
  };
};

export type FetchedRate = { rate: number; rateScale: number };

// Fetches current market prices for multiple symbols in parallel using the chart endpoint.
// Keys in the returned map match the requested symbol strings.
// Symbols not found or erroring are absent from the map.
export async function fetchCurrentPrices(symbols: string[]): Promise<Map<string, number>> {
  if (symbols.length === 0) return new Map();
  const today = new Date().toISOString().slice(0, 10);
  const results = await Promise.all(
    symbols.map(async s => [s, await fetchYahooClosePrice(s, today)] as const),
  );
  const map = new Map<string, number>();
  for (const [symbol, r] of results) {
    if (r !== null) {
      map.set(symbol, r.rate / Math.pow(10, r.rateScale));
    }
  }
  const missing = symbols.filter(s => !map.has(s));
  if (missing.length > 0) {
    logger.warn({ event: 'yahoo_finance.symbols_missing', missing });
  }
  return map;
}

export async function fetchExchangeRate(
  fromCurrency: string,
  toCurrency: string,
  date: string, // YYYY-MM-DD (snapshot date)
): Promise<FetchedRate | null> {
  if (fromCurrency === toCurrency) {
    return { rate: Math.pow(10, RATE_SCALE), rateScale: RATE_SCALE };
  }
  return fetchYahooClosePrice(`${fromCurrency}${toCurrency}=X`, date);
}

export async function fetchSecurityPrice(
  ticker: string,
  date: string, // YYYY-MM-DD (snapshot date)
): Promise<FetchedRate | null> {
  return fetchYahooClosePrice(ticker, date);
}

async function fetchYahooClosePrice(symbol: string, date: string): Promise<FetchedRate | null> {
  // 7-day window ending on snapshot date to handle non-trading days (weekends/holidays)
  const endMs   = new Date(`${date}T12:00:00Z`).getTime();
  const startMs = endMs - 7 * 24 * 60 * 60 * 1000;
  const period1 = Math.floor(startMs / 1000);
  const period2 = Math.floor(endMs / 1000);

  const url = `${YAHOO_URL}/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logger.warn({ event: 'yahoo_finance.fetch_failed', status: res.status, body, symbol, date });
      return null;
    }

    const json = await res.json() as YahooChart;
    const result = json?.chart?.result?.[0];
    if (!result) return null;

    const closes = result.indicators?.quote?.[0]?.close;
    if (!closes?.length) return null;

    // Last non-null close in the window (most recent trading day)
    const closePrice = [...closes].reverse().find((c): c is number => c !== null && isFinite(c));
    if (closePrice === undefined) {
      logger.warn({ event: 'yahoo_finance.no_close_price', symbol, date });
      return null;
    }

    return {
      rate:      Math.round(closePrice * Math.pow(10, RATE_SCALE)),
      rateScale: RATE_SCALE,
    };
  } catch (err) {
    logger.warn({ event: 'yahoo_finance.fetch_error', error: String(err), symbol, date });
    return null;
  }
}
