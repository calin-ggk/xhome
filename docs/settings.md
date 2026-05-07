# Settings Module

Four sub-modules: **Currencies**, **Securities**, **Tags**, **Preferences**, plus **Snapshots**.

## Currencies

| Field | Type | Notes |
|---|---|---|
| `id` | integer PK | |
| `code` | text UNIQUE | ISO 4217 style, uppercase alphanumeric, 2–10 chars |
| `name` | text | |
| `symbol` | text | Max 10 chars |
| `decimalPlaces` | integer | 0–8, default 2; controls cents scale |
| `isBase` | 0 \| 1 | Exactly one base currency at all times |

**Constraints:** Cannot delete the base currency. Cannot delete if referenced by accounts, securities, or exchange rates. Setting a new base clears the old flag atomically.

## Securities

| Field | Type | Notes |
|---|---|---|
| `id` | integer PK | |
| `ticker` | text UNIQUE | Uppercase alphanumeric + `.` `-`, 1–20 chars |
| `name` | text | |
| `currencyId` | FK → currencies | |
| `type` | `stock` \| `etf` \| `crypto` | |
| `quantityScale` | integer | 0–10, default 6; decimal places for share quantities |

**Constraints:** Cannot delete if used by any account.

## Tags

| Field | Type | Notes |
|---|---|---|
| `id` | integer PK | |
| `name` | text UNIQUE | Max 50 chars |

**Constraints:** Cannot delete if tagged to any transaction.

## User Preferences

Singleton row (always `id = 1`).

| Field | Type | Notes |
|---|---|---|
| `defaultReportRange` | enum | `current_month` \| `last_month` \| `current_year` \| `last_year` \| `all_time` |

The `computeDateRange(range)` helper in `preferences.service.ts` converts the range to `{ from, to }` ISO date strings for report queries.

## Snapshots

`/settings/snapshots` triggers month-end snapshot generation for portfolio reports. The page also accepts manual overrides for exchange rates and security prices when live data is unavailable. See `docs/data_sourcing.md` for the full fetch/fallback strategy.

## Routes

| URL | File | Purpose |
|---|---|---|
| `/settings` | `_app.settings._index.tsx` | Hub with links to all sub-modules |
| `/settings/currencies` | `_app.settings.currencies.tsx` | List; delete |
| `/settings/currencies/new` | `_app.settings.currencies.new.tsx` | Create |
| `/settings/currencies/:id/edit` | `_app.settings.currencies.$id.edit.tsx` | Edit |
| `/settings/securities` | `_app.settings.securities.tsx` | List; delete |
| `/settings/securities/new` | `_app.settings.securities.new.tsx` | Create |
| `/settings/securities/:id/edit` | `_app.settings.securities.$id.edit.tsx` | Edit |
| `/settings/tags` | `_app.settings.tags.tsx` | List; delete |
| `/settings/tags/new` | `_app.settings.tags.new.tsx` | Create |
| `/settings/tags/:id/edit` | `_app.settings.tags.$id.edit.tsx` | Edit |
| `/settings/preferences` | `_app.settings.preferences.tsx` | Edit singleton preferences |
| `/settings/snapshots` | `_app.settings.snapshots.tsx` | Generate snapshots; manual rate/price input |
