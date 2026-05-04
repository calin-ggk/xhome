# Project Implementation Plan - Finance Tracker

## Phase 1: Foundation & Tooling

- [x] **Project Initialization**
  - Setup React Router 7 (Framework Mode).
  - Install and configure **Bulma CSS** (via npm).
  - Install core dependencies: `drizzle-orm`, `better-sqlite3`, `zod`, `pino`, `i18next`, `lucide-react`.
  - Install dev dependencies: `drizzle-kit`, `@types/better-sqlite3`.
  - Enable TypeScript strictness in `tsconfig.json`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- [x] **Infrastructure**
  - Add `./var/` to `.gitignore`. Configure `DATABASE_URL=./var/finance.db` in `.env`.
  - Setup **Drizzle Schema** in `app/db/schema.ts` based on `docs/domain.md`.
  - Configure `db` client singleton in `app/db/client.ts` (reads `DATABASE_URL` from env).
  - Define base currency constant in `app/config.ts` (e.g., `export const BASE_CURRENCY = 'RON'`).
  - Add Zod env validation in `app/config.ts` (fail-fast on missing `DATABASE_URL`).
  - Setup Logging (Pino).
  - Initial DB Migration (`drizzle-kit push`).

## Phase 2: Authentication

- [x] **Single-user login**
  - Add `AUTH_USERNAME` and `AUTH_PASSWORD_HASH` to `.env` (bcrypt hash; no DB or schema changes).
  - `app/routes/login.tsx` — login form, validate credentials against env vars, create session.
  - `app/routes/logout.tsx` — destroy session and redirect to `/login`.
  - Session via `createCookieSessionStorage` (React Router 7 built-in); secret in `SESSION_SECRET` env var.
  - Auth guard in the root loader: redirect unauthenticated requests to `/login`.
  - Zod env validation in `app/config.ts`: fail-fast on missing `AUTH_USERNAME`, `AUTH_PASSWORD_HASH`, `SESSION_SECRET`.

## Phase 3: Core Layout (ING HomeBank Style)

- [x] **App Shell**
  - Sticky Sidebar with navigation groups: **Main** (Dashboard, Transactions), **Accounts**, **Analytics** (Reports), **Settings** (Currencies, Exchange Rates, Securities, Tags, Preferences).
  - Header with Net Worth summary and "Quick Action" buttons.
- [x] **Responsive Layout**
  - Collapsible sidebar (hamburger toggle) on narrow viewports.
  - Header adapts: Net Worth hidden on small screens, sidebar becomes a slide-in drawer.
  - Touch-friendly tap targets (min 44px) for nav items.
- [x] **Home Page**
  - Dashboard with summary cards and "Recent Transactions" list.
  - Mini-chart for cash flow using **Recharts**.

## Phase 4: Internationalisation (i18n)

- [x] **i18n Setup**
  - Install `react-i18next`; `i18next` already installed.
  - `app/i18n.ts` — configure i18next with inline resources (no HTTP backend); always init with `lng: 'en'`.
  - `app/locales/en.ts` — English translations.
  - `app/locales/ro.ts` — Romanian translations (typed against English shape).
  - Wrap app in `I18nextProvider` in `app/root.tsx`; sync language from `localStorage` after hydration.
  - Language toggle button (EN / RO) in the app header; persists in `localStorage`.
  - Retrofit all existing UI strings in `_app.tsx`, `_app._index.tsx`, `_app.settings._index.tsx`, `login.tsx`.

## Phase 5: Account Module

- [x] **Account Module**
  - Hierarchical list view (Path Strategy) with category prefix filter.
  - Create/Edit account pages (dedicated routes) with Zod validation; forms horizontally centered.
  - Reusable `ConfirmModal` component (`app/components/ConfirmModal.tsx`) for delete and save confirmations.

## Phase 6: Transaction Engine

- [x] **Transaction Engine**
  - Double-entry form (Multi-leg support).
  - Server-side balance validation (Sum = 0).
  - Currency conversion at entry time: pre-fill exchange rate from `exchange_rates` table (closest rate on or before transaction date), shown as an editable field so the user can override before saving. `amount_base` is computed from the confirmed rate.

## Phase 7: Reports (The Core Goal)

- [x] **Snapshot Strategy**
  - Current (open) month is always computed on-the-fly from entries.
  - Closed months use pre-computed `account_monthly_snapshots` for performance.
  - "Generate missing snapshots" button in Settings: detects all months with transactions but no snapshot and backfills them all in one operation (handles skipped months automatically).
- [ ] **Security pricing at snapshot time:**
  - Fetch close price from an external API (e.g. Yahoo Finance) for each security account on the snapshot date. If the API is unavailable or returns no data, show a simple form to enter prices manually before saving the snapshot.
- [ ] **Financial Statements**
  - Balance Sheet (Assets vs Liabilities).
  - Income Statement (Profit & Loss).
  - All reports use a configurable time-range filter; default range set in `/settings/preferences`.
- [ ] **Advanced Analytics**
  - Category spending tree (drill-down).
  - Net worth history chart.
