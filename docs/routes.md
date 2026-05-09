# Route Structure

All routes live in `app/routes/` and are registered explicitly in `app/routes.ts`. Routes marked ✓ are implemented; the rest are planned.

| File | URL | |
|------|-----|-|
| `_app.tsx` | — (root layout: sidebar + header) | ✓ |
| `_app._index.tsx` | `/` Dashboard | ✓ |
| `login.tsx` | `/login` | ✓ |
| `logout.tsx` | `/logout` | ✓ |
| `_app.settings._index.tsx` | `/settings` | ✓ |
| `_app.transactions._index.tsx` | `/transactions` | |
| `_app.transactions.new.tsx` | `/transactions/new` | |
| `_app.transactions.$id.tsx` | `/transactions/:id` | |
| `_app.accounts._index.tsx` | `/accounts` | |
| `_app.accounts.new.tsx` | `/accounts/new` | |
| `_app.accounts.$id.tsx` | `/accounts/:id` | |
| `_app.reconcile._index.tsx` | `/reconcile` | |
| `_app.reconcile.$id.tsx` | `/reconcile/:id` | |
| `_app.reports.balance-sheet.tsx` | `/reports/balance-sheet` | |
| `_app.reports.income.tsx` | `/reports/income` | |
| `_app.reports.net-worth.tsx` | `/reports/net-worth` | |
| `_app.settings.currencies.tsx` | `/settings/currencies` | |
| `_app.settings.exchange-rates.tsx` | `/settings/exchange-rates` | |
| `_app.settings.securities.tsx` | `/settings/securities` | |
| `_app.settings.tags.tsx` | `/settings/tags` | |
| `_app.settings.preferences.tsx` | `/settings/preferences` | |
| **REST API** | | |
| `api.docs.ts` | `/api/docs` (Swagger UI) | ✓ |
| `api.v1.openapi.ts` | `/api/v1/openapi.json` (OpenAPI 3.1 spec) | ✓ |
| `api.v1.accounts._index.ts` | `GET/POST /api/v1/accounts` | ✓ |
| `api.v1.accounts.$id.ts` | `GET/PUT/DELETE /api/v1/accounts/:id` | ✓ |
| `api.v1.transactions._index.ts` | `GET/POST /api/v1/transactions` | ✓ |
| `api.v1.transactions.$id.ts` | `GET/PUT/DELETE /api/v1/transactions/:id` | ✓ |
| `api.v1.currencies._index.ts` | `GET/POST /api/v1/currencies` | ✓ |
| `api.v1.currencies.$id.ts` | `GET/PUT/DELETE /api/v1/currencies/:id` | ✓ |
| `api.v1.tags._index.ts` | `GET/POST /api/v1/tags` | ✓ |
| `api.v1.tags.$id.ts` | `GET/PUT/DELETE /api/v1/tags/:id` | ✓ |
| `api.v1.reports.balance-sheet.ts` | `GET /api/v1/reports/balance-sheet` | ✓ |
| `api.v1.reports.income.ts` | `GET /api/v1/reports/income` | ✓ |
| `api.v1.reports.net-worth.ts` | `GET /api/v1/reports/net-worth` | ✓ |
| `api.v1.reports.spending.ts` | `GET /api/v1/reports/spending` | ✓ |
| `api.v1.reports.securities.ts` | `GET /api/v1/reports/securities` | ✓ |
