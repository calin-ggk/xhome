# Reconciliation Module

## Purpose

Reconciliation closes the gap between the **book balance** (sum of recorded entries) and the **real balance** (from a bank statement or broker platform). It produces a single, balanced adjustment transaction.

## Workflow

1. User selects an account and enters the real balance from their statement (in the account's currency).
2. System computes: `diff = real_balance − book_balance` (cents).
3. If `diff == 0`, nothing to do.
4. If `diff != 0`, a transaction builder opens with:
   - **Fixed entry** (read-only): the reconciled account for `|diff|` on the correct side.
   - **User entries** (optional): any known missing transactions — account + amount each.
   - **Auto entry** (read-only): the appropriate Reconciliation Account for the remaining gap.
5. User confirms → a standard double-entry transaction is saved.

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
| `/reconcile` | `_app.reconcile.tsx` | Account picker, book balance display, real-balance input, transaction builder |

The account is selected via a dropdown on the page itself (no sub-route per account).

## Sidebar Placement

Reconciliation and Snapshots share a new **Month End** sidebar group, replacing the Settings > Snapshots entry:

```
Month End
  Reconcile      /reconcile
  Snapshots      /snapshots   (moved from /settings/snapshots)
```
