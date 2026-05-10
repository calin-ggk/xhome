// Production initialisation — edit the two constants below, then run once on
// a fresh database: npm run seed:init
import { createInterface } from 'node:readline/promises';
import { db } from '~/db/client';
import * as currencySvc from '~/services/currency.service';
import * as securitySvc from '~/services/security.service';
import * as accountSvc from '~/services/account.service';
import * as txSvc from '~/services/transaction.service';
import * as currencyRepo from '~/repositories/currency.repository';
import * as securityRepo from '~/repositories/security.repository';
import * as accountRepo from '~/repositories/account.repository';

// ── Customise these two constants ────────────────────────────────────────────

const CURRENCIES = [
  { code: 'EUR', name: 'Euro',           symbol: '€',   decimalPlaces: 2 },
  { code: 'RON', name: 'Romanian Leu',   symbol: 'lei', decimalPlaces: 2 },
  { code: 'USD', name: 'US Dollar',      symbol: '$',   decimalPlaces: 2 },
];

type AccountDef = {
  category: string;
  name: string;
  type: 'debit' | 'credit';
  accountType: 'simple' | 'security';
  currency: string;
  isReconcilable?: 1 | 0;
  security?: { ticker: string; name: string; type: 'stock' | 'etf' | 'crypto'; quantityScale: number };
  opening?: { amount: string; rate: string; quantity?: string };
};

const ACCOUNTS: AccountDef[] = [
  // ── Assets ──
  { category: 'asset/bank/current-ron',   name: 'Current RON',   type: 'debit', accountType: 'simple',   currency: 'RON', isReconcilable: 1, opening: { amount: '0.00', rate: '0.2009' } },
  { category: 'asset/bank/current-usd',   name: 'Current USD',   type: 'debit', accountType: 'simple',   currency: 'USD', isReconcilable: 1, opening: { amount: '0.00', rate: '0.9250' } },
  { category: 'asset/savings/savings-ron', name: 'Savings RON',  type: 'debit', accountType: 'simple',   currency: 'RON', isReconcilable: 1, opening: { amount: '0.00', rate: '0.2009' } },
  { category: 'asset/securities/aapl',    name: 'AAPL',          type: 'debit', accountType: 'security', currency: 'USD',
    security: { ticker: 'AAPL', name: 'Apple Inc.',             type: 'stock', quantityScale: 6 },
    opening: { amount: '0.00', rate: '0.9250', quantity: '0' } },
  { category: 'asset/securities/amd',     name: 'AMD',           type: 'debit', accountType: 'security', currency: 'USD',
    security: { ticker: 'AMD',  name: 'Advanced Micro Devices', type: 'stock', quantityScale: 6 },
    opening: { amount: '0.00', rate: '0.9250', quantity: '0' } },
  // ── Income ──
  { category: 'income/salary',     name: 'Salary',          type: 'credit', accountType: 'simple', currency: 'RON' },
  { category: 'income/dividends',  name: 'Dividends',       type: 'credit', accountType: 'simple', currency: 'USD' },
  // ── Expenses ──
  { category: 'expense/rent',      name: 'Rent',            type: 'debit',  accountType: 'simple', currency: 'RON' },
  { category: 'expense/food',      name: 'Food & Groceries',type: 'debit',  accountType: 'simple', currency: 'RON' },
  { category: 'expense/transport', name: 'Transport',       type: 'debit',  accountType: 'simple', currency: 'RON' },
  { category: 'expense/utilities', name: 'Utilities',       type: 'debit',  accountType: 'simple', currency: 'RON' },
];

// ─────────────────────────────────────────────────────────────────────────────

