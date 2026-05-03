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
| `_app.reports.balance-sheet.tsx` | `/reports/balance-sheet` | |
| `_app.reports.income.tsx` | `/reports/income` | |
| `_app.reports.net-worth.tsx` | `/reports/net-worth` | |
| `_app.settings.currencies.tsx` | `/settings/currencies` | |
| `_app.settings.exchange-rates.tsx` | `/settings/exchange-rates` | |
| `_app.settings.securities.tsx` | `/settings/securities` | |
| `_app.settings.tags.tsx` | `/settings/tags` | |
| `_app.settings.preferences.tsx` | `/settings/preferences` | |
