# Personal Finance Tracker - Project Context

## Project Overview

A double-entry accounting system for multi-currency tracking and security performance.
**Stack:** React Router 7 (Framework Mode), SQLite, Drizzle ORM, Zod, TypeScript.

## Core Business Rules (Immutable)

- **Double-Entry:** Every transaction MUST balance: `sum(debit) == sum(credit)`.
- **Cents Only:** All currency amounts in DB are `INTEGER` (cents). Never use floats for money.
- **Base Currency:** All reporting uses `amount_base`, calculated at transaction time.
- **Account Types:**
  - `debit`: Assets (Bank, Cash, Shares), Expenses.
  - `credit`: Income, Liabilities (Loans), Equity.
- **Security Logic:** Buying shares increases `quantity` on a `debit` account (Asset).

## Key Entities & Relationships

- **Account:** Central unit linked to a `currency` and optionally a `security`.
- **Transaction:** Header for a financial event. Has many `transaction_entries`.
- **Entry:** A single leg linking an `account` to a `side` (debit/credit) and an `amount`.
- **Tags:** Many-to-many relationship with `transactions` for cross-cutting tracking.
- **UserPreferences:** Singleton row storing app-wide settings (e.g. `default_report_range`). Valid range values: `current_month`, `last_month`, `current_year`, `last_year`, `all_time`.
- **Currency:** Defines `decimal_places` (scale for amounts) and which is the `is_base` currency for reporting.
- **ExchangeRate:** One rate per currency per date; stored as a scaled integer (`rate / 10^rate_scale`, default scale 4).
- **Security:** A tradeable instrument (stock/ETF/crypto) with its own `quantity_scale` (default 6).

## Testing

- Every new feature must include Vitest tests (`npm test`) covering the happy path and key error cases.
- Test files co-located as `*.test.ts` next to the file under test.
- Test loaders, actions, and service/repository functions. Do not test UI rendering.
- Route tests: mock `app/session.server` and external modules. Repository tests: use a real in-memory SQLite DB.

## Implementation Specifics

- **Validation:** Use **Zod** for all input validation in Actions and Loaders.
- **Hierarchy:** Use the `category` path strategy (e.g., `expense/food/%`) for hierarchical queries.
- **Rounding:** Perform all calculations in cents. Format to decimal ONLY in the UI layer.
- **Database:** Use `better-sqlite3` or the React Router 7 recommended SQLite adapter.
- **Layering:** Routes only handle validation, a single service call, and redirect/response. No business logic or DB access in loaders/actions.
- **Logging:** Use `app/lib/logger.ts` (pino + pino-roll). Log level controlled by `LOG_LEVEL` env var (default `info`). Emit structured JSON events with an `event` field (e.g. `transaction.created`, `auth.login`). Services log `info` on mutations, `error` on failures, `warn` when external data is unavailable. External-fetch helpers (`app/lib/`) log `warn` on HTTP/network failures including status code and response body. All HTTP requests logged at `info` in `entry.server.tsx`. No logging in repositories.
- **Services:** All business logic lives in `app/services/`. A service may call repositories but never touches the DB directly.
- **Repositories:** All DB queries live in `app/repositories/`. No raw DB calls outside this layer.

## CSS Organization

- **Global styles** (`app/app.css`): Bulma import + bare `html`/`body` rules only.
- **Component styles**: co-located `.css` file with the same name as the component (e.g. `_app.tsx` → `_app.css`). Import it at the top of the component file.
- **Shared styles**: `shared_<feature-name>.css` in the directory where the sharing components live.
- **No inline styles** in `.tsx` files. Use CSS classes or Bulma helpers (`pt-0`, `mb-4`, `has-text-white`, etc.) instead.

## UX

**Forms (Create/Edit):**
- The **back link** (`← Feature`) sits outside the centered block, left-aligned inside `container is-fluid`.
- Form content wraps in `.<feature>-form-page` with `max-width` + `margin: 0 auto` to center horizontally.
- **Button group** (`field is-grouped`) uses `justify-content: center` so Save/Cancel sit at the horizontal center.

**Reports:**
- **Data sourcing:** Past months use snapshots; current month uses live Yahoo Finance prices (batch fetch). See `docs/data_sourcing.md`.
- Content is capped at `max-width: 860px` + `margin: 0 auto` — never stretches full viewport on large screens.
- **Report header** places the title and the period selector (e.g. `MonthPicker`, `RangePicker`) inline on the same row, left-aligned, using flex with a `1rem` gap.
- Use `app/components/MonthPicker.tsx` for any month-scoped report filter — it renders as a trigger button (`May 2026 ▾`) that opens a popover calendar on click.
- Use `app/components/RangePicker.tsx` for any preset-range report filter — it renders as a trigger button (`Last 3 Months ▾`) that opens a popover list; options are sorted at runtime by approximate span so `current_year` appears in the right position relative to the fixed-month ranges.

**Tables:**
- Numeric values use `text-align: right` for readability.
- **Actions columns** use `has-text-right` on both `<th>` and `<td>`.

**Localisation:** Use `useFormat()` for all displayed amounts, dates, and month labels — never hardcode a locale string. See `docs/localization.md`.

## Reference

- **Domain Specs:** `docs/domain.md` (Full Schema & Business Logic details).
- **Route Map:** `docs/routes.md` (file-to-URL mapping for all app routes).
- **Dashboard:** `docs/dashboard.md` (data flow, layout pattern, date strategy).
- **Accounts Module:** `docs/accounts.md` (entity shape, category paths, routes, delete constraint, ConfirmModal pattern).
- **Localisation:** `docs/localization.md` (useFormat hook, pure helpers, form-input caveat).
- **REST API:** `docs/api.md` (endpoints, auth, request/response shapes, error reference). The web app is the source of truth — the REST API is a read-only projection of it. Whenever a service or data shape changes, update the API route and `docs/api.md` to match.
- **Reconciliation Module:** `docs/reconciliation.md` (workflow, fixed-entry direction, two reconciliation accounts surplus/deficit, snapshot-based book balance, routes).
- **Plan:** `implementation_steps.md`
