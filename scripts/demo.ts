import { db } from '~/db/client';
import * as currencySvc from '~/services/currency.service';
import * as securitySvc from '~/services/security.service';
import * as accountSvc from '~/services/account.service';
import * as txSvc from '~/services/transaction.service';
import * as currencyRepo from '~/repositories/currency.repository';
import * as securityRepo from '~/repositories/security.repository';
import * as accountRepo from '~/repositories/account.repository';

function date(monthsBack: number, day: number): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - monthsBack, day)
    .toISOString().slice(0, 10);
}

function ok<T>(r: { ok: true; data: T } | { ok: false; error: string }, label: string): T {
  if (!r.ok) throw new Error(`${label}: ${r.error}`);
  return r.data;
}

type Entry = {
  accountId: number;
  side: 'debit' | 'credit';
  amountStr: string;
  rateStr: string;
  quantityStr?: string | null;
};

async function seed() {
  // ── 1. Currencies ─────────────────────────────────────────────────────────
  for (const c of [
    { code: 'EUR', name: 'Euro',           symbol: '€',   decimalPlaces: 2 },
    { code: 'RON', name: 'Romanian Leu',   symbol: 'lei', decimalPlaces: 2 },
    { code: 'USD', name: 'US Dollar',      symbol: '$',   decimalPlaces: 2 },
  ]) {
    if (!currencyRepo.getCurrencyByCode(db, c.code)) currencySvc.createCurrency(db, c);
  }
  const ron = currencyRepo.getCurrencyByCode(db, 'RON')!;
  const usd = currencyRepo.getCurrencyByCode(db, 'USD')!;

  // ── 2. Securities ─────────────────────────────────────────────────────────
  const tickers = new Set(securityRepo.getAllSecurities(db).map(s => s.ticker));
  for (const s of [
    { ticker: 'AAPL', name: 'Apple Inc.',             currencyId: usd.id, type: 'stock' as const, quantityScale: 6 },
    { ticker: 'AMD',  name: 'Advanced Micro Devices', currencyId: usd.id, type: 'stock' as const, quantityScale: 6 },
  ]) {
    if (!tickers.has(s.ticker)) securitySvc.createSecurity(db, s);
  }
  const securities = securityRepo.getAllSecurities(db);
  const aapl = securities.find(s => s.ticker === 'AAPL')!;
  const amd  = securities.find(s => s.ticker === 'AMD')!;

  // ── 3. Accounts ───────────────────────────────────────────────────────────
  const existingCats = new Set(accountRepo.getAllAccounts(db).map(a => a.category));
  if (existingCats.size > 0) {
    console.log('Demo data already exists — skipping. Drop the DB and re-run to re-seed.');
    return;
  }
  const defs = [
    { name: 'Current RON',          type: 'debit'  as const, accountType: 'simple'   as const, currencyId: ron.id, category: 'asset/bank/current-ron',    isReconcilable: 1 },
    { name: 'Current USD',          type: 'debit'  as const, accountType: 'simple'   as const, currencyId: usd.id, category: 'asset/bank/current-usd',    isReconcilable: 1 },
    { name: 'Savings RON',          type: 'debit'  as const, accountType: 'simple'   as const, currencyId: ron.id, category: 'asset/savings/savings-ron',  isReconcilable: 1 },
    { name: 'AAPL',                 type: 'debit'  as const, accountType: 'security' as const, currencyId: usd.id, category: 'asset/securities/aapl',      securityId: aapl.id },
    { name: 'AMD',                  type: 'debit'  as const, accountType: 'security' as const, currencyId: usd.id, category: 'asset/securities/amd',       securityId: amd.id  },
    { name: 'Salary',               type: 'credit' as const, accountType: 'simple'   as const, currencyId: ron.id, category: 'income/salary' },
    { name: 'Dividends',            type: 'credit' as const, accountType: 'simple'   as const, currencyId: usd.id, category: 'income/dividends' },
    { name: 'Rent',                 type: 'debit'  as const, accountType: 'simple'   as const, currencyId: ron.id, category: 'expense/rent' },
    { name: 'Food & Groceries',     type: 'debit'  as const, accountType: 'simple'   as const, currencyId: ron.id, category: 'expense/food' },
    { name: 'Transport',            type: 'debit'  as const, accountType: 'simple'   as const, currencyId: ron.id, category: 'expense/transport' },
    { name: 'Utilities',            type: 'debit'  as const, accountType: 'simple'   as const, currencyId: ron.id, category: 'expense/utilities' },
    { name: 'Opening Balance RON',  type: 'credit' as const, accountType: 'simple'   as const, currencyId: ron.id, category: 'equity/opening/ron' },
    { name: 'Opening Balance USD',  type: 'credit' as const, accountType: 'simple'   as const, currencyId: usd.id, category: 'equity/opening/usd' },
  ];
  for (const def of defs) {
    if (!existingCats.has(def.category)) {
      ok(accountSvc.createAccount(db, { isActive: 1, isReconcilable: 0, securityId: null, ...def }), def.category);
    }
  }

  // ── 4. Account refs — read from DB, never assume IDs ──────────────────────
  const all = accountRepo.getAllAccounts(db);
  const g = (cat: string) => {
    const a = all.find(x => x.category === cat);
    if (!a) throw new Error(`Missing account: ${cat}`);
    return a;
  };
  const acct = {
    currentRon: g('asset/bank/current-ron'),
    currentUsd: g('asset/bank/current-usd'),
    savingsRon: g('asset/savings/savings-ron'),
    aapl:       g('asset/securities/aapl'),
    amd:        g('asset/securities/amd'),
    salary:     g('income/salary'),
    dividends:  g('income/dividends'),
    rent:       g('expense/rent'),
    food:       g('expense/food'),
    transport:  g('expense/transport'),
    utilities:  g('expense/utilities'),
    openingRon: g('equity/opening/ron'),
    openingUsd: g('equity/opening/usd'),
  };

  // ── 5. Transactions ───────────────────────────────────────────────────────
  // Rates: EUR per foreign currency unit (approximate 2025/2026 values)
  // RON ~0.201 EUR/RON  |  USD ~0.925 EUR/USD
  const R = [
    { ron: '0.2009', usd: '0.9250' }, // month -3
    { ron: '0.2015', usd: '0.9180' }, // month -2
    { ron: '0.2005', usd: '0.9310' }, // month -1
    { ron: '0.2012', usd: '0.9270' }, // current month
  ] as const;

  function tx(monthsBack: number, day: number, description: string, entries: Entry[]) {
    ok(txSvc.createTransaction(db, {
      date: date(monthsBack, day),
      description,
      tagIds: [],
      entries: entries.map(e => ({
        accountId:       e.accountId,
        side:            e.side,
        amountStr:       e.amountStr,
        rateStr:         e.rateStr,
        quantityStr:     e.quantityStr ?? null,
        interestRatePct: null,
        maturityDate:    null,
        memo:            '',
      })),
    }), description);
  }

  // ── Month −3: opening balances + first activity ───────────────────────────
  tx(3, 1, 'Opening balance — current RON', [
    { accountId: acct.currentRon.id, side: 'debit',  amountStr: '15000.00', rateStr: R[0].ron },
    { accountId: acct.openingRon.id, side: 'credit', amountStr: '15000.00', rateStr: R[0].ron },
  ]);
  tx(3, 1, 'Opening balance — savings RON', [
    { accountId: acct.savingsRon.id, side: 'debit',  amountStr: '25000.00', rateStr: R[0].ron },
    { accountId: acct.openingRon.id, side: 'credit', amountStr: '25000.00', rateStr: R[0].ron },
  ]);
  tx(3, 1, 'Opening balance — current USD', [
    { accountId: acct.currentUsd.id, side: 'debit',  amountStr: '2000.00', rateStr: R[0].usd },
    { accountId: acct.openingUsd.id, side: 'credit', amountStr: '2000.00', rateStr: R[0].usd },
  ]);
  tx(3, 5, 'Rent', [
    { accountId: acct.rent.id,       side: 'debit',  amountStr: '3000.00', rateStr: R[0].ron },
    { accountId: acct.currentRon.id, side: 'credit', amountStr: '3000.00', rateStr: R[0].ron },
  ]);
  tx(3, 10, 'Salary', [
    { accountId: acct.currentRon.id, side: 'debit',  amountStr: '8500.00', rateStr: R[0].ron },
    { accountId: acct.salary.id,     side: 'credit', amountStr: '8500.00', rateStr: R[0].ron },
  ]);
  tx(3, 12, 'Groceries', [
    { accountId: acct.food.id,       side: 'debit',  amountStr: '1200.00', rateStr: R[0].ron },
    { accountId: acct.currentRon.id, side: 'credit', amountStr: '1200.00', rateStr: R[0].ron },
  ]);
  tx(3, 14, 'Transport monthly pass', [
    { accountId: acct.transport.id,  side: 'debit',  amountStr: '250.00',  rateStr: R[0].ron },
    { accountId: acct.currentRon.id, side: 'credit', amountStr: '250.00',  rateStr: R[0].ron },
  ]);
  tx(3, 18, 'Buy AAPL — 5 shares @ $185', [
    { accountId: acct.aapl.id,       side: 'debit',  amountStr: '925.00', rateStr: R[0].usd, quantityStr: '5' },
    { accountId: acct.currentUsd.id, side: 'credit', amountStr: '925.00', rateStr: R[0].usd },
  ]);
  tx(3, 20, 'Utilities — electricity & gas', [
    { accountId: acct.utilities.id,  side: 'debit',  amountStr: '420.00',  rateStr: R[0].ron },
    { accountId: acct.currentRon.id, side: 'credit', amountStr: '420.00',  rateStr: R[0].ron },
  ]);

  // ── Month −2 ──────────────────────────────────────────────────────────────
  tx(2, 5, 'Rent', [
    { accountId: acct.rent.id,       side: 'debit',  amountStr: '3000.00', rateStr: R[1].ron },
    { accountId: acct.currentRon.id, side: 'credit', amountStr: '3000.00', rateStr: R[1].ron },
  ]);
  tx(2, 10, 'Salary', [
    { accountId: acct.currentRon.id, side: 'debit',  amountStr: '8500.00', rateStr: R[1].ron },
    { accountId: acct.salary.id,     side: 'credit', amountStr: '8500.00', rateStr: R[1].ron },
  ]);
  tx(2, 13, 'Groceries', [
    { accountId: acct.food.id,       side: 'debit',  amountStr: '1350.00', rateStr: R[1].ron },
    { accountId: acct.currentRon.id, side: 'credit', amountStr: '1350.00', rateStr: R[1].ron },
  ]);
  tx(2, 14, 'Transport monthly pass', [
    { accountId: acct.transport.id,  side: 'debit',  amountStr: '250.00',  rateStr: R[1].ron },
    { accountId: acct.currentRon.id, side: 'credit', amountStr: '250.00',  rateStr: R[1].ron },
  ]);
  tx(2, 17, 'Buy AMD — 3 shares @ $125', [
    { accountId: acct.amd.id,        side: 'debit',  amountStr: '375.00', rateStr: R[1].usd, quantityStr: '3' },
    { accountId: acct.currentUsd.id, side: 'credit', amountStr: '375.00', rateStr: R[1].usd },
  ]);
  tx(2, 21, 'Utilities — electricity & gas', [
    { accountId: acct.utilities.id,  side: 'debit',  amountStr: '380.00',  rateStr: R[1].ron },
    { accountId: acct.currentRon.id, side: 'credit', amountStr: '380.00',  rateStr: R[1].ron },
  ]);
  tx(2, 22, 'Transfer to savings', [
    { accountId: acct.savingsRon.id, side: 'debit',  amountStr: '2000.00', rateStr: R[1].ron },
    { accountId: acct.currentRon.id, side: 'credit', amountStr: '2000.00', rateStr: R[1].ron },
  ]);

  // ── Month −1 ──────────────────────────────────────────────────────────────
  tx(1, 5, 'Rent', [
    { accountId: acct.rent.id,       side: 'debit',  amountStr: '3000.00', rateStr: R[2].ron },
    { accountId: acct.currentRon.id, side: 'credit', amountStr: '3000.00', rateStr: R[2].ron },
  ]);
  tx(1, 10, 'Salary', [
    { accountId: acct.currentRon.id, side: 'debit',  amountStr: '8500.00', rateStr: R[2].ron },
    { accountId: acct.salary.id,     side: 'credit', amountStr: '8500.00', rateStr: R[2].ron },
  ]);
  tx(1, 11, 'Groceries', [
    { accountId: acct.food.id,       side: 'debit',  amountStr: '1280.00', rateStr: R[2].ron },
    { accountId: acct.currentRon.id, side: 'credit', amountStr: '1280.00', rateStr: R[2].ron },
  ]);
  tx(1, 14, 'Transport monthly pass', [
    { accountId: acct.transport.id,  side: 'debit',  amountStr: '250.00',  rateStr: R[2].ron },
    { accountId: acct.currentRon.id, side: 'credit', amountStr: '250.00',  rateStr: R[2].ron },
  ]);
  tx(1, 20, 'Buy AAPL — 2 shares @ $190', [
    { accountId: acct.aapl.id,       side: 'debit',  amountStr: '380.00', rateStr: R[2].usd, quantityStr: '2' },
    { accountId: acct.currentUsd.id, side: 'credit', amountStr: '380.00', rateStr: R[2].usd },
  ]);
  tx(1, 22, 'Utilities — electricity & gas', [
    { accountId: acct.utilities.id,  side: 'debit',  amountStr: '350.00',  rateStr: R[2].ron },
    { accountId: acct.currentRon.id, side: 'credit', amountStr: '350.00',  rateStr: R[2].ron },
  ]);
  tx(1, 25, 'Transfer to savings', [
    { accountId: acct.savingsRon.id, side: 'debit',  amountStr: '1500.00', rateStr: R[2].ron },
    { accountId: acct.currentRon.id, side: 'credit', amountStr: '1500.00', rateStr: R[2].ron },
  ]);
  tx(1, 28, 'AAPL quarterly dividend', [
    { accountId: acct.currentUsd.id, side: 'debit',  amountStr: '35.00', rateStr: R[2].usd },
    { accountId: acct.dividends.id,  side: 'credit', amountStr: '35.00', rateStr: R[2].usd },
  ]);

  // ── Current month (partial) ───────────────────────────────────────────────
  tx(0, 5, 'Rent', [
    { accountId: acct.rent.id,       side: 'debit',  amountStr: '3000.00', rateStr: R[3].ron },
    { accountId: acct.currentRon.id, side: 'credit', amountStr: '3000.00', rateStr: R[3].ron },
  ]);
  tx(0, 8, 'Groceries', [
    { accountId: acct.food.id,       side: 'debit',  amountStr: '680.00',  rateStr: R[3].ron },
    { accountId: acct.currentRon.id, side: 'credit', amountStr: '680.00',  rateStr: R[3].ron },
  ]);
  tx(0, 10, 'Salary', [
    { accountId: acct.currentRon.id, side: 'debit',  amountStr: '8500.00', rateStr: R[3].ron },
    { accountId: acct.salary.id,     side: 'credit', amountStr: '8500.00', rateStr: R[3].ron },
  ]);

  console.log('Demo seed complete.');
}

seed().catch(e => { console.error(e); process.exit(1); });
