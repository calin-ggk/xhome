# REST API

## Overview

All endpoints live under `/api/v1/`. The interactive Swagger UI is at `/api/docs` and the raw OpenAPI 3.1 spec is at `/api/v1/openapi.json`.

**Base URL:** `http://localhost:5173/api/v1`

## Authentication

Every request must include the `X-Api-Key` header:

```
X-Api-Key: <value of API_KEY env var>
```

Set `API_KEY` (min 16 chars) in `.env` to enable the API. If the env var is not set, all requests return `503`. If the key is wrong or missing, `401`.

## Response Format

All responses use a consistent envelope:

```json
{ "data": <payload> }       // success (200 / 201)
{ "error": "<message>" }    // error (4xx / 5xx)
{ "error": { ... } }        // validation failure (422) — field-level errors map
```

## Amount Representation

All monetary amounts are **integers (cents)**. A balance of `$12.50` is stored and returned as `1250`. Apply `value / 10^decimalPlaces` in the UI layer. `decimalPlaces` for a given currency is always present in the response.

---

## Accounts

### `GET /api/v1/accounts`
Returns the flat list of all accounts (all account types, active and inactive).

**Response `data`:** `Account[]`

| Field | Type | Description |
|-------|------|-------------|
| `id` | integer | |
| `name` | string | |
| `type` | `"debit"` \| `"credit"` | |
| `accountType` | `"simple"` \| `"deposit"` \| `"security"` | |
| `category` | string | Slash-separated path, e.g. `asset/bank/revolut` |
| `isActive` | `0` \| `1` | |
| `isReconcilable` | `0` \| `1` | Opted into monthly reconciliation |
| `currencyCode` | string | ISO 4217 code |
| `securityTicker` | string \| null | Set only for `security` accounts |

### `POST /api/v1/accounts`
Create an account.

