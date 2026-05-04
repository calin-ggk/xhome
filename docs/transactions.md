# Transactions Module

## Entities

### Transaction (header)

| Field | Type | Notes |
|---|---|---|
| `id` | integer PK | |
| `date` | text | `YYYY-MM-DD` business date |
| `description` | text \| null | Optional narrative |
| `hash` | text \| null | Deduplication key |

### TransactionEntry (legs)

| Field | Type | Notes |
|---|---|---|
| `id` | integer PK | |
| `transactionId` | FK → transactions | CASCADE delete |
| `accountId` | FK → accounts | |
| `side` | `debit` \| `credit` | |
| `amount` | integer | Native currency cents (must be > 0) |
| `amountBase` | integer | Base currency cents at transaction date |
| `quantity` | integer \| null | Scaled by `10^security.quantityScale`; security accounts only |
| `interestRate` | integer \| null | Basis points (100 = 1%); deposit accounts only |
| `maturityDate` | text \| null | `YYYY-MM-DD`; deposit accounts only |
| `memo` | text \| null | Line-level note |

## Balance Rule

Every transaction must satisfy: `SUM(debit amountBase) == SUM(credit amountBase)`.

Checked server-side in `transactionFormSchema` (Zod `superRefine`) and shown live in the form.

## Exchange Rate

`amountBase = round(amount × rateDecimal)` where `rateDecimal` = base-currency units per 1 native unit.

The stored rate in `exchange_rates`: `rate = round(rateDecimal × 10^currency.decimalPlaces)`.

**Auto-save:** when a transaction is saved with a foreign-currency entry and no rate exists in `exchange_rates` for `(currencyId, date)`, the used rate is automatically inserted (on-conflict ignored).

**Form pre-fill:** the form loader pre-loads all exchange rates; the client finds the closest rate on or before the transaction date for each account's currency. The user can override the rate, and editing the Base Amount back-calculates the Rate.

## Routes

| URL | File | Purpose |
|---|---|---|
| `/transactions` | `_app.transactions._index.tsx` | List; delete action |
| `/transactions/new` | `_app.transactions.new.tsx` | Create form |
| `/transactions/:id` | `_app.transactions.$id.tsx` | Edit form |

## Layering

- **Schema** — `app/schemas/transaction.schema.ts`: `entryFormSchema`, `transactionFormSchema`, `deleteTransactionSchema`
- **Repository** — `app/repositories/transaction.repository.ts`: all DB access
- **Service** — `app/services/transaction.service.ts`: `amountBase` computation, exchange rate auto-save, page data assembly
- **Form component** — `app/components/TransactionForm.tsx`: shared inline entry editor used by both new and edit routes

## Form Submission

Entries are serialized as JSON into a hidden `entriesJson` field. Tags are serialized as a comma-separated `tagIds` field. Both are populated before the ConfirmModal fires (which submits the form natively via `formRef.current.submit()`).
