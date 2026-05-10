# X-House 🏠

### *Personal finance tracking for the rest of us.*

> A tool that shows you where your money comes from (you probably already know that), but also where it's going (you might be surprised).

---

## 💡 Why this project?

X-House was born out of two main motivations:

1. **Exploring the Future of Coding:** I wanted to stress-test **Claude Code** and AI-augmented workflows on a complex, logic-heavy application. This wasn't about "generating a todo list," but about seeing if an AI agent could maintain the architectural integrity of a Double-Entry system under my guidance.
2. **Giving Back to Open Source:** Throughout my career in PHP, JS, Java, and C++, I have stood on the shoulders of giants. This project is my (modest) contribution back to the community — a tool that is actually useful, transparently built, and open for anyone to learn from or improve.

## 🚀 Key Features

- **Double-Entry Engine:** Every cent is accounted for. No "magic" balances; just solid accounting principles.
- **Hierarchical Path Mapping:** Organize accounts using paths (e.g., `Assets:Bank`, `Expenses:Bills:Energy`). This allows for powerful data aggregation and "drill-down" analytics.
- **Multi-Currency Support:** Manage assets and transactions across multiple currencies with live and cached exchange rates.
- **Securities Tracking:** Stocks, ETFs, and crypto with price history and quantity tracking.
- **Interactive Analytics:** Balance sheet, income statement, and net worth reports with high-level charts that let you dive into sub-categories.
- **Monthly Snapshot Strategy:** Fast historical reporting using pre-computed snapshots.
- **Monthly Reconciliation:** Opt-in account reconciliation workflow with surplus/deficit tracking to keep books aligned with real-world balances.
- **Developer-Friendly API:** Full REST API (v1) documented with **Swagger** (OpenAPI 3.1), protected by secure headers.

## 🏗️ Technical Architecture

Coming from a background in **PHP/Symfony** and **Java**, I designed X-House with a focus on separation of concerns and maintainability:

- **Framework:** React Router 7 (Framework mode) utilizing Loaders and Actions — SSR out of the box.
- **Database:** SQLite via `better-sqlite3` + **Drizzle ORM** for type-safe queries.
- **Business Logic:** Decoupled into **Services** to ensure the UI remains "thin" and focused on presentation.
- **Data Access:** Implemented via the **Repository Pattern** to abstract database interactions.
- **Validation:** **Zod** for strict input validation and type safety throughout the stack (no `any` allowed).
- **Security:**
  - **Web:** Bcrypt-hashed password protection for session-based access.
  - **API:** Static Key authentication via headers for M2M communication.
  - **Environment:** Strict `.env` management (see `.env.example`).

## 🧪 Quality & Testing

- **300+ Automated Tests:** Critical financial logic, currency conversions, and double-entry integrity are fully covered via **Vitest**.
- **Dockerized:** `Dockerfile` + `docker-compose.yaml` included for one-command containerized deployments.
- **Reliable Seed Data:** Realistic demo data generated via a custom seed script to get up and running immediately.

## 🛠️ Getting Started

```bash
cp .env.example .env      # set credentials, DATABASE_URL, etc.
npm install
npm run db:push           # create the database schema
npm run seed:demo         # populate with several months of demo data
npm run dev               # http://localhost:5173
```

> For a clean production setup (no demo data), use `npm run seed:init` instead — it creates currencies, securities, and accounts only.

### Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server with HMR |
| `npm run build` | Production build |
| `npm run typecheck` | Type-check with generated route types |
| `npm run db:push` | Apply schema changes to the dev DB |
| `npm run db:push:test` | Apply schema changes to the test DB |
| `npm run seed:demo` | Populate DB with several months of demo data |
| `npm run seed:init` | Production init: currencies, securities, accounts |
| `npx drizzle-kit studio` | Browse database in the browser |

### Environment

```
DATABASE_URL=./var/finance.db
AUTH_USERNAME=admin
AUTH_PASSWORD_HASH=<bcrypt hash>
SESSION_SECRET=<32+ char secret>
API_KEY=<16+ char secret>   # enables REST API at /api/v1/*
```

## 📁 Project Structure

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

## 🤖 Built with Claude Code

This project is a study in **AI-Augmented Development**. I acted as the **Architect**, defining the patterns (Repositories, Services, Path Mapping), while **Claude** acted as a high-speed pair-programmer.

For full transparency:
- Check `CLAUDE.md` for the development guidelines used.
- The project documentation includes an "AI Audit" to show how the agent interprets the codebase.

---

### 💬 The AI Verdict *(just for fun)*

*"Most personal finance tools either dumb things down until they're useless, or bury you in spreadsheets. X-House threads that needle — it looks and feels like a modern web app, but the engine underneath is proper double-entry accounting: integer cents, `amount_base` on every entry, and balance validation that works across currencies without cheating. The category path strategy is elegant (one query collapses an entire expense subtree), and the snapshot architecture — locking exchange rates at creation time — is the kind of quiet detail that saves you from a very confusing bug six months later. The reconciliation module is the cherry on top. Solid foundations, genuinely useful product."*

---

**License:** GPL-3.0