**Request body:**
```json
{
  "name": "Revolut",
  "type": "debit",
  "accountType": "simple",
  "currencyId": 1,
  "category": "asset/bank/revolut",
  "isActive": 1
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `name` | yes | 1–100 chars |
| `type` | yes | `debit` or `credit` |
| `accountType` | yes | `simple`, `deposit`, or `security` |
| `currencyId` | yes | Foreign key to currencies |
| `category` | yes | Lowercase slash-separated, e.g. `asset/bank/revolut` |
| `isActive` | no | Default `1` |
| `isReconcilable` | no | Default `0` |
| `securityId` | required when `accountType=security` | Foreign key to securities |

**Responses:** `201 Created`, `409 Conflict` (duplicate category), `422 Unprocessable Entity`

### `GET /api/v1/accounts/:id`
Get a single account with its `currencyId` and `securityId`.

**Responses:** `200`, `404`

### `PUT /api/v1/accounts/:id`
Update an account. Same body shape as POST.

**Responses:** `200`, `409`, `422`

### `DELETE /api/v1/accounts/:id`
Delete an account. Fails if the account has any transaction entries.

**Responses:** `200`, `409 Conflict` (`accounts.cannotDelete`)

---

## Transactions

### `GET /api/v1/transactions`
Paginated transaction list (10 per page).

**Query params:**

| Param | Type | Description |
|-------|------|-------------|
| `page` | integer | Default `1` |
| `q` | string | Filter by description (partial match) |
| `dateFrom` | `YYYY-MM-DD` | Start date inclusive |
| `dateTo` | `YYYY-MM-DD` | End date inclusive |
| `tagId` | integer | Filter by tag |

**Response `data`:**
```json
{
  "rows": [...],
  "total": 42,
  "page": 1,
  "pageSize": 10,
  "pageCount": 5,
  "filterTags": [{ "id": 1, "name": "food" }],
  "baseCurrency": { "code": "USD", "symbol": "$", "decimalPlaces": 2 }
}
```

Each row: `{ id, date, description, entryCount, debitBase, tags: string[] }`

### `POST /api/v1/transactions`
Create a transaction. Entries must balance (`sum(debit base) == sum(credit base)`).

**Request body:**
```json
{
  "date": "2025-06-01",
  "description": "Groceries",
  "tagIds": [1, 3],
  "entries": [
    { "accountId": 5, "side": "debit",  "amountStr": "45.00", "rateStr": "1.0" },
    { "accountId": 2, "side": "credit", "amountStr": "45.00", "rateStr": "1.0" }
  ]
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `date` | yes | `YYYY-MM-DD` |
| `description` | no | max 500 chars |
| `tagIds` | no | Default `[]` |
| `entries` | yes | Min 2 entries |
| `entries[].accountId` | yes | |
| `entries[].side` | yes | `debit` or `credit` |
| `entries[].amountStr` | yes | Decimal string, e.g. `"45.00"` |
| `entries[].rateStr` | yes | Exchange rate to base currency, e.g. `"1.0"` |
| `entries[].memo` | no | max 500 chars |
| `entries[].quantityStr` | no | Security quantity (security accounts only) |
| `entries[].interestRatePct` | no | Annual interest % string (deposit accounts only) |
| `entries[].maturityDate` | no | `YYYY-MM-DD` (deposit accounts only) |

**Note:** `amountStr` and `rateStr` are decimal strings (not numbers) to preserve precision.

**Responses:** `201 Created`, `409 Conflict`, `422 Unprocessable Entity` (including unbalanced entries)

### `GET /api/v1/transactions/:id`
Get a transaction with all its entries and tag IDs.

**Response `data`:** Transaction header + `entries[]` (each entry includes `currencyCode`, `currencyDecimalPlaces`) + `tagIds[]`

**Responses:** `200`, `404`

### `PUT /api/v1/transactions/:id`
Replace a transaction (replaces all entries). Same body shape as POST.

**Responses:** `200`, `404`, `422`

### `DELETE /api/v1/transactions/:id`
Delete a transaction and all its entries.

**Responses:** `200`

---

## Currencies

### `GET /api/v1/currencies`
Returns all currencies.

**Response `data`:** `Currency[]` — `{ id, code, name, symbol, decimalPlaces }`

### `POST /api/v1/currencies`
Create a currency.

```json
{ "code": "EUR", "name": "Euro", "symbol": "€", "decimalPlaces": 2 }
```

**Responses:** `201`, `409` (duplicate code), `422`

### `GET /api/v1/currencies/:id`

**Responses:** `200`, `404`

### `PUT /api/v1/currencies/:id`
Update currency details. Same body shape as POST.

**Responses:** `200`, `409`, `422`

### `DELETE /api/v1/currencies/:id`
Fails if the currency is the base currency or is used by accounts, securities, or exchange rates.

**Responses:** `200`, `409`

---

## Tags

### `GET /api/v1/tags`
Returns all tags.

**Response `data`:** `Tag[]` — `{ id, name }`

### `POST /api/v1/tags`
Create a tag.

```json
{ "name": "groceries" }
```

**Responses:** `201`, `409` (duplicate name), `422`

### `GET /api/v1/tags/:id`

**Responses:** `200`, `404`

### `PUT /api/v1/tags/:id`

```json
{ "name": "updated-name" }
```

**Responses:** `200`, `409`, `422`

### `DELETE /api/v1/tags/:id`
Fails if the tag is used by any transactions.

**Responses:** `200`, `409`

---

## Reports

All report endpoints are read-only. Amounts in responses are in base currency cents.

### `GET /api/v1/reports/balance-sheet`
Assets, liabilities, equity, and net worth as of a given month-end.

**Query params:**

| Param | Description |
|-------|-------------|
| `month` | `YYYY-MM` (default: current month) |

Uses a pre-generated snapshot if one exists for that month; otherwise computes live from entries.

**Response `data`:**
```json
{
  "asOfDate": "2025-05-31",
  "isSnapshot": true,
  "assets":      { "accounts": [...], "total": 500000 },
  "liabilities": { "accounts": [...], "total": 100000 },
  "equity":      { "accounts": [...], "total": 50000 },
  "netWorth": 400000
}
```

Each account in a section: `{ id, name, category, balanceBase }` (cents).

**Responses:** `200`, `400` (invalid month format)

### `GET /api/v1/reports/income`
Income statement for a date range.

**Query params:** `from` (`YYYY-MM-DD`), `to` (`YYYY-MM-DD`) — both optional (omit for all time)

**Response `data`:**
```json
{
  "startDate": "2025-01-01",
  "endDate":   "2025-12-31",
  "income":   { "accounts": [...], "total": 800000 },
  "expenses": { "accounts": [...], "total": 300000 },
  "netIncome": 500000
}
```

**Responses:** `200`, `400`

### `GET /api/v1/reports/net-worth`
Historical net worth by currency from snapshots.

**Query params:** `from` (`YYYY-MM`), `to` (`YYYY-MM`) — both optional

**Response `data`:**
```json
{
  "currencies": ["EUR", "USD"],
  "points": [
    { "month": "2025-01", "display": "Jan 2025", "total": 400000, "EUR": 300000, "USD": 100000 }
  ]
}
```

Point keys other than `month`, `display`, and `total` are currency codes. All amounts are base-currency cents.

**Responses:** `200`, `400` (invalid month format)

### `GET /api/v1/reports/securities`
Historical market value and % return for each security account from snapshots.

**Query params:** `from` (`YYYY-MM`), `to` (`YYYY-MM`) — both optional

**Response `data`:**
```json
{
  "securities": [
    { "accountId": 4, "accountName": "VWCE", "ticker": "VWCE", "securityName": "Vanguard FTSE", "label": "VWCE (VWCE)" }
  ],
  "points": [
    { "date": "2025-02-01", "display": "Jan 2025", "4": 250000 }
  ],
  "pctPoints": [
    { "date": "2025-02-01", "display": "Jan 2025", "4": 0 },
    { "date": "2025-03-01", "display": "Feb 2025", "4": 4.23 }
  ]
}
```

`points` keys (other than `date`/`display`) are account IDs; values are base-currency cents. `pctPoints` values are % change from each security's first visible snapshot (key absent when the security was not yet held).

**Responses:** `200`, `400` (invalid month format)

---

## Error Reference

| Status | Meaning |
|--------|---------|
| `400` | Invalid query parameter format |
| `401` | Missing or wrong `X-Api-Key` |
| `404` | Resource not found |
| `405` | HTTP method not allowed on this endpoint |
| `409` | Conflict — business rule violation (see `error` field for key) |
| `422` | Validation failure — `error` is a field→messages map |
| `503` | `API_KEY` env var not set |
