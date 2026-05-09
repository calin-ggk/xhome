# Reconciliation Module

## Purpose

Reconciliation closes the gap between the **book balance** (sum of recorded entries) and the **real balance** (from a bank statement or broker platform). It produces a single, balanced adjustment transaction.

## Account Eligibility

Only accounts with `is_reconcilable = 1` appear in the reconciliation list. This flag is set per account in the account edit form (defaults to off). Typical candidates: bank accounts, cash accounts. Securities and income/expense accounts are normally excluded.

## Workflow

1. The page lists all reconcilable accounts grouped into **pending** (not yet reconciled today) and **done** (already reconciled today, tracked via `reconciliation_log`).
2. User selects a pending account and enters the real balance from their statement (in the account's currency).
2. System computes: `diff = real_balance − book_balance` (cents).
3. System computes: `diff = real_balance − book_balance` (cents).
4. If `diff == 0`, user clicks **Mark as Reconciled** — a log entry is written with no transaction.
5. If `diff != 0`, a transaction builder opens with:
   - **Fixed entry** (read-only): the reconciled account for `|diff|` on the correct side.
   - **User entries** (optional): any known missing transactions — account + amount each.
   - **Auto entry** (read-only): the appropriate Reconciliation Account for the remaining gap.
6. User confirms → a standard double-entry transaction is saved and a `reconciliation_log` row is written.

## Fixed Entry Direction

The direction of the fixed entry is derived from `diff` and the account's normal balance side:

| Account kind | `diff > 0` (real > book) | `diff < 0` (real < book) |
|---|---|---|
| debit account (bank, cash, shares) | debit the account | credit the account |
| credit account (loan, liability) | credit the account | debit the account |

## Running Gap

As the user adds entries, the system continuously recalculates the Reconciliation Account amount:

```
reconciliation_amount = diff − Σ(signed user-entry amounts)
```

Each user entry has a sign: debits are positive for debit accounts, negative for credit accounts (same convention as the balance calculation). The Reconciliation Account entry always equals whatever is left to zero out the transaction.

## The Reconciliation Accounts

Two equity (credit-normal) accounts absorb unresolved discrepancies, kept separate so equal-and-opposite adjustments across different reconciliations don't cancel each other out:

| Account | Category | Used when |
|---|---|---|
| **Reconciliation Surplus** | `equity/reconciliation-surplus` | `diff > 0` — real balance exceeds book (unexplained gain) |
| **Reconciliation Deficit** | `equity/reconciliation-deficit` | `diff < 0` — real balance is below book (unexplained loss) |

- Both are auto-created on first use; no user configuration required.
- A debit balance on the deficit account (or credit on the surplus account) is expected and normal.
- Users can inspect either account in the Accounts list or on the Balance Sheet to understand accumulated unresolved discrepancies.

## Book Balance Calculation

`book_balance` is computed as:

```
book_balance = last_snapshot_balance + Σ(entries since snapshot date)
```

If no snapshot exists for the account, all entries are summed from scratch. It is shown alongside the real-balance input so the user can see both at a glance.

## Share Accounts

Reconciliation applies to the **monetary value** of the account (balance in account currency). Quantity reconciliation (number of shares) is out of scope.

## Routes

| URL | File | Purpose |
|---|---|---|
| `/reconcile` | `_app.reconcile._index.tsx` | List of reconcilable accounts with pending/done status |
| `/reconcile/:id` | `_app.reconcile.$id.tsx` | Book balance display, real-balance input, transaction builder for the selected account |

## Sidebar Placement

Reconciliation and Snapshots share a new **Month End** sidebar group, replacing the Settings > Snapshots entry:

```
Month End
  Reconcile      /reconcile
  Snapshots      /snapshots   (moved from /settings/snapshots)
```
