# Personal Finance Tracker - Project Context

## Project Overview

A double-entry accounting system for multi-currency tracking and security performance.
**Stack:** React Router 7 (Framework Mode), SQLite, Drizzle ORM, Zod, TypeScript.

## Core Business Rules (Immutable)

- **Double-Entry:** Every transaction MUST balance: `sum(debit) == sum(credit)`.
- **Cents Only:** All currency amounts in DB are `INTEGER` (cents). Never use floats for money.
- **Base Currency:** Defined by `BASE_CURRENCY` env var (default `EUR`). Not stored on `currencies`. All reporting converts at runtime using exchange rates.
- **Entry `amount_base`:** Stored on `transaction_entries` only — base-currency value at transaction time. Used for double-entry validation and automatic commission detection.
- **Exchange Rate Resolution:** (1) `exchange_rates` table → (2) Yahoo Finance → (3) manual user entry.
- **Snapshot Rates:** Exchange rates are persisted at snapshot creation time so past-month reports always have the rates they need.
- **Account Types:** `debit` = Assets + Expenses. `credit` = Income + Liabilities + Equity.
- **Security Logic:** Buying shares increases `quantity` on a `debit` (Asset) account.
- **Multi-Currency Transactions:** A single transaction may have 3+ entries (e.g. currency exchange with a spread creates a Commission/Expense entry). Double-entry always balances in base currency.

## Key Entities & Relationships

- **Account:** Linked to a `currency`, optionally a `security`. `is_reconcilable` flag (default 0) opts into monthly reconciliation.
- **Transaction:** Header for a financial event; has many `transaction_entries`.
- **Entry:** One leg of a transaction — links an `account` to a `side` (debit/credit) and an `amount`.
- **Tags:** Many-to-many with `transactions` for cross-cutting tracking.
- **UserPreferences:** Singleton row for app-wide settings. Valid `default_report_range` values: `current_month`, `last_month`, `current_year`, `last_year`, `all_time`.
- **Currency:** Defines `decimal_places`. No `is_base` flag — base currency is `BASE_CURRENCY` env var.
- **ExchangeRate:** One rate per currency per date; stored as scaled integer (`rate / 10^rate_scale`, default scale 4).
- **Security:** Tradeable instrument (stock/ETF/crypto) with `quantity_scale` (default 6).

## Testing

- Every new feature must include Vitest tests (`npm test`) covering the happy path and key error cases.
- Test files co-located as `*.test.ts` next to the file under test.
- Test loaders, actions, and service/repository functions. Do not test UI rendering.
- Route tests: mock `app/session.server` and external modules. Repository tests: use a real in-memory SQLite DB.

## Implementation Specifics

- **Validation:** Zod for all input validation in Actions and Loaders.
- **Hierarchy:** Use the `category` path strategy (e.g., `expense/food/%`) for hierarchical queries.
- **Rounding:** All calculations in cents. Format to decimal ONLY in the UI layer.
- **Layering:** Routes handle validation + one service call + redirect/response only. No business logic or DB access in loaders/actions.
- **Services:** All business logic in `app/services/`. May call repositories; never touches DB directly.
- **Repositories:** All DB queries in `app/repositories/`. No raw DB calls outside this layer.
- **Logging:** Use `app/lib/logger.ts` (pino + pino-roll). Log level via `LOG_LEVEL` env var (default `info`). Emit structured JSON with an `event` field. Services: `info` on mutations, `error` on failures, `warn` on missing external data. External-fetch helpers: `warn` on HTTP/network failures. All HTTP requests logged at `info` in `entry.server.tsx`. No logging in repositories.

## CSS Organization

- **Global styles** (`app/app.css`): Bulma import + bare `html`/`body` rules only.
- **Component styles**: co-located `.css` file (e.g. `_app.tsx` → `_app.css`), imported at top of component.
- **Shared styles**: `shared_<feature-name>.css` in the directory where sharing components live.
- **No inline styles** in `.tsx` files. Use CSS classes or Bulma helpers.

## UX

**Forms (Create/Edit):**
- Use `app/components/AmountInput.tsx` for all numeric financial inputs.
- Back link (`← Feature`) is left-aligned outside the centered form block.
- Button group (`field is-grouped`) uses `justify-content: center`.

**Reports:**
- Content capped at `max-width: 860px` + `margin: 0 auto`.
- Report header: title and period selector inline on the same row (flex, `1rem` gap).
- Use `MonthPicker.tsx` for month-scoped filters, `RangePicker.tsx` for preset-range filters.
- Past months use snapshots; current month uses live Yahoo Finance prices. See `docs/data_sourcing.md`.

**Tables:** Numeric values `text-align: right`. Actions columns use `has-text-right` on both `<th>` and `<td>`.

**Localisation:** Use `useFormat()` for all displayed amounts, dates, and month labels. See `docs/localization.md`.

## Scripts

- `scripts/` — `migrate.ts`, `init.ts`, `demo.ts`. Dev: `npm run db:migrate` / `seed:init` / `seed:demo` (tsx, no build needed). Prod: bundled to `build/scripts/` by `npm run build`, invoked by Docker entrypoint.
- Docker `SEED_MODE=demo|init` wipes the DB and re-seeds; unset = migrations only.

## Reference

- `docs/domain.md` — full schema & business rules
- `docs/routes.md` — file-to-URL mapping
- `docs/dashboard.md` — data flow, layout, date strategy
- `docs/accounts.md` — entity shape, category paths, delete constraint, ConfirmModal pattern
- `docs/localization.md` — useFormat hook, pure helpers, form-input caveat
- `docs/api.md` — REST API endpoints, auth, shapes, errors. Web app is source of truth; update API route and this doc when services/shapes change.
- `docs/reconciliation.md` — workflow, entry direction, surplus/deficit accounts, snapshot-based book balance
- `implementation_steps.md` — current plan
