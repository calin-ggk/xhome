# Personal Finance Tracker - Project Context

## Project Overview

A double-entry accounting system for multi-currency tracking and security performance.
**Stack:** React Router 7 (Framework Mode), SQLite, Zod, TypeScript.

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
- **Services:** All business logic lives in `app/services/`. A service may call repositories but never touches the DB directly.
- **Repositories:** All DB queries live in `app/repositories/`. No raw DB calls outside this layer.

## Reference

- **Domain Specs:** `docs/domain.md` (Full Schema & Business Logic details).
- **Plan:** `implementation_steps.md`
