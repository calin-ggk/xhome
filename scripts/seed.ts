/**
 * Seed script — 6 most recently completed months of realistic data.
 *   Currencies : RON (base), USD, EUR
 *   Securities : AAPL (partial sell in month 5), MSFT (fully closed in month 4), VWCE ETF (accumulate)
 *   Accounts   : bank RON/USD/EUR, deposit, 3 security accounts, income, expense, equity
 *
 * Dates are always relative to today — re-running produces current data.
 *
 * Usage — pass any env file that contains DATABASE_URL:
 *   node --experimental-strip-types --env-file=.env       scripts/seed.ts
 *   node --experimental-strip-types --env-file=.env.test  scripts/seed.ts
 */
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../app/db/schema.ts';

const {
  currencies, exchangeRates, securities,
  accounts, transactions, transactionEntries,
  tags, transactionTagMap, accountMonthlySnapshots,
} = schema;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('DATABASE_URL not set'); process.exit(1); }

const db = drizzle({ connection: { source: DATABASE_URL }, schema });

// ── Date helpers ──────────────────────────────────────────────────────────────
// months[0..5]: the 6 most recently completed months (oldest → newest).
// e.g. if today is 2026-05-06: months = [2025-11, 2025-12, 2026-01, ..., 2026-04]

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

const now      = new Date();
const lastMonth = shiftMonth(now.getFullYear(), now.getMonth() + 1, -1); // most recent complete month
const months   = Array.from({ length: 6 }, (_, i) =>
  shiftMonth(lastMonth.year, lastMonth.month, i - 5),
);

// 'YYYY-MM' for month at index i
function ym(i: number): string {
  const { year, month } = months[i]!;
  return `${year}-${String(month).padStart(2, '0')}`;
}

// 'YYYY-MM-DD' for a specific day within month i
function d(i: number, day: number): string {
  return `${ym(i)}-${String(day).padStart(2, '0')}`;
}

// Last calendar day of month i
function lastDay(i: number): number {
  const { year, month } = months[i]!;
  return new Date(year, month, 0).getDate();
}

