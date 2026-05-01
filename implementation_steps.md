# Project Implementation Plan - Finance Tracker

## Phase 1: Foundation & Tooling

- [ ] **Project Initialization**
  - Setup React Router 7 (Framework Mode).
  - Install and configure **Bulma CSS** (via npm).
  - Install core dependencies: `drizzle-orm`, `better-sqlite3`, `zod`, `pino`, `i18next`, `lucide-react`.
  - Install dev dependencies: `drizzle-kit`, `@types/better-sqlite3`.
  - Enable TypeScript strictness in `tsconfig.json`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- [ ] **Infrastructure**
  - Add `./var/` to `.gitignore`. Configure `DATABASE_URL=./var/finance.db` in `.env`.
  - Setup **Drizzle Schema** in `app/db/schema.ts` based on `docs/domain.md`.
  - Configure `db` client singleton in `app/db/client.ts` (reads `DATABASE_URL` from env).
  - Define base currency constant in `app/config.ts` (e.g., `export const BASE_CURRENCY = 'RON'`).
  - Add Zod env validation in `app/config.ts` (fail-fast on missing `DATABASE_URL`).
  - Setup Logging (Pino) and i18n providers.
  - Initial DB Migration (`drizzle-kit push`).

## Phase 2: Core Layout (ING HomeBank Style)

- [ ] **Routing Structure** (`app/routes/`)
  - `_app.tsx` — root layout (sidebar + header)
  - `_app._index.tsx` — `/` Dashboard
  - `_app.transactions._index.tsx` — `/transactions`
  - `_app.transactions.new.tsx` — `/transactions/new`
  - `_app.transactions.$id.tsx` — `/transactions/:id`
  - `_app.accounts._index.tsx` — `/accounts`
  - `_app.accounts.new.tsx` — `/accounts/new`
  - `_app.accounts.$id.tsx` — `/accounts/:id`
  - `_app.reports.balance-sheet.tsx` — `/reports/balance-sheet`
  - `_app.reports.income.tsx` — `/reports/income`
  - `_app.reports.net-worth.tsx` — `/reports/net-worth`
  - `_app.settings.currencies.tsx` — `/settings/currencies`
  - `_app.settings.exchange-rates.tsx` — `/settings/exchange-rates` (manual entry + Yahoo Finance fetch)
  - `_app.settings.securities.tsx` — `/settings/securities`
  - `_app.settings.tags.tsx` — `/settings/tags`
  - `_app.settings.preferences.tsx` — `/settings/preferences` (default report time range, etc.)
- [ ] **App Shell**
  - Sticky Sidebar with navigation groups: **Main** (Dashboard, Transactions), **Accounts**, **Analytics** (Reports), **Settings** (Currencies, Exchange Rates, Securities, Tags, Preferences).
  - Header with Net Worth summary and "Quick Action" buttons.
- [ ] **Home Page**
  - Dashboard with summary cards and "Recent Transactions" list.
  - Mini-chart for cash flow using **Recharts**.

## Phase 3: Account & Transaction Management

- [ ] **Account Module**
  - Hierarchical list view (Path Strategy).
  - Create/Edit account modals with Zod validation.
- [ ] **Transaction Engine**
  - Double-entry form (Multi-leg support).
  - Server-side balance validation (Sum = 0).
  - Currency conversion at entry time: pre-fill exchange rate from `exchange_rates` table (closest rate on or before transaction date), shown as an editable field so the user can override before saving. `amount_base` is computed from the confirmed rate.

## Phase 4: Reports (The Core Goal)

- [ ] **Snapshot Strategy**
  - Current (open) month is always computed on-the-fly from entries.
  - Closed months use pre-computed `account_monthly_snapshots` for performance.
  - "Generate missing snapshots" button in Settings: detects all months with transactions but no snapshot and backfills them all in one operation (handles skipped months automatically).
- [ ] **Financial Statements**
  - Balance Sheet (Assets vs Liabilities).
  - Income Statement (Profit & Loss).
  - All reports use a configurable time-range filter; default range set in `/settings/preferences`.
- [ ] **Advanced Analytics**
  - Category spending tree (drill-down).
  - Net worth history chart.
