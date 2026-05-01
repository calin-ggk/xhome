# Domain Model: Finance Tracker (Double-Entry)

## Design Principles

- **Units:** All amounts are stored as `INTEGER` (cents/smallest unit) to avoid floating-point errors.
- **Integrity:** Every transaction must satisfy `sum(debit) == sum(credit)`.
- **Currency:** `amount` is in account's native currency; `amount_base` is the value in system's base currency at transaction time.
- **Hierarchy:** Uses **Path Strategy** (`category`) for account organization.

---

## Database Schema (SQLite)

```sql
-- 1. Currencies & Exchange Rates
CREATE TABLE currencies (
  id          INTEGER PRIMARY KEY,
  code        TEXT    NOT NULL UNIQUE, -- ISO 4217 (USD, EUR, RON)
  name        TEXT    NOT NULL,
  symbol      TEXT    NOT NULL,
  decimal_places INTEGER NOT NULL DEFAULT 2, -- cents scale (USD=2, BTC=8, JPY=0)
  is_base     INTEGER NOT NULL DEFAULT 0 -- 1 = system base currency
);

CREATE TABLE exchange_rates (
  id           INTEGER PRIMARY KEY,
  currency_id  INTEGER NOT NULL REFERENCES currencies(id),
  rate         INTEGER NOT NULL, -- scaled integer; actual = rate / 10^currencies.decimal_places
  date         TEXT    NOT NULL, -- YYYY-MM-DD
  UNIQUE (currency_id, date)
);

-- 2. Securities (Stocks, Crypto, etc.)
CREATE TABLE securities (
  id              INTEGER PRIMARY KEY,
  ticker          TEXT    NOT NULL UNIQUE,
  name            TEXT    NOT NULL,
  currency_id     INTEGER NOT NULL REFERENCES currencies(id),
  type            TEXT    NOT NULL, -- stock | etf | crypto
  quantity_scale  INTEGER NOT NULL DEFAULT 6 -- decimal places for quantity (BTC=8, stock=4)
);

-- 3. Accounts (Single Table Inheritance)
CREATE TABLE accounts (
  id            INTEGER PRIMARY KEY,
  name          TEXT    NOT NULL,
  type          TEXT    NOT NULL CHECK (type IN ('debit', 'credit')),
  account_type  TEXT    NOT NULL CHECK (account_type IN ('simple', 'deposit', 'security')),
  currency_id   INTEGER NOT NULL REFERENCES currencies(id),
  category      TEXT    NOT NULL UNIQUE, -- e.g., "asset/bank/revolut"
  is_active     INTEGER NOT NULL DEFAULT 1,

  -- security subtype
  security_id   INTEGER REFERENCES securities(id), -- required when account_type = 'security'

  CHECK (account_type != 'security' OR security_id IS NOT NULL),
  CHECK (account_type  = 'security' OR security_id IS NULL)
);
CREATE INDEX idx_accounts_category ON accounts (category);

-- 4. Transactions (The Journal)
CREATE TABLE transactions (
  id           INTEGER PRIMARY KEY,
  date         TEXT     NOT NULL, -- YYYY-MM-DD (Business Date)
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  description  TEXT,
  hash         TEXT     UNIQUE    -- For deduplication (date+desc+amount hash)
);

CREATE TABLE transaction_entries (
  id              INTEGER PRIMARY KEY,
  transaction_id  INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  account_id      INTEGER NOT NULL REFERENCES accounts(id),
  side            TEXT    NOT NULL, -- debit | credit
  amount          INTEGER NOT NULL CHECK (amount > 0), -- Native cents
  amount_base     INTEGER NOT NULL, -- Base currency cents at transaction date
  quantity        INTEGER,          -- scaled integer; only for security accounts
  interest_rate   INTEGER,          -- basis points; only for deposit accounts (opening/renewal entries)
  maturity_date   TEXT,             -- YYYY-MM-DD; only for deposit accounts (opening/renewal entries)
  memo            TEXT              -- Line-specific note
);

-- 5. Tags (Cross-cutting concerns)
CREATE TABLE tags (
  id   INTEGER PRIMARY KEY,
  name TEXT    NOT NULL UNIQUE
);

CREATE TABLE transaction_tag_map (
  transaction_id INTEGER REFERENCES transactions(id) ON DELETE CASCADE,
  tag_id         INTEGER REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (transaction_id, tag_id)
);

-- 6. Reporting Snapshots
CREATE TABLE account_monthly_snapshots (
  id            INTEGER PRIMARY KEY,
  account_id    INTEGER NOT NULL REFERENCES accounts(id),
  date          TEXT    NOT NULL, -- YYYY-MM-01
  balance       INTEGER NOT NULL, -- Native cents
  balance_base  INTEGER NOT NULL, -- Base currency cents
  UNIQUE (account_id, date)
);
```

## Logic Rules for Implementation

1.  **The Balancing Act:** Any `action` that creates `transaction_entries` must wrap them in a DB transaction and verify:
    `SUM(entries WHERE side='debit') - SUM(entries WHERE side='credit') == 0`.
2.  **Asset/Expense:** Are `debit` accounts (increase with debit entries).
3.  **Income/Equity/Liability:** Are `credit` accounts (increase with credit entries).
4.  **Security Purchase Example:**
    - Debit `asset/shares/apple` (Value)
    - Debit `expense/fees` (Commission)
    - Credit `asset/bank/checking` (Total cost)
