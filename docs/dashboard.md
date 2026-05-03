# Dashboard

## What It Shows

| Card | Source |
|------|--------|
| Net Worth | Sum of all asset/deposit/security accounts (base currency) |
| Income (this month) | Credit entries on `income/%` accounts from month start |
| Expenses (this month) | Debit entries on `expense/%` accounts from month start |
| Net (this month) | Income − Expenses |
| Recent Transactions (10) | Latest transactions, summing debit entries per transaction |
| Cash Flow chart | 6-month bar chart (income vs expenses per month) |

## Data Flow

```
loader → getDashboardData(db)
           ├── getNetWorthBase(db)
           ├── getCurrentMonthSummary(db, startDate)   // startDate = YYYY-MM-01
           ├── getRecentTransactions(db, 10)
           └── getMonthlyCashFlow(db, startDate)       // startDate = 5 months back
```

`monthStartDate(monthsBack)` lives in the service layer — repositories accept a plain `startDate: string` so they stay testable without clock mocking.

## Page Layout Pattern

All app pages use:
```tsx
<section className="section pt-0">
  <div className="container is-fluid">
    ...
  </div>
</section>
```

This is the established baseline. `.app-main` provides `padding: 1rem 0`; `pt-0` removes the extra top padding from Bulma's `.section`.