// 'YYYY-MM-DD' that is `extraMonths` months after day `day` of month i
function laterDate(i: number, day: number, extraMonths: number): string {
  const { year, month } = months[i]!;
  const { year: y2, month: m2 } = shiftMonth(year, month, extraMonths);
  return `${y2}-${String(m2).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

console.log(`Seeding months: ${ym(0)} → ${ym(5)}`);

// ── Money helpers ─────────────────────────────────────────────────────────────

// rateScale=4: toBase(usdCents, 45000) = RON cents (1 USD = 4.5000 RON)
function toBase(amountCents: number, rate: number): number {
  return Math.round((amountCents * rate) / 10_000);
}

// ── Balance tracker ───────────────────────────────────────────────────────────
// Accumulates running net balance per account so snapshots can be computed
// automatically without manual arithmetic.
//   debit accounts:  balance += amount on debit entries, -= on credit entries
//   credit accounts: balance += amount on credit entries, -= on debit entries

type Side     = 'debit' | 'credit';
type AcctType = 'debit' | 'credit';

const acctType  = new Map<number, AcctType>();
const runBal    = new Map<number, { balance: number; balanceBase: number }>();

function track(id: number, side: Side, amount: number, amountBase: number) {
  const sign = acctType.get(id) === side ? 1 : -1;
  const b = runBal.get(id) ?? { balance: 0, balanceBase: 0 };
  b.balance    += sign * amount;
  b.balanceBase += sign * amountBase;
  runBal.set(id, b);
}

// ── Transaction helper ────────────────────────────────────────────────────────

interface Entry {
  accountId:    number;
  side:         Side;
  amount:       number;   // native-currency cents
  amountBase:   number;   // RON cents
  quantity?:    number;   // security accounts (scaled by quantityScale)
  interestRate?: number;  // deposit accounts (bps × 100, e.g. 500 = 5.00%)
  maturityDate?: string;
  memo?:        string;
}

async function tx(date: string, desc: string, entries: Entry[], tagIds: number[] = []) {
  const sum = (side: Side) =>
    entries.filter(e => e.side === side).reduce((s, e) => s + e.amountBase, 0);
  const db_ = sum('debit'), cb_ = sum('credit');
  if (db_ !== cb_) throw new Error(`Unbalanced "${desc}": debit=${db_} credit=${cb_}`);

  const [t] = await db.insert(transactions).values({ date, description: desc }).returning();
  if (!t) throw new Error(`insert failed: ${desc}`);

  for (const e of entries) {
    await db.insert(transactionEntries).values({ transactionId: t.id, ...e });
    track(e.accountId, e.side, e.amount, e.amountBase);
  }
  for (const tid of tagIds) {
    await db.insert(transactionTagMap).values({ transactionId: t.id, tagId: tid });
  }
  console.log(`  [${date}] ${desc.padEnd(45)} ${(db_ / 100).toFixed(2)} RON`);
}

// Snapshot for a given month: date stored = first of the FOLLOWING month.
// e.g. month='2025-11' → date stored='2025-12-01' → displays as 'Nov 2025' in charts.
async function snap(month: string) {
  const [y, m] = month.split('-').map(Number);
  const nm = m === 12 ? 1 : m! + 1;
  const ny = m === 12 ? y! + 1 : y!;
  const date = `${ny}-${String(nm).padStart(2, '0')}-01`;
  let n = 0;
  for (const [accountId, bal] of runBal) {
    if (bal.balance !== 0 || bal.balanceBase !== 0) {
      await db.insert(accountMonthlySnapshots).values({ accountId, date, ...bal });
      n++;
    }
  }
  console.log(`  ↳ snapshot ${month} (${date}): ${n} accounts`);
}

// ── Seed ──────────────────────────────────────────────────────────────────────

async function seed() {
  // ── Clear ─────────────────────────────────────────────────────────────────
  console.log('Clearing existing data…');
  await db.delete(accountMonthlySnapshots);
  await db.delete(transactionTagMap);
  await db.delete(transactionEntries);
  await db.delete(transactions);
  await db.delete(tags);
  await db.delete(exchangeRates);
  await db.delete(accounts);
  await db.delete(securities);
  await db.delete(currencies);

  // ── Currencies ────────────────────────────────────────────────────────────
  console.log('\n[1] Currencies');
  const [ron] = await db.insert(currencies).values({ code: 'RON', name: 'Romanian Leu',  symbol: 'lei', decimalPlaces: 2, isBase: 1 }).returning();
  const [usd] = await db.insert(currencies).values({ code: 'USD', name: 'US Dollar',      symbol: '$',   decimalPlaces: 2, isBase: 0 }).returning();
  const [eur] = await db.insert(currencies).values({ code: 'EUR', name: 'Euro',           symbol: '€',   decimalPlaces: 2, isBase: 0 }).returning();
  if (!ron || !usd || !eur) throw new Error('currencies');
  console.log(`  RON id=${ron.id} (base)  USD id=${usd.id}  EUR id=${eur.id}`);

  // ── Exchange rates ────────────────────────────────────────────────────────
  // rateScale=4: rate 45000 means 1 USD = 4.5000 RON.
  // Values cycle through a realistic 6-month window regardless of calendar date.
  console.log('\n[2] Exchange rates (6 months)');
  const usdRates = [45000, 45200, 45500, 44800, 45100, 44400];
  const eurRates = [49900, 50100, 50200, 50050, 50150, 49950];
  for (let i = 0; i < 6; i++) {
    await db.insert(exchangeRates).values({ currencyId: usd.id, rate: usdRates[i]!, rateScale: 4, date: `${ym(i)}-01` });
    await db.insert(exchangeRates).values({ currencyId: eur.id, rate: eurRates[i]!, rateScale: 4, date: `${ym(i)}-01` });
  }
  console.log(`  12 rates inserted`);

  // Rate accessors by month index
  const ru = (i: number) => usdRates[i]!;
  const re = (i: number) => eurRates[i]!;

  // ── Securities ────────────────────────────────────────────────────────────
  console.log('\n[3] Securities');
  const [aapl] = await db.insert(securities).values({ ticker: 'AAPL', name: 'Apple Inc.',                 currencyId: usd.id, type: 'stock', quantityScale: 4 }).returning();
  const [msft] = await db.insert(securities).values({ ticker: 'MSFT', name: 'Microsoft Corp.',             currencyId: usd.id, type: 'stock', quantityScale: 4 }).returning();
  const [vwce] = await db.insert(securities).values({ ticker: 'VWCE', name: 'Vanguard FTSE All-World ETF', currencyId: eur.id, type: 'etf',   quantityScale: 4 }).returning();
  if (!aapl || !msft || !vwce) throw new Error('securities');
  console.log(`  AAPL id=${aapl.id}  MSFT id=${msft.id}  VWCE id=${vwce.id}`);

  // ── Accounts ──────────────────────────────────────────────────────────────
  console.log('\n[4] Accounts');
  function reg<T extends { id: number; type: string }>(a: T): T {
    acctType.set(a.id, a.type as AcctType);
    return a;
  }

  const ins = async (vals: schema.InsertAccount) => {
    const [a] = await db.insert(accounts).values(vals).returning();
    if (!a) throw new Error(`account insert failed: ${vals.category}`);
    return reg(a);
  };

  const bankRon    = await ins({ name: 'ING Bank RON',     type: 'debit',  accountType: 'simple',   currencyId: ron.id, category: 'asset/bank/ron'        });
  const bankUsd    = await ins({ name: 'Revolut USD',      type: 'debit',  accountType: 'simple',   currencyId: usd.id, category: 'asset/bank/usd'        });
  const bankEur    = await ins({ name: 'Revolut EUR',      type: 'debit',  accountType: 'simple',   currencyId: eur.id, category: 'asset/bank/eur'        });
  const depositRon = await ins({ name: 'RON Deposit',      type: 'debit',  accountType: 'deposit',  currencyId: ron.id, category: 'asset/deposit/ron'     });
  const sAapl      = await ins({ name: 'AAPL Shares',      type: 'debit',  accountType: 'security', currencyId: usd.id, category: 'asset/shares/aapl', securityId: aapl.id });
  const sMsft      = await ins({ name: 'MSFT Shares',      type: 'debit',  accountType: 'security', currencyId: usd.id, category: 'asset/shares/msft', securityId: msft.id });
  const sVwce      = await ins({ name: 'VWCE Shares',      type: 'debit',  accountType: 'security', currencyId: eur.id, category: 'asset/shares/vwce', securityId: vwce.id });
  const incSalary  = await ins({ name: 'Salary',           type: 'credit', accountType: 'simple',   currencyId: ron.id, category: 'income/salary'         });
  const incFreelance=await ins({ name: 'Freelance',        type: 'credit', accountType: 'simple',   currencyId: ron.id, category: 'income/freelance'      });
  const incInvest  = await ins({ name: 'Investment Gains', type: 'credit', accountType: 'simple',   currencyId: usd.id, category: 'income/investment'     });
  const incInterest= await ins({ name: 'Interest Income',  type: 'credit', accountType: 'simple',   currencyId: ron.id, category: 'income/interest'       });
  const incDiv     = await ins({ name: 'Dividends',        type: 'credit', accountType: 'simple',   currencyId: eur.id, category: 'income/dividends'      });
  const expFood    = await ins({ name: 'Food & Groceries', type: 'debit',  accountType: 'simple',   currencyId: ron.id, category: 'expense/food'           });
  const expUtil    = await ins({ name: 'Utilities',        type: 'debit',  accountType: 'simple',   currencyId: ron.id, category: 'expense/utilities'      });
  const expTransp  = await ins({ name: 'Transport',        type: 'debit',  accountType: 'simple',   currencyId: ron.id, category: 'expense/transport'      });
  const expEntert  = await ins({ name: 'Entertainment',    type: 'debit',  accountType: 'simple',   currencyId: ron.id, category: 'expense/entertainment'  });
  const expHealth  = await ins({ name: 'Health',           type: 'debit',  accountType: 'simple',   currencyId: ron.id, category: 'expense/health'         });
  const expFees    = await ins({ name: 'Broker Fees',      type: 'debit',  accountType: 'simple',   currencyId: usd.id, category: 'expense/fees/broker'    });
  const expFeeEur  = await ins({ name: 'Broker Fees EUR',  type: 'debit',  accountType: 'simple',   currencyId: eur.id, category: 'expense/fees/broker-eur'});
  const equity     = await ins({ name: 'Opening Balance',  type: 'credit', accountType: 'simple',   currencyId: ron.id, category: 'equity/opening'         });

  console.log(`  ${20} accounts registered`);

  // ── Tags ──────────────────────────────────────────────────────────────────
  console.log('\n[5] Tags');
  const [tSalary]    = await db.insert(tags).values({ name: 'salary'     }).returning();
  const [tGroceries] = await db.insert(tags).values({ name: 'groceries'  }).returning();
  const [tInvest]    = await db.insert(tags).values({ name: 'investment' }).returning();
  const [tFreelance] = await db.insert(tags).values({ name: 'freelance'  }).returning();
  const [tUtil]      = await db.insert(tags).values({ name: 'utilities'  }).returning();
  if (!tSalary || !tGroceries || !tInvest || !tFreelance || !tUtil) throw new Error('tags');
  console.log('  salary, groceries, investment, freelance, utilities');

  // ── Transactions & Snapshots ──────────────────────────────────────────────
  // Quantities use quantityScale=4: 1 share = 10_000 units.
  // Stock trades use average-cost method for cost-basis on sells.
  //
  // AAPL cost basis:
  //   Nov: 5 @ $225 = $1125   Dec: 3 @ $240 = $720   Feb: 2 @ $235 = $470
  //   Total 10 shares, $2315 → avg $231.50/share
  //   Mar: sell 4 @ $248 → proceeds $992, cost (avg) $926, gain $66
  //   Remaining: 6 shares, cost $1389
  //
  // MSFT cost basis:
  //   Dec: 3 @ $420 = $1260
  //   Feb: sell ALL 3 @ $432 → proceeds $1296, cost $1260, gain $36
  //
  // VWCE cost basis (EUR):
  //   Nov: 10 @ €98 = €980   Mar: 5 @ €102 = €510   Apr: 8 @ €105 = €840
  //   Total 23 shares

  console.log('\n[6] Transactions');

  // Month indices: 0=oldest, 5=most recent (last completed month).
  // Within each month, day numbers are fixed (salary on last day, etc.).

  // ── Month 0 ───────────────────────────────────────────────────────────────
  console.log(`\n  --- ${ym(0)} ---`);

  const eurOpenBase = toBase(500_000, re(0));
  await tx(d(0, 1), 'Opening balance', [
    { accountId: bankRon.id, side: 'debit',  amount: 3_000_000, amountBase: 3_000_000 },
    { accountId: bankEur.id, side: 'debit',  amount:   500_000, amountBase: eurOpenBase },
    { accountId: equity.id,  side: 'credit', amount: 3_000_000 + eurOpenBase, amountBase: 3_000_000 + eurOpenBase },
  ]);
  await tx(d(0, 3), 'FX buy $3 000', [
    { accountId: bankUsd.id, side: 'debit',  amount: 300_000, amountBase: toBase(300_000, ru(0)) },
    { accountId: bankRon.id, side: 'credit', amount: toBase(300_000, ru(0)), amountBase: toBase(300_000, ru(0)) },
  ]);
  await tx(d(0, lastDay(0)), 'Salary', [
    { accountId: bankRon.id,   side: 'debit',  amount: 700_000, amountBase: 700_000 },
    { accountId: incSalary.id, side: 'credit', amount: 700_000, amountBase: 700_000 },
  ], [tSalary.id]);
  await tx(d(0, 10), 'Groceries', [
    { accountId: expFood.id, side: 'debit',  amount: 62_000, amountBase: 62_000 },
    { accountId: bankRon.id, side: 'credit', amount: 62_000, amountBase: 62_000 },
  ], [tGroceries.id]);
  await tx(d(0, 15), 'Utilities', [
    { accountId: expUtil.id, side: 'debit',  amount: 38_000, amountBase: 38_000 },
    { accountId: bankRon.id, side: 'credit', amount: 38_000, amountBase: 38_000 },
  ], [tUtil.id]);
  await tx(d(0, 20), 'Transport', [
    { accountId: expTransp.id, side: 'debit',  amount: 15_000, amountBase: 15_000 },
    { accountId: bankRon.id,   side: 'credit', amount: 15_000, amountBase: 15_000 },
  ]);
  // Buy 5 AAPL @ $225 + $10 fee
  await tx(d(0, 12), 'Buy 5 AAPL @ $225.00', [
    { accountId: sAapl.id,   side: 'debit',  amount: 112_500, amountBase: toBase(112_500, ru(0)), quantity: 50_000, memo: '5 shares @ $225.00' },
    { accountId: expFees.id, side: 'debit',  amount:   1_000, amountBase: toBase(  1_000, ru(0)) },
    { accountId: bankUsd.id, side: 'credit', amount: 113_500, amountBase: toBase(113_500, ru(0)) },
  ], [tInvest.id]);
  // Buy 10 VWCE @ €98 + €3 fee
  await tx(d(0, 18), 'Buy 10 VWCE @ €98.00', [
    { accountId: sVwce.id,    side: 'debit',  amount:  98_000, amountBase: toBase( 98_000, re(0)), quantity: 100_000, memo: '10 shares @ €98.00' },
    { accountId: expFeeEur.id,side: 'debit',  amount:     300, amountBase: toBase(    300, re(0)) },
    { accountId: bankEur.id,  side: 'credit', amount:  98_300, amountBase: toBase( 98_300, re(0)) },
  ], [tInvest.id]);

  await snap(ym(0));

  // ── Month 1 ───────────────────────────────────────────────────────────────
  console.log(`\n  --- ${ym(1)} ---`);

  await tx(d(1, lastDay(1)), 'Salary', [
    { accountId: bankRon.id,   side: 'debit',  amount: 700_000, amountBase: 700_000 },
    { accountId: incSalary.id, side: 'credit', amount: 700_000, amountBase: 700_000 },
  ], [tSalary.id]);
  await tx(d(1, lastDay(1)), 'Year-end bonus', [
    { accountId: bankRon.id,   side: 'debit',  amount: 400_000, amountBase: 400_000 },
    { accountId: incSalary.id, side: 'credit', amount: 400_000, amountBase: 400_000 },
  ], [tSalary.id]);
  await tx(d(1, 12), 'Groceries', [
    { accountId: expFood.id, side: 'debit',  amount: 120_000, amountBase: 120_000 },
    { accountId: bankRon.id, side: 'credit', amount: 120_000, amountBase: 120_000 },
  ], [tGroceries.id]);
  await tx(d(1, 15), 'Utilities', [
    { accountId: expUtil.id, side: 'debit',  amount: 45_000, amountBase: 45_000 },
    { accountId: bankRon.id, side: 'credit', amount: 45_000, amountBase: 45_000 },
  ], [tUtil.id]);
  await tx(d(1, 22), 'Entertainment', [
    { accountId: expEntert.id, side: 'debit',  amount: 60_000, amountBase: 60_000 },
    { accountId: bankRon.id,   side: 'credit', amount: 60_000, amountBase: 60_000 },
  ]);
  await tx(d(1, 2), 'FX buy $2 500', [
    { accountId: bankUsd.id, side: 'debit',  amount: 250_000, amountBase: toBase(250_000, ru(1)) },
    { accountId: bankRon.id, side: 'credit', amount: toBase(250_000, ru(1)), amountBase: toBase(250_000, ru(1)) },
  ]);
  // Buy 3 AAPL @ $240 + $9 fee
  await tx(d(1, 5), 'Buy 3 AAPL @ $240.00', [
    { accountId: sAapl.id,   side: 'debit',  amount:  72_000, amountBase: toBase( 72_000, ru(1)), quantity: 30_000, memo: '3 shares @ $240.00' },
    { accountId: expFees.id, side: 'debit',  amount:     900, amountBase: toBase(    900, ru(1)) },
    { accountId: bankUsd.id, side: 'credit', amount:  72_900, amountBase: toBase( 72_900, ru(1)) },
  ], [tInvest.id]);
  // Buy 3 MSFT @ $420 + $9 fee
  await tx(d(1, 10), 'Buy 3 MSFT @ $420.00', [
    { accountId: sMsft.id,   side: 'debit',  amount: 126_000, amountBase: toBase(126_000, ru(1)), quantity: 30_000, memo: '3 shares @ $420.00' },
    { accountId: expFees.id, side: 'debit',  amount:     900, amountBase: toBase(    900, ru(1)) },
    { accountId: bankUsd.id, side: 'credit', amount: 126_900, amountBase: toBase(126_900, ru(1)) },
  ], [tInvest.id]);

  await snap(ym(1));

  // ── Month 2 ───────────────────────────────────────────────────────────────
  console.log(`\n  --- ${ym(2)} ---`);

  // Open RON deposit 10 000 RON @ 4.5% APY, matures 6 months later
  await tx(d(2, 10), 'Open RON deposit 10 000 RON @ 4.5%', [
    { accountId: depositRon.id, side: 'debit',  amount: 1_000_000, amountBase: 1_000_000, interestRate: 450, maturityDate: laterDate(2, 10, 6) },
    { accountId: bankRon.id,    side: 'credit', amount: 1_000_000, amountBase: 1_000_000 },
  ]);
  await tx(d(2, lastDay(2)), 'Deposit interest', [
    { accountId: depositRon.id,  side: 'debit',  amount: 3_750, amountBase: 3_750 },
    { accountId: incInterest.id, side: 'credit', amount: 3_750, amountBase: 3_750 },
  ]);
  await tx(d(2, lastDay(2)), 'Salary', [
    { accountId: bankRon.id,   side: 'debit',  amount: 700_000, amountBase: 700_000 },
    { accountId: incSalary.id, side: 'credit', amount: 700_000, amountBase: 700_000 },
  ], [tSalary.id]);
  await tx(d(2, 12), 'Groceries', [
    { accountId: expFood.id, side: 'debit',  amount: 90_000, amountBase: 90_000 },
    { accountId: bankRon.id, side: 'credit', amount: 90_000, amountBase: 90_000 },
  ], [tGroceries.id]);
  await tx(d(2, 15), 'Utilities', [
    { accountId: expUtil.id, side: 'debit',  amount: 52_000, amountBase: 52_000 },
    { accountId: bankRon.id, side: 'credit', amount: 52_000, amountBase: 52_000 },
  ], [tUtil.id]);
  await tx(d(2, 20), 'Health checkup', [
    { accountId: expHealth.id, side: 'debit',  amount: 35_000, amountBase: 35_000 },
    { accountId: bankRon.id,   side: 'credit', amount: 35_000, amountBase: 35_000 },
  ]);

  await snap(ym(2));

  // ── Month 3 ───────────────────────────────────────────────────────────────
  console.log(`\n  --- ${ym(3)} ---`);

  await tx(d(3, lastDay(3)), 'Salary', [
    { accountId: bankRon.id,   side: 'debit',  amount: 700_000, amountBase: 700_000 },
    { accountId: incSalary.id, side: 'credit', amount: 700_000, amountBase: 700_000 },
  ], [tSalary.id]);
  await tx(d(3, 15), 'Freelance project payment', [
    { accountId: bankRon.id,      side: 'debit',  amount: 300_000, amountBase: 300_000 },
    { accountId: incFreelance.id, side: 'credit', amount: 300_000, amountBase: 300_000 },
  ], [tFreelance.id]);
  await tx(d(3, lastDay(3)), 'Deposit interest', [
    { accountId: depositRon.id,  side: 'debit',  amount: 3_750, amountBase: 3_750 },
    { accountId: incInterest.id, side: 'credit', amount: 3_750, amountBase: 3_750 },
  ]);
  await tx(d(3, 10), 'Groceries', [
    { accountId: expFood.id, side: 'debit',  amount: 85_000, amountBase: 85_000 },
    { accountId: bankRon.id, side: 'credit', amount: 85_000, amountBase: 85_000 },
  ], [tGroceries.id]);
  await tx(d(3, 15), 'Utilities', [
    { accountId: expUtil.id, side: 'debit',  amount: 38_000, amountBase: 38_000 },
    { accountId: bankRon.id, side: 'credit', amount: 38_000, amountBase: 38_000 },
  ], [tUtil.id]);
  await tx(d(3, 20), 'Transport', [
    { accountId: expTransp.id, side: 'debit',  amount: 22_000, amountBase: 22_000 },
    { accountId: bankRon.id,   side: 'credit', amount: 22_000, amountBase: 22_000 },
  ]);
  // Sell ALL 3 MSFT @ $432 + $12 fee — close position; gain $36
  await tx(d(3, 14), 'Sell 3 MSFT @ $432.00 (close position)', [
    { accountId: bankUsd.id,   side: 'debit',  amount: 128_400, amountBase: toBase(128_400, ru(3)), memo: 'net proceeds' },
    { accountId: expFees.id,   side: 'debit',  amount:   1_200, amountBase: toBase(  1_200, ru(3)) },
    { accountId: sMsft.id,     side: 'credit', amount: 126_000, amountBase: toBase(126_000, ru(3)), quantity: 30_000, memo: '3 shares cost basis $420' },
    { accountId: incInvest.id, side: 'credit', amount:   3_600, amountBase: toBase(  3_600, ru(3)), memo: 'realized gain' },
  ], [tInvest.id]);
  // Buy 2 more AAPL @ $235 + $6 fee
  await tx(d(3, 20), 'Buy 2 AAPL @ $235.00', [
    { accountId: sAapl.id,   side: 'debit',  amount:  47_000, amountBase: toBase( 47_000, ru(3)), quantity: 20_000, memo: '2 shares @ $235.00' },
    { accountId: expFees.id, side: 'debit',  amount:     600, amountBase: toBase(    600, ru(3)) },
    { accountId: bankUsd.id, side: 'credit', amount:  47_600, amountBase: toBase( 47_600, ru(3)) },
  ], [tInvest.id]);

  await snap(ym(3));

  // ── Month 4 ───────────────────────────────────────────────────────────────
  console.log(`\n  --- ${ym(4)} ---`);

  await tx(d(4, lastDay(4)), 'Salary', [
    { accountId: bankRon.id,   side: 'debit',  amount: 700_000, amountBase: 700_000 },
    { accountId: incSalary.id, side: 'credit', amount: 700_000, amountBase: 700_000 },
  ], [tSalary.id]);
  await tx(d(4, lastDay(4)), 'Deposit interest', [
    { accountId: depositRon.id,  side: 'debit',  amount: 3_750, amountBase: 3_750 },
    { accountId: incInterest.id, side: 'credit', amount: 3_750, amountBase: 3_750 },
  ]);
  await tx(d(4, 10), 'Groceries', [
    { accountId: expFood.id, side: 'debit',  amount: 95_000, amountBase: 95_000 },
    { accountId: bankRon.id, side: 'credit', amount: 95_000, amountBase: 95_000 },
  ], [tGroceries.id]);
  await tx(d(4, 15), 'Utilities', [
    { accountId: expUtil.id, side: 'debit',  amount: 40_000, amountBase: 40_000 },
    { accountId: bankRon.id, side: 'credit', amount: 40_000, amountBase: 40_000 },
  ], [tUtil.id]);
  await tx(d(4, 22), 'Entertainment', [
    { accountId: expEntert.id, side: 'debit',  amount: 28_000, amountBase: 28_000 },
    { accountId: bankRon.id,   side: 'credit', amount: 28_000, amountBase: 28_000 },
  ]);
  // Sell 4 AAPL @ $248 + $12 fee — avg cost $231.50/share, gain $66
  await tx(d(4, 18), 'Sell 4 AAPL @ $248.00 (partial)', [
    { accountId: bankUsd.id,   side: 'debit',  amount:  98_000, amountBase: toBase( 98_000, ru(4)), memo: 'net proceeds' },
    { accountId: expFees.id,   side: 'debit',  amount:   1_200, amountBase: toBase(  1_200, ru(4)) },
    { accountId: sAapl.id,     side: 'credit', amount:  92_600, amountBase: toBase( 92_600, ru(4)), quantity: 40_000, memo: '4 shares avg cost $231.50' },
    { accountId: incInvest.id, side: 'credit', amount:   6_600, amountBase: toBase(  6_600, ru(4)), memo: 'realized gain' },
  ], [tInvest.id]);
  // Buy 5 VWCE @ €102 + €2 fee
  await tx(d(4, 25), 'Buy 5 VWCE @ €102.00', [
    { accountId: sVwce.id,    side: 'debit',  amount:  51_000, amountBase: toBase( 51_000, re(4)), quantity: 50_000, memo: '5 shares @ €102.00' },
    { accountId: expFeeEur.id,side: 'debit',  amount:     200, amountBase: toBase(    200, re(4)) },
    { accountId: bankEur.id,  side: 'credit', amount:  51_200, amountBase: toBase( 51_200, re(4)) },
  ], [tInvest.id]);

  await snap(ym(4));

  // ── Month 5 (most recent complete month) ──────────────────────────────────
  console.log(`\n  --- ${ym(5)} ---`);

  await tx(d(5, lastDay(5)), 'Salary', [
    { accountId: bankRon.id,   side: 'debit',  amount: 700_000, amountBase: 700_000 },
    { accountId: incSalary.id, side: 'credit', amount: 700_000, amountBase: 700_000 },
  ], [tSalary.id]);
  await tx(d(5, lastDay(5)), 'Deposit interest', [
    { accountId: depositRon.id,  side: 'debit',  amount: 3_750, amountBase: 3_750 },
    { accountId: incInterest.id, side: 'credit', amount: 3_750, amountBase: 3_750 },
  ]);
  await tx(d(5, 10), 'Groceries', [
    { accountId: expFood.id, side: 'debit',  amount: 88_000, amountBase: 88_000 },
    { accountId: bankRon.id, side: 'credit', amount: 88_000, amountBase: 88_000 },
  ], [tGroceries.id]);
  await tx(d(5, 15), 'Utilities', [
    { accountId: expUtil.id, side: 'debit',  amount: 37_000, amountBase: 37_000 },
    { accountId: bankRon.id, side: 'credit', amount: 37_000, amountBase: 37_000 },
  ], [tUtil.id]);
  await tx(d(5, 20), 'Transport', [
    { accountId: expTransp.id, side: 'debit',  amount: 20_000, amountBase: 20_000 },
    { accountId: bankRon.id,   side: 'credit', amount: 20_000, amountBase: 20_000 },
  ]);
  await tx(d(5, 25), 'Health', [
    { accountId: expHealth.id, side: 'debit',  amount: 45_000, amountBase: 45_000 },
    { accountId: bankRon.id,   side: 'credit', amount: 45_000, amountBase: 45_000 },
  ]);
  // VWCE dividend €50
  await tx(d(5, 15), 'VWCE dividend €50', [
    { accountId: bankEur.id, side: 'debit',  amount: 5_000, amountBase: toBase(5_000, re(5)) },
    { accountId: incDiv.id,  side: 'credit', amount: 5_000, amountBase: toBase(5_000, re(5)) },
  ], [tInvest.id]);
  // Buy 8 VWCE @ €105 + €3 fee
  await tx(d(5, 22), 'Buy 8 VWCE @ €105.00', [
    { accountId: sVwce.id,    side: 'debit',  amount:  84_000, amountBase: toBase( 84_000, re(5)), quantity: 80_000, memo: '8 shares @ €105.00' },
    { accountId: expFeeEur.id,side: 'debit',  amount:     300, amountBase: toBase(    300, re(5)) },
    { accountId: bankEur.id,  side: 'credit', amount:  84_300, amountBase: toBase( 84_300, re(5)) },
  ], [tInvest.id]);

  await snap(ym(5));

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  Seed complete');
  console.log('  3 currencies · 12 exchange rates · 3 securities');
  console.log('  20 accounts · 5 tags · 6 months of transactions');
  console.log('  Portfolio: AAPL 6 shares, MSFT 0 (closed), VWCE 23 shares');
  console.log('══════════════════════════════════════════════════════');
}

seed().catch((err: unknown) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
