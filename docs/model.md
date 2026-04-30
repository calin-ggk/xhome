# Domain Model

Personal finance tracker using a simplified double-entry accounting system.

## Design principles

- Every financial entity (bank account, expense category, income source, share holding) is an **account**
- Every financial event is a **transaction** composed of two or more entries where `sum(debits) = sum(credits)`
- All amounts are stored in the account's native currency; `amount_base` converts to the base currency at transaction time for fast reporting
- Account hierarchy is stored using the **path strategy** on the `category` column

---

## Tables

### `currencies`
```sql
currencies (
  id      INTEGER PRIMARY KEY,
  code    TEXT    NOT NULL UNIQUE,  -- ISO 4217: USD, EUR, RON
  name    TEXT    NOT NULL,
  symbol  TEXT    NOT NULL,
  is_base INTEGER NOT NULL DEFAULT 0  -- exactly one row = 1, used for report aggregation
)
```

---

### `exchange_rates`

Stores the rate of each non-base currency relative to the base currency (1 unit of `currency_id` = `rate` units of base). Cross-currency conversion (e.g. EUR → USD) is `rate_EUR / rate_USD`.

```sql
exchange_rates (
  id           INTEGER PRIMARY KEY,
  currency_id  INTEGER NOT NULL REFERENCES currencies(id),  -- the non-base currency
  rate         REAL    NOT NULL,  -- 1 unit of this currency = rate units of base
  date         TEXT    NOT NULL,  -- YYYY-MM-DD
  UNIQUE (currency_id, date)
)
```

---

### `securities`
```sql
securities (
  id             INTEGER PRIMARY KEY,
  ticker         TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  currency_id    INTEGER NOT NULL REFERENCES currencies(id),
  type           TEXT    NOT NULL  -- stock | etf | bond | crypto | other
)
```

---

### `security_prices`

Historical end-of-day prices per security.

```sql
security_prices (
  id           INTEGER PRIMARY KEY,
  security_id  INTEGER NOT NULL REFERENCES securities(id),
  date         TEXT    NOT NULL,  -- YYYY-MM-DD
  price        REAL    NOT NULL,
  UNIQUE (security_id, date)
)
```

---

### `accounts`

Every trackable entity is an account. The `category` column encodes the full hierarchy using the path strategy (e.g. `expense/food/groceries`). Prefix queries use `WHERE category LIKE 'expense/food%'`.

`type` rule:
- `debit`: accounts that grow when you add money to them (bank accounts, shares, expenses)
- `credit`: accounts that grow when you receive money (income, equity)

`security_id` is non-null only for share accounts (one account per security held).

```sql
accounts (
  id             INTEGER PRIMARY KEY,
  name           TEXT    NOT NULL,
  type           TEXT    NOT NULL,         -- debit | credit
  currency_id    INTEGER NOT NULL REFERENCES currencies(id),
  category       TEXT    NOT NULL UNIQUE,  -- path strategy: "expense/food/groceries"
  security_id    INTEGER REFERENCES securities(id),
  meta           TEXT                      -- JSON: optional type-specific data
);
CREATE INDEX idx_accounts_category ON accounts (category);
```

`meta` examples per account kind:
- deposit: `{"interest_rate": 5.25, "expiry_date": "2024-12-01", "bank": "BNR"}`
- loan: `{"interest_rate": 8.5, "monthly_payment": 300, "expiry_date": "2030-06-01"}`
- card: `{"credit_limit": 5000, "due_day": 25}`

**Example category paths:**
```
asset/bank/bnr_checking
asset/bank/revolut_eur
asset/shares/voo_etf
asset/deposit/bnr_6m

expense/food/groceries
expense/food/restaurants
expense/housing/rent
expense/transport

income/salary
income/dividends

equity/opening_balance
```

---

### `transactions`

The journal entry header. Each transaction must have at least two entries in `transaction_entries` that balance.

```sql
transactions (
  id           INTEGER PRIMARY KEY,
  date         TEXT NOT NULL,  -- YYYY-MM-DD
  description  TEXT
)
```

---

### `transaction_entries`

Individual debit/credit legs of a transaction.

`amount_base` is a deliberate denormalization: storing the base-currency value at insert time means monthly reports never need to join back to historical exchange rates.

`quantity` is non-null only for entries on share accounts.

```sql
transaction_entries (
  id              INTEGER PRIMARY KEY,
  transaction_id  INTEGER NOT NULL REFERENCES transactions(id),
  account_id      INTEGER NOT NULL REFERENCES accounts(id),
  side            TEXT    NOT NULL,  -- debit | credit
  amount          REAL    NOT NULL CHECK (amount > 0),
  amount_base     REAL,              -- amount in base currency (amount × exchange_rate at transaction date)
  quantity        REAL               -- shares quantity; NULL for non-share accounts
)
```

**Example transactions:**

| Scenario | Debit | Credit |
|---|---|---|
| Receive salary | `asset/bank/bnr_checking` | `income/salary` |
| Buy groceries | `expense/food/groceries` | `asset/bank/revolut_eur` |
| Transfer between accounts | `asset/bank/bnr_checking` | `asset/bank/revolut_eur` |
| Buy shares | `asset/shares/voo_etf` (+quantity) | `asset/bank/revolut_eur` |
| Open term deposit | `asset/deposit/bnr_6m` | `asset/bank/bnr_checking` |

---

### `account_monthly_snapshots`

Stores end-of-month balances per account. For share accounts: `balance = quantity_held × price_at_month_end`, then converted via the month-end exchange rate into `balance_base`.

```sql
account_monthly_snapshots (
  id            INTEGER PRIMARY KEY,
  account_id    INTEGER NOT NULL REFERENCES accounts(id),
  date          TEXT    NOT NULL,  -- first day of the month: YYYY-MM-01
  balance       REAL    NOT NULL,  -- in account's own currency
  balance_base  REAL,              -- in base currency
  UNIQUE (account_id, date)
)
```

---

## Derived queries

### Average cost per share symbol
```sql
SELECT
  s.ticker,
  SUM(CASE WHEN te.side = 'debit' THEN te.quantity ELSE -te.quantity END)          AS total_shares,
  SUM(CASE WHEN te.side = 'debit' THEN te.amount_base ELSE -te.amount_base END) /
  SUM(CASE WHEN te.side = 'debit' THEN te.quantity ELSE -te.quantity END)           AS avg_cost_base
FROM transaction_entries te
JOIN accounts a   ON te.account_id = a.id
JOIN securities s ON a.security_id = s.id
GROUP BY s.ticker;
```

### Monthly net worth
```sql
SELECT date, SUM(balance_base) AS net_worth
FROM account_monthly_snapshots
JOIN accounts ON account_monthly_snapshots.account_id = accounts.id
WHERE accounts.category LIKE 'asset%'
GROUP BY date
ORDER BY date;
```

### Monthly spending by category
```sql
SELECT
  a.category,
  strftime('%Y', t.date) AS year,
  strftime('%m', t.date) AS month,
  SUM(te.amount_base)    AS total
FROM transaction_entries te
JOIN transactions t ON te.transaction_id = t.id
JOIN accounts a     ON te.account_id     = a.id
WHERE a.category LIKE 'expense%'
  AND te.side = 'debit'
GROUP BY a.category, year, month
ORDER BY year, month, total DESC;
```