function today1st(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

function ok<T>(r: { ok: true; data: T } | { ok: false; error: string }, label: string): T {
  if (!r.ok) throw new Error(`${label}: ${r.error}`);
  return r.data;
}

async function init() {
  const envFile = process.argv[2];
  if (envFile === '.env') {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(`Seeding production database (${process.env.DATABASE_URL}). Continue? [y/N] `);
    rl.close();
    if (answer.trim().toLowerCase() !== 'y') { console.log('Aborted.'); return; }
  }

  // ── Currencies ────────────────────────────────────────────────────────────
  for (const c of CURRENCIES) {
    if (!currencyRepo.getCurrencyByCode(db, c.code)) currencySvc.createCurrency(db, c);
  }
  const getCurrency = (code: string) => {
    const c = currencyRepo.getCurrencyByCode(db, code);
    if (!c) throw new Error(`Currency not found: ${code}`);
    return c;
  };

  // ── Securities ────────────────────────────────────────────────────────────
  const tickers = new Set(securityRepo.getAllSecurities(db).map(s => s.ticker));
  for (const def of ACCOUNTS) {
    if (def.security && !tickers.has(def.security.ticker)) {
      securitySvc.createSecurity(db, { ...def.security, currencyId: getCurrency(def.currency).id });
    }
  }
  const getSecurityId = (ticker: string) => {
    const s = securityRepo.getAllSecurities(db).find(x => x.ticker === ticker);
    if (!s) throw new Error(`Security not found: ${ticker}`);
    return s.id;
  };

  // ── Accounts ──────────────────────────────────────────────────────────────
  const existingCats = new Set(accountRepo.getAllAccounts(db).map(a => a.category));

  // Auto-create one equity/opening account per currency that has an opening balance
  const openingCurrencies = new Set(
    ACCOUNTS.filter(a => a.opening && parseFloat(a.opening.amount) > 0).map(a => a.currency),
  );
  for (const code of openingCurrencies) {
    const cat = `equity/opening/${code.toLowerCase()}`;
    if (!existingCats.has(cat)) {
      ok(accountSvc.createAccount(db, {
        name: `Opening Balance ${code}`, type: 'credit', accountType: 'simple',
        currencyId: getCurrency(code).id, category: cat,
        isActive: 1, isReconcilable: 0, securityId: null,
      }), cat);
    }
  }

  for (const def of ACCOUNTS) {
    if (existingCats.has(def.category)) continue;
    ok(accountSvc.createAccount(db, {
      name:           def.name,
      type:           def.type,
      accountType:    def.accountType,
      currencyId:     getCurrency(def.currency).id,
      category:       def.category,
      isActive:        1,
      isReconcilable:  def.isReconcilable ?? 0,
      securityId:      def.security ? getSecurityId(def.security.ticker) : null,
    }), def.category);
  }

  // ── Account refs — read from DB ───────────────────────────────────────────
  const all = accountRepo.getAllAccounts(db);
  const getAccount = (cat: string) => {
    const a = all.find(x => x.category === cat);
    if (!a) throw new Error(`Missing account: ${cat}`);
    return a;
  };

  // ── Guard ─────────────────────────────────────────────────────────────────
  const firstAsset = ACCOUNTS.find(a => a.opening);
  if (firstAsset && accountRepo.hasTransactionEntries(db, getAccount(firstAsset.category).id)) {
    console.log('Opening balances already exist — skipping.');
    return;
  }

  // ── Opening balances on the 1st of the current month ─────────────────────
  const date = today1st();
  for (const def of ACCOUNTS) {
    if (!def.opening || parseFloat(def.opening.amount) === 0) continue;
    const openingCat = `equity/opening/${def.currency.toLowerCase()}`;
    ok(txSvc.createTransaction(db, {
      date,
      description: `Opening balance — ${def.name}`,
      tagIds: [],
      entries: [
        { accountId: getAccount(def.category).id, side: 'debit',  amountStr: def.opening.amount, rateStr: def.opening.rate, quantityStr: def.opening.quantity ?? null, interestRatePct: null, maturityDate: null, memo: '' },
        { accountId: getAccount(openingCat).id,   side: 'credit', amountStr: def.opening.amount, rateStr: def.opening.rate, quantityStr: null, interestRatePct: null, maturityDate: null, memo: '' },
      ],
    }), def.name);
  }

  console.log('Init complete.');
}

init().catch(e => { console.error(e); process.exit(1); });
