# Reports Module

## Routes

| URL | File | Purpose |
|---|---|---|
| `/reports/balance-sheet` | `_app.reports.balance-sheet.tsx` | Assets vs Liabilities at a selected month-end |
| `/reports/income` | `_app.reports.income.tsx` | Income vs Expenses for a preset range |
| `/reports/net-worth` | `_app.reports.net-worth.tsx` | Net worth history chart from snapshots |
| `/reports/securities` | `_app.reports.securities.tsx` | Per-security value history and % return from snapshots |

## Snapshot Convention

Snapshots are stored with `date = YYYY-MM-01` where that date is the **first of the following month**. A snapshot for April 2024 has `date = '2024-05-01'`. This allows efficient range queries (`date < snapshotDate`) without replaying entries.

- **Closed months** (snapshot exists): served directly from `account_monthly_snapshots`.
- **Current month** (no snapshot): computed live from `transaction_entries`.

The helper `snapshotDateToDisplayMonth('2024-05-01')` returns `{ month: '2024-04', display: 'Apr 2024' }`.

## Balance Sheet (`/reports/balance-sheet`)

- Filter: `MonthPicker` (year + month).
- Sections: Assets, Liabilities, Equity — each backed by `ReportSection { accounts[], total }`.
- Asset balances are positive; liability/equity balances are stored negative and flipped for display.
- Net Worth = `assets.total − liabilities.total`.
- A "snapshot" badge appears when data comes from a pre-computed snapshot.

## Income Statement (`/reports/income`)

- Filter: `RangePicker` (preset range, defaults to `defaultReportRange` preference).
- Sections: Income (credit net), Expenses (debit net). Always live from `transaction_entries`.
- Two views toggled by the user: table and pie chart with drill-down.

## Net Worth History (`/reports/net-worth`)

- Filter: `RangePicker`.
- Two charts: absolute value per currency (line) + % change from period start (line).
- Data: `SUM(balanceBase)` over `asset/*` and `liability/*` snapshots, pivoted by currency.

## Securities History (`/reports/securities`)

- Filter: `RangePicker`.
- Two charts: absolute market value per security (line) + % return from each security's first visible snapshot (line).
- Securities that have no snapshot in the selected range are omitted from the % chart.
- Checkbox list lets the user toggle individual securities on/off (client-side).
- Data pivoted in service: `{ date, display, [accountId]: balanceBase }[]` and `{ date, display, [accountId]: pct }[]`.

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
| `getNetWorthByCurrencyData(db, fromMonth, toMonth)` | `NetWorthByCurrencyData` |
| `getSecuritiesHistoryData(db, fromMonth, toMonth)` | `SecuritiesHistoryData` |
