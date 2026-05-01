# Money — Personal Finance Tracker

A double-entry accounting system for personal finance with multi-currency support and investment tracking.

## Features

- Double-entry bookkeeping (every transaction balances)
- Multi-currency with exchange rate tracking
- Securities (stocks, ETFs, crypto) with price history
- Hierarchical accounts (path strategy)
- Balance sheet, income statement, and net worth reports
- Monthly snapshot strategy for fast historical reporting

## Stack

- **React Router 7** (Framework Mode, SSR)
- **SQLite** via `better-sqlite3` + **Drizzle ORM**
- **Zod** for validation
- **TypeScript** (strict mode)

## Getting Started

```bash
cp .env.example .env   # set DATABASE_URL
npm install
npx drizzle-kit push   # create the database
npm run dev            # http://localhost:5173
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server with HMR |
| `npm run build` | Production build |
| `npm run typecheck` | Type-check with generated route types |
| `npx drizzle-kit push` | Apply schema changes to the DB |
| `npx drizzle-kit studio` | Browse database in the browser |

## Project Structure

```
app/
  config.ts        # env validation, BASE_CURRENCY
  db/
    schema.ts      # Drizzle table definitions
    client.ts      # singleton DB client
  routes/          # React Router route modules
  services/        # business logic
  repositories/    # DB queries
docs/
  domain.md        # full schema & business rules
```

## Environment

```
DATABASE_URL=./var/finance.db
```
