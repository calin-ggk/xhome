# Snapshots Module

## Purpose

`account_monthly_snapshots` pre-computes end-of-month balances so that analytics
(Balance Sheet, Net Worth history) can query a single table instead of replaying
every transaction entry.  The current (open) month is always computed on-the-fly;
only closed months use snapshots.

## Snapshot Date Convention

A snapshot for **April 2024** is stored with `date = '2024-05-01'` (the first day
of the following month).  The balance includes all entries where
`transactions.date < '2024-05-01'`.  The exchange rate used for `balance_base` is
also fetched for `'2024-05-01'`.

## Schema

```
account_monthly_snapshots
  id            INTEGER PK
  account_id    FK → accounts
  date          TEXT  'YYYY-MM-01'   (first of next month)
  balance       INTEGER              cents in account currency
  balance_base  INTEGER              cents in base currency (closing-rate method)
  UNIQUE(account_id, date)

exchange_rates
  id            INTEGER PK
  currency_id   FK → currencies
  rate          INTEGER              scaled integer
  rate_scale    INTEGER  DEFAULT 4   rate / 10^rate_scale = decimal rate
  date          TEXT  'YYYY-MM-DD'
  UNIQUE(currency_id, date)
```

## Balance Base — Closing-Rate Method

`balance_base` is computed at snapshot time using the exchange rate on the snapshot
date, **not** the historical cost from transaction entries.  This matches standard
closing-rate treatment for foreign-currency assets and liabilities.

```
balance_base = ROUND(balance × rate / 10^rate_scale)
```

## Missing-Month Detection

`getMissingSnapshotMonths` compares:
1. All distinct `YYYY-MM` values in `transactions.date` that are strictly before the
   current month.
2. All `date` values already present in `account_monthly_snapshots`.

Any month in set 1 but not set 2 is missing.

## Exchange Rate Resolution

When generating snapshots, rates are resolved in this order:

1. **Manual rates** supplied by the caller (e.g. from the Settings form).
2. **Yahoo Finance** — fetches the closing price for the pair (e.g. `EURRON=X`)
   using a 7-day window ending on the snapshot date to handle weekends and holidays.
3. **Abort** — if a rate cannot be resolved the service returns
   `{ ok: false, missingRates }` and the UI prompts the user for manual entry.

## Service API

```typescript
// app/services/snapshot.service.ts

getSnapshotStatus(db, today?)
  → { missingMonths: string[], snapshotCount: number }

generateMissingSnapshots(db, manualRates?, today?)
  → { ok: true;  monthsGenerated, snapshotsCreated }
  |  { ok: false; missingRates: MissingRate[] }   // needs manual FX input
  |  { ok: false; error: string }                  // unexpected failure
```

`today` is optional; defaults to the current date.  Pass an explicit date in tests
instead of mocking `Date`.

## Routes

| URL | File | Purpose |
|---|---|---|
| `/snapshots` | `_app.snapshots.tsx` | Status, generate button, manual rate form |
