# Switching the Base Currency

This document describes how to migrate the database when the base currency changes (e.g. Romania switching from RON to EUR upon Eurozone entry).

## Why this is possible

`BASE_CURRENCY` is an env var, not a DB column. `balanceBase` is computed at runtime via a LEFT JOIN on `exchange_rates`, so no stored column needs rewriting for snapshots. Only the three things below require a migration script.

## Migration steps

### 1. Update `.env`

```
BASE_CURRENCY=EUR
```

### 2. Convert `transaction_entries.amount_base`

Every row stores `amount_base` in the old base currency (RON cents). Convert each row using the EUR/RON exchange rate on the transaction's date:

```sql
UPDATE transaction_entries
SET amount_base = ROUND(
  te.amount_base * 10000.0
  / COALESCE(
      (SELECT er.rate FROM exchange_rates er
       JOIN transactions t ON t.id = te.transaction_id
       JOIN currencies c ON c.code = 'EUR'
       WHERE er.currency_id = c.id
         AND er.date = (
           SELECT MAX(er2.date) FROM exchange_rates er2
           WHERE er2.currency_id = c.id AND er2.date <= t.date
         )
      ),
      10000
    )
)
FROM transaction_entries te
JOIN transactions t ON t.id = te.transaction_id;
```

In practice, write this as a script (TypeScript) that iterates rows and applies the rate lookup per transaction date, falling back to the nearest prior rate.

### 3. Rewrite `exchange_rates`

The table currently stores "RON per 1 foreign unit" (e.g. EUR → 49700, scale 4 = 4.9700 RON/EUR).

After the switch:
- **Delete old EUR rows** — EUR is now base, its rate is implicitly 1.
- **Insert RON rows** — RON becomes a foreign currency. Derive from old EUR rates: `new_rate = 10000 / old_eur_rate` (integer division, scale 4 → represents EUR/RON).
- **Recalculate other currencies** (USD, GBP, etc.) — their rates must now be expressed in EUR, not RON. Use: `new_rate = old_currency_rate / old_eur_rate` (both at the same date).

### 4. `account_monthly_snapshots` — no change needed

`balance` is stored in the account's native currency. `balanceBase` is computed at runtime via JOIN on `exchange_rates`. Once step 3 is done, all historical snapshots will re-compute correctly automatically.

## Summary table

| Table | Column | Action |
|---|---|---|
| `.env` | `BASE_CURRENCY` | Change `RON` → `EUR` |
| `transaction_entries` | `amount_base` | Convert each row: old RON cents → new EUR cents |
| `exchange_rates` | `rate` | Delete EUR rows; insert RON rows (inverted); recalculate other currencies relative to EUR |
| `account_monthly_snapshots` | `balance` | No change |
