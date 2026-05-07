# Data Import

Bulk-import currencies, accounts, securities, and transactions from a CSV file.

## Usage

```bash
npm run import -- [options] <file.csv>
```

| Option | Description |
|---|---|
| `--env=<file>` | Env file to load (default: `.env.test`) |
| `--dry-run` | Validate without writing |
| `--help` | Show full usage |

## CSV Format

First column is the entity type. Lines starting with `#` are comments.
Define entities in dependency order: currencies → exchange rates → securities → accounts → tags → transactions.

```
currency,<CODE>,<name>,<symbol>,<decimal_places>,<is_base: true|false>
exchange_rate,<CODE>,<YYYY-MM-DD>,<rate>
security,<TICKER>,<name>,<CURRENCY_CODE>,<type: stock|etf|crypto>,<quantity_scale>
account,<name>,<type: debit|credit>,<account_type: simple|deposit|security>,<CURRENCY_CODE>,<category>,[is_active],[SECURITY_TICKER]
tag,<name>
transaction,<YYYY-MM-DD>,<description>,[tags: name1|name2]
entry,<account_name>,<side: debit|credit>,<amount>,<rate>,[memo],[quantity],[interest_rate_pct],[maturity_date]
```

- Each `transaction` must be followed by at least 2 `entry` rows.
- `amount`: decimal in the currency's own units (e.g. `1125.00` for $1,125).
- `rate`: exchange rate to base currency (`1` for base-currency entries, `4.75` for USD when RON is base).
- The entire import runs as a single SQLite transaction — all or nothing.

See `docs/import.csv` for a complete working example.
