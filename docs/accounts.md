# Accounts Module

## Entity

An **Account** is the central unit of the ledger. Key fields:

| Field | Type | Notes |
|---|---|---|
| `id` | integer PK | |
| `name` | text | Display name |
| `type` | `debit` \| `credit` | Determines normal balance side |
| `accountType` | `simple` \| `deposit` \| `security` | Subtype |
| `category` | text | Slash-separated path, e.g. `asset/bank/revolut` |
| `currencyId` | FK → currencies | |
| `securityId` | FK → securities \| null | Only for `security` subtype |
| `isActive` | 0 \| 1 | Inactive accounts stay in history but are hidden in new entries |

## Category Path Strategy

Categories are hierarchical paths using `/` as separator (all lowercase). Examples:
- `asset/bank/revolut`
- `expense/food/dining`
- `liability/loan`

Queries use `LIKE 'asset/bank/%'` for subtree matching. The accounts list groups by the top-level segment and can be filtered by any prefix.

## Account Types

- **debit** accounts: Assets (`asset/*`), Expenses (`expense/*`) — a debit entry increases the balance.
- **credit** accounts: Income (`income/*`), Liabilities (`liability/*`), Equity (`equity/*`) — a credit entry increases the balance.

## Routes

| URL | File | Purpose |
|---|---|---|
| `/accounts` | `_app.accounts._index.tsx` | List grouped by prefix; category filter; delete |
| `/accounts/new` | `_app.accounts.new.tsx` | Create account form |
| `/accounts/:id` | `_app.accounts.$id.tsx` | Edit account form |

## Delete Constraint

An account cannot be deleted if it has transaction entries. The service returns `{ ok: false, error: 'accounts.cannotDelete' }` in that case and the list page surfaces the translated error.

## ConfirmModal Pattern

Both the delete action (list page) and the save action (edit form) go through `ConfirmModal` (`app/components/ConfirmModal.tsx`) before submission. Delete uses `useSubmit` from react-router; save intercepts the native form submit event and calls `formRef.current.submit()` after confirmation.
