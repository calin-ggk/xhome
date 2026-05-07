# Report Data Sourcing

## History reports (Net Worth, Securities)

Past months use `account_monthly_snapshots`. Snapshots are stored with `date = YYYY-MM-01` (first of the *next* month), so April 2024 data lives at `2024-05-01`.

The current (still-open) month has no snapshot yet. A live data point is computed on the fly:

1. **Account balances** — queried from `transaction_entries` with `date <= today` (inclusive).
2. **Regular accounts** — native-currency balance converted to base currency using the current FX rate.
3. **Security accounts** — `net_quantity × current_price × current_fx_rate`.
4. **Yahoo Finance** — all required symbols (FX pairs like `USDRON=X` and security tickers like `AAPL`) are fetched in a **single batch request** to `/v7/finance/quote?symbols=…`.

### Missing prices / rates

If Yahoo Finance is unavailable for any required symbol:

- `liveStatus: { state: 'missing', missingRates: [...], missingPrices: [...] }` is returned alongside the normal chart data.
- The report UI renders a warning box with a GET form for manual entry.
- Manual values are passed as URL query params: `rate_{currencyId}` (decimal rate, e.g. `4.6` for 1 EUR = 4.6 RON) and `price_{securityId}` (decimal price, e.g. `175.00` for AAPL).
- The loader parses these on the next request and passes them to the service as `ManualLiveRate[]` / `ManualLivePrice[]`.
- When all symbols are resolved (either from Yahoo Finance or manual input), `liveStatus: { state: 'ok' }` and the live point appears in the chart.

## Balance Sheet & Income Statement

Always computed live from `transaction_entries`. No snapshot dependency.

## Key files

| Layer | File |
|---|---|
| Batch fetch | `app/lib/yahoo-finance.ts` → `fetchCurrentPrices` |
| Live DB queries | `app/repositories/reports.repository.ts` → `getLiveRegularBalances`, `getLiveSecurityQuantities` |
| Live computation | `app/services/reports.service.ts` → `computeLiveNetWorthByCurrency`, `computeLiveSecurities` |
| Net Worth route | `app/routes/_app.reports.net-worth.tsx` |
| Securities route | `app/routes/_app.reports.securities.tsx` |
