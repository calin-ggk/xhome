# Database Seeding

## Production init

Edit `CURRENCIES` and `ACCOUNTS` in `seed/init.ts`, then run once on a fresh database:

```bash
npm run seed:init
```

## Demo data

Populates 3 months of transactions (salary, expenses, share purchases) with relative dates:

```bash
npm run seed:demo
```

Both scripts prompt for confirmation when run against the production database (`.env`).
