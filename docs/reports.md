# Reports Module

## Routes

| URL | File | Purpose |
|---|---|---|
| `/reports/balance-sheet` | `_app.reports.balance-sheet.tsx` | Assets vs Liabilities at a selected month-end |
| `/reports/income` | `_app.reports.income.tsx` | Income vs Expenses for a date range |
| `/reports/net-worth` | `_app.reports.net-worth.tsx` | Net worth history chart from snapshots |
| `/reports/spending` | `_app.reports.spending.tsx` | Hierarchical expense tree for a date range |
| `/reports/securities` | `_app.reports.securities.tsx` | Per-security value history from snapshots |

## Snapshot Convention

Snapshots are stored with `date = YYYY-MM-01` where that date is the **first of the following month**. A snapshot for April 2024 has `date = '2024-05-01'`. This allows efficient range queries (`date < snapshotDate`) without replaying entries.

- **Closed months** (snapshot exists): served directly from `account_monthly_snapshots`.
- **Current month** (no snapshot): computed live from `transaction_entries`.

The helper `snapshotDateToDisplayMonth('2024-05-01')` returns `{ month: '2024-04', display: 'Apr 2024' }`.

## Balance Sheet (`/reports/balance-sheet`)

- Filter: year + month dropdowns.
- Sections: Assets, Liabilities, Equity — each backed by `ReportSection { accounts[], total }`.
- Asset balances are positive; liability/equity balances are stored negative and flipped for display.
- Net Worth = `assets.total − liabilities.total`.
- A "snapshot" badge appears when data comes from a pre-computed snapshot.

## Income Statement (`/reports/income`)

- Filter: `from` / `to` date inputs (default: year-to-date).
- Sections: Income (credit net), Expenses (debit net).
- Always live — reads directly from `transaction_entries`.

## Net Worth History (`/reports/net-worth`)

- No filter — shows all available snapshot months.
- Line chart (Recharts) + data table, newest-first.
- Data: `SUM(balanceBase)` over `asset/*` and `liability/*` snapshots per date.

## Spending Tree (`/reports/spending`)

- Filter: `from` / `to` date inputs (default: current month).
- Hierarchical tree built from `expense/*` account categories; top-level nodes expanded by default.
- Amounts accumulate bottom-up: a parent node's total equals the sum of its children.
- Clicking a node with children toggles expansion (client-side state).

## Securities History (`/reports/securities`)

- No filter — shows full snapshot history.
- Multi-line chart; each line = one security account.
- Checkbox list lets the user toggle individual securities on/off (client-side).
- Data pivoted in service: `{ date, display, [accountId]: balanceBase }[]`.

## Layering

```
route loader/action
  └── reports.service.ts   (business logic, tree building, date conversion)
        └── reports.repository.ts  (all DB queries)
```

Key service functions:

| Function | Returns |
|---|---|
| `getBalanceSheet(db, month, today)` | `BalanceSheetData` |
| `getIncomeStatement(db, start, end)` | `IncomeStatementData` |
| `getNetWorthHistoryData(db)` | `NetWorthHistoryPoint[]` |
| `getSpendingTreeData(db, start, end)` | `SpendingTreeData` |
| `getSecuritiesHistoryData(db)` | `SecuritiesHistoryData` |
