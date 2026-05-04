/**
 * Seed script — populates every table with realistic test data:
 *   2 currencies (RON base, USD), 4 monthly exchange rates,
 *   2 stocks (AAPL, MSFT), 11 accounts, 20 balanced transactions,
 *   3 tags, monthly snapshots.
 *
 * Run from project root:
 *   node --experimental-strip-types --env-file=.env.test scripts/seed.ts
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

/**
 * Converts foreign-currency cents to base-currency (RON) cents.
 * rate is a scaled integer: actual = rate / 10^rate_scale.
 * For rate_scale=4: amount_base = usd_cents * rate / 10_000.
 */
function toBase(amountCents: number, rate: number): number {
  return Math.round((amountCents * rate) / 10_000);
}

type Side = 'debit' | 'credit';
interface EntryInput {
  accountId: number;
  side: Side;
  amount: number;
  amountBase: number;
  quantity?: number;
  interestRate?: number;
  maturityDate?: string;
  memo?: string;
}

async function insertTx(
  date: string,
  description: string,
  entries: EntryInput[],
  tagIds: number[] = [],
) {
  const sumBase = (side: Side) =>
    entries.filter(e => e.side === side).reduce((s, e) => s + e.amountBase, 0);

  const debitBase  = sumBase('debit');
  const creditBase = sumBase('credit');
  if (debitBase !== creditBase) {
    throw new Error(
      `Unbalanced transaction "${description}": debit_base=${debitBase} credit_base=${creditBase}`,
    );
  }

  const [tx] = await db.insert(transactions).values({ date, description }).returning();
  for (const entry of entries) {
    await db.insert(transactionEntries).values({ transactionId: tx.id, ...entry });
  }
  for (const tagId of tagIds) {
    await db.insert(transactionTagMap).values({ transactionId: tx.id, tagId });
  }

  console.log(`  [${date}] ${description.padEnd(38)} ${(debitBase / 100).toFixed(2)} RON`);
  return tx;
}

async function seed() {
  // ── Clear ───────────────────────────────────────────────────────────────────
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

  // ── 1. Currencies ───────────────────────────────────────────────────────────
  console.log('\n[1] Currencies');
  const [ron] = await db.insert(currencies).values(
    { code: 'RON', name: 'Romanian Leu', symbol: 'lei', decimalPlaces: 2, isBase: 1 },
  ).returning();
  const [usd] = await db.insert(currencies).values(
    { code: 'USD', name: 'US Dollar', symbol: '$', decimalPlaces: 2, isBase: 0 },
  ).returning();
  console.log(`  RON id=${ron.id} (base)  USD id=${usd.id}`);

  // ── 2. Exchange rates (USD → RON) ───────────────────────────────────────────
  // rate=45000 means 1 USD = 4.5000 RON  (scaled by 10^rate_scale = 10_000)
  console.log('\n[2] Exchange rates (USD/RON)');
  const rates: Record<string, number> = {
    '2026-01-01': 45000,
    '2026-02-01': 45200,
    '2026-03-01': 45500,
    '2026-04-01': 44800,
  };
  for (const [date, rate] of Object.entries(rates)) {
    await db.insert(exchangeRates).values({ currencyId: usd.id, rate, rateScale: 4, date });
    console.log(`  ${date}: ${(rate / 10_000).toFixed(4)} RON/USD`);
  }
  const r_feb = rates['2026-02-01'];
  const r_mar = rates['2026-03-01'];
  const r_apr = rates['2026-04-01'];

  // ── 3. Securities ────────────────────────────────────────────────────────────
  console.log('\n[3] Securities');
  const [aapl] = await db.insert(securities).values(
    { ticker: 'AAPL', name: 'Apple Inc.', currencyId: usd.id, type: 'stock', quantityScale: 4 },
  ).returning();
  const [msft] = await db.insert(securities).values(
    { ticker: 'MSFT', name: 'Microsoft Corp.', currencyId: usd.id, type: 'stock', quantityScale: 4 },
  ).returning();
  console.log(`  AAPL id=${aapl.id}  MSFT id=${msft.id}`);

  // ── 4. Accounts ──────────────────────────────────────────────────────────────
  console.log('\n[4] Accounts');
  const [bankRon] = await db.insert(accounts).values(
    { name: 'RON Bank', type: 'debit', accountType: 'simple', currencyId: ron.id, category: 'asset/bank/ron' },
  ).returning();
  const [bankUsd] = await db.insert(accounts).values(
    { name: 'USD Bank', type: 'debit', accountType: 'simple', currencyId: usd.id, category: 'asset/bank/usd' },
  ).returning();
  const [sharesAapl] = await db.insert(accounts).values(
    { name: 'AAPL Shares', type: 'debit', accountType: 'security', currencyId: usd.id, category: 'asset/shares/aapl', securityId: aapl.id },
  ).returning();
  const [sharesMsft] = await db.insert(accounts).values(
    { name: 'MSFT Shares', type: 'debit', accountType: 'security', currencyId: usd.id, category: 'asset/shares/msft', securityId: msft.id },
  ).returning();
  const [incSalary] = await db.insert(accounts).values(
    { name: 'Salary', type: 'credit', accountType: 'simple', currencyId: ron.id, category: 'income/salary' },
  ).returning();
  const [incInvestment] = await db.insert(accounts).values(
    { name: 'Investment Gains', type: 'credit', accountType: 'simple', currencyId: usd.id, category: 'income/investment' },
  ).returning();
  const [expFood] = await db.insert(accounts).values(
    { name: 'Food & Groceries', type: 'debit', accountType: 'simple', currencyId: ron.id, category: 'expense/food' },
  ).returning();
  const [expFees] = await db.insert(accounts).values(
    { name: 'Broker Fees', type: 'debit', accountType: 'simple', currencyId: usd.id, category: 'expense/fees/broker' },
  ).returning();
  const [equity] = await db.insert(accounts).values(
    { name: 'Opening Balance', type: 'credit', accountType: 'simple', currencyId: ron.id, category: 'equity/opening' },
  ).returning();
  const [depositRon] = await db.insert(accounts).values(
    { name: 'RON Deposit', type: 'debit', accountType: 'deposit', currencyId: ron.id, category: 'asset/deposit/ron' },
  ).returning();
  const [incInterest] = await db.insert(accounts).values(
    { name: 'Interest Income', type: 'credit', accountType: 'simple', currencyId: ron.id, category: 'income/interest' },
  ).returning();
  const allAccounts = [bankRon, bankUsd, sharesAapl, sharesMsft, incSalary, incInvestment, expFood, expFees, equity, depositRon, incInterest];
  for (const a of allAccounts) console.log(`  ${String(a.id).padStart(2)}  ${a.type.padEnd(6)}  ${a.category}`);

  // ── 5. Tags ──────────────────────────────────────────────────────────────────
  console.log('\n[5] Tags');
  const [tagSalary]     = await db.insert(tags).values({ name: 'salary' }).returning();
  const [tagGroceries]  = await db.insert(tags).values({ name: 'groceries' }).returning();
  const [tagInvestment] = await db.insert(tags).values({ name: 'investment' }).returning();
  console.log('  salary, groceries, investment');

  // ── 6. Transactions ──────────────────────────────────────────────────────────
  // Quantities use quantityScale=4: 10000 = 1.0000 share.
  // Amounts in native cents (USD or RON).
  // amount_base always in RON cents.
  //   RON entries:  amount_base = amount  (1:1)
  //   USD entries:  amount_base = toBase(amount, rate_for_that_month)
  console.log('\n[6] Transactions  (all debit_base == credit_base)');

  // T1 — Opening balance
  await insertTx('2026-01-01', 'Opening balance', [
    { accountId: bankRon.id, side: 'debit',  amount: 1_000_000, amountBase: 1_000_000 },
    { accountId: equity.id,  side: 'credit', amount: 1_000_000, amountBase: 1_000_000 },
  ]);

  // T2 — Open RON deposit 5,000 RON @ 5.00% APY, matures 2026-07-05
  // monthly interest: 500_000 * 5% / 12 = 2_083 RON¢
  await insertTx('2026-01-05', 'Open RON deposit 5,000 RON @ 5%', [
    { accountId: depositRon.id, side: 'debit',  amount: 500_000, amountBase: 500_000, interestRate: 500, maturityDate: '2026-07-05' },
    { accountId: bankRon.id,    side: 'credit', amount: 500_000, amountBase: 500_000 },
  ]);

  // T4 — Groceries January
  await insertTx('2026-01-15', 'Groceries January', [
    { accountId: expFood.id, side: 'debit',  amount: 50_000, amountBase: 50_000 },
    { accountId: bankRon.id, side: 'credit', amount: 50_000, amountBase: 50_000 },
  ], [tagGroceries.id]);

  // T4 — Salary January  (5,000 RON)
  await insertTx('2026-01-31', 'Salary January', [
    { accountId: bankRon.id,   side: 'debit',  amount: 500_000, amountBase: 500_000 },
    { accountId: incSalary.id, side: 'credit', amount: 500_000, amountBase: 500_000 },
  ], [tagSalary.id]);

  // T5 — Deposit interest January  (500,000 × 5% / 12 = 2,083 RON¢)
  await insertTx('2026-01-31', 'Deposit interest January', [
    { accountId: depositRon.id,  side: 'debit',  amount: 2_083, amountBase: 2_083 },
    { accountId: incInterest.id, side: 'credit', amount: 2_083, amountBase: 2_083 },
  ]);

  // T6 — FX: buy 2,000 USD @ 4.52 RON  (Feb rate=452)
  // DR bankUsd: toBase(200_000, 452) = 904,000
  // CR bankRon: 9,040 RON = 904,000 cents
  await insertTx('2026-02-03', 'FX: buy USD 2,000 @ 4.52 RON', [
    { accountId: bankUsd.id, side: 'debit',  amount: 200_000, amountBase: toBase(200_000, r_feb) },
    { accountId: bankRon.id, side: 'credit', amount: 904_000, amountBase: 904_000 },
  ]);

  // T7 — Buy 2 AAPL @ $220.00 + $4 commission  (Feb rate=452)
  // shares: 2 × 22,000 = 44,000 USD¢  qty=20,000 (2.0000)
  // base check: toBase(44_000,452)+toBase(400,452) = 198,880+1,808 = 200,688 = toBase(44_400,452) ✓
  await insertTx('2026-02-05', 'Buy 2 AAPL @ $220.00', [
    { accountId: sharesAapl.id, side: 'debit',  amount: 44_000, amountBase: toBase(44_000, r_feb), quantity: 20_000, memo: '2 shares @ $220.00' },
    { accountId: expFees.id,    side: 'debit',  amount:    400, amountBase: toBase(400,    r_feb) },
    { accountId: bankUsd.id,    side: 'credit', amount: 44_400, amountBase: toBase(44_400, r_feb) },
  ], [tagInvestment.id]);

  // T8 — Groceries February  (650 RON)
  await insertTx('2026-02-20', 'Groceries February', [
    { accountId: expFood.id, side: 'debit',  amount: 65_000, amountBase: 65_000 },
    { accountId: bankRon.id, side: 'credit', amount: 65_000, amountBase: 65_000 },
  ], [tagGroceries.id]);

  // T9 — Salary February  (5,200 RON)
  await insertTx('2026-02-28', 'Salary February', [
    { accountId: bankRon.id,   side: 'debit',  amount: 520_000, amountBase: 520_000 },
    { accountId: incSalary.id, side: 'credit', amount: 520_000, amountBase: 520_000 },
  ], [tagSalary.id]);

  // T10 — Deposit interest February
  await insertTx('2026-02-28', 'Deposit interest February', [
    { accountId: depositRon.id,  side: 'debit',  amount: 2_083, amountBase: 2_083 },
    { accountId: incInterest.id, side: 'credit', amount: 2_083, amountBase: 2_083 },
  ]);

  // T11 — FX: buy 2,000 USD @ 4.55 RON  (Mar rate=455)
  await insertTx('2026-03-05', 'FX: buy USD 2,000 @ 4.55 RON', [
    { accountId: bankUsd.id, side: 'debit',  amount: 200_000, amountBase: toBase(200_000, r_mar) },
    { accountId: bankRon.id, side: 'credit', amount: 910_000, amountBase: 910_000 },
  ]);

  // T12 — Buy 3 AAPL @ $218.00 + $6 commission  (Mar rate=455)
  // shares: 3 × 21,800 = 65,400 USD¢  qty=30,000 (3.0000)
  // base check: toBase(65_400,455)+toBase(600,455) = 297,570+2,730 = 300,300 = toBase(66_000,455) ✓
  await insertTx('2026-03-10', 'Buy 3 AAPL @ $218.00', [
    { accountId: sharesAapl.id, side: 'debit',  amount: 65_400, amountBase: toBase(65_400, r_mar), quantity: 30_000, memo: '3 shares @ $218.00' },
    { accountId: expFees.id,    side: 'debit',  amount:    600, amountBase: toBase(600,    r_mar) },
    { accountId: bankUsd.id,    side: 'credit', amount: 66_000, amountBase: toBase(66_000, r_mar) },
  ], [tagInvestment.id]);

  // T13 — Buy 3 MSFT @ $372.00 + $9 commission  (Mar rate=455)
  // shares: 3 × 37,200 = 111,600 USD¢  qty=30,000
  // base check: toBase(111_600,455)+toBase(900,455) = 507,780+4,095 = 511,875 = toBase(112_500,455) ✓
  await insertTx('2026-03-15', 'Buy 3 MSFT @ $372.00', [
    { accountId: sharesMsft.id, side: 'debit',  amount: 111_600, amountBase: toBase(111_600, r_mar), quantity: 30_000, memo: '3 shares @ $372.00' },
    { accountId: expFees.id,    side: 'debit',  amount:     900, amountBase: toBase(900,     r_mar) },
    { accountId: bankUsd.id,    side: 'credit', amount: 112_500, amountBase: toBase(112_500, r_mar) },
  ], [tagInvestment.id]);

  // T14 — Groceries March  (580 RON)
  await insertTx('2026-03-20', 'Groceries March', [
    { accountId: expFood.id, side: 'debit',  amount: 58_000, amountBase: 58_000 },
    { accountId: bankRon.id, side: 'credit', amount: 58_000, amountBase: 58_000 },
  ], [tagGroceries.id]);

  // T15 — Salary March  (5,200 RON)
  await insertTx('2026-03-31', 'Salary March', [
    { accountId: bankRon.id,   side: 'debit',  amount: 520_000, amountBase: 520_000 },
    { accountId: incSalary.id, side: 'credit', amount: 520_000, amountBase: 520_000 },
  ], [tagSalary.id]);

  // T16 — Deposit interest March
  await insertTx('2026-03-31', 'Deposit interest March', [
    { accountId: depositRon.id,  side: 'debit',  amount: 2_083, amountBase: 2_083 },
    { accountId: incInterest.id, side: 'credit', amount: 2_083, amountBase: 2_083 },
  ]);

  // T17 — Sell 2 AAPL @ $225.00, $5 commission, FIFO cost $220/share  (Apr rate=448)
  // FIFO cost of first 2 shares (bought @ $220): 2 × 22,000 = 44,000 USD¢
  // Sale proceeds: 2 × 22,500 = 45,000 → net cash after $5 fee: 44,500 USD¢
  // Realized gain: 45,000 − 44,000 = 1,000 USD¢ ($10.00)
  // base check: toBase(44_500,448)+toBase(500,448) = 199,360+2,240 = 201,600
  //             toBase(44_000,448)+toBase(1_000,448) = 197,120+4,480 = 201,600 ✓
  await insertTx('2026-04-10', 'Sell 2 AAPL @ $225.00 (FIFO)', [
    { accountId: bankUsd.id,       side: 'debit',  amount: 44_500, amountBase: toBase(44_500, r_apr), memo: 'net proceeds' },
    { accountId: expFees.id,       side: 'debit',  amount:    500, amountBase: toBase(500,    r_apr) },
    { accountId: sharesAapl.id,    side: 'credit', amount: 44_000, amountBase: toBase(44_000, r_apr), quantity: 20_000, memo: '2 shares FIFO cost $220' },
    { accountId: incInvestment.id, side: 'credit', amount:  1_000, amountBase: toBase(1_000,  r_apr), memo: 'realized gain' },
  ], [tagInvestment.id]);

  // T18 — Groceries April  (720 RON)
  await insertTx('2026-04-20', 'Groceries April', [
    { accountId: expFood.id, side: 'debit',  amount: 72_000, amountBase: 72_000 },
    { accountId: bankRon.id, side: 'credit', amount: 72_000, amountBase: 72_000 },
  ], [tagGroceries.id]);

  // T19 — Salary April  (5,200 RON)
  await insertTx('2026-04-30', 'Salary April', [
    { accountId: bankRon.id,   side: 'debit',  amount: 520_000, amountBase: 520_000 },
    { accountId: incSalary.id, side: 'credit', amount: 520_000, amountBase: 520_000 },
  ], [tagSalary.id]);

  // T20 — Deposit interest April
  await insertTx('2026-04-30', 'Deposit interest April', [
    { accountId: depositRon.id,  side: 'debit',  amount: 2_083, amountBase: 2_083 },
    { accountId: incInterest.id, side: 'credit', amount: 2_083, amountBase: 2_083 },
  ]);

  // ── 7. Monthly snapshots ─────────────────────────────────────────────────────
  // Cumulative running balance at end of each month (period key = YYYY-MM-01).
  // balance      = net native-currency cents
  //                  debit accounts:  Σ debit_amount  − Σ credit_amount
  //                  credit accounts: Σ credit_amount − Σ debit_amount
  // balance_base = net RON cents, summed from each entry's amountBase (historical cost)
  //
  // Derivation:
  //   asset/bank/ron (RON → balance == balance_base):
  //     Jan: +1,000,000 − 500,000(deposit) − 50,000 + 500,000  =   950,000
  //     Feb: prev − 904,000 − 65,000 + 520,000                 =   501,000
  //     Mar: prev − 910,000 − 58,000 + 520,000                 =    53,000
  //     Apr: prev − 72,000  + 520,000                          =   501,000
  //
  //   asset/deposit/ron (debit, RON):
  //     Jan: +500,000 + 2,083                                   =   502,083
  //     Feb: prev + 2,083                                       =   504,166
  //     Mar: prev + 2,083                                       =   506,249
  //     Apr: prev + 2,083                                       =   508,332
  //
  //   asset/bank/usd (balance_base = Σ amountBase, historical cost):
  //     Feb: +904,000 − toBase(44_400,452)                      =   703,312
  //     Mar: prev + 910,000 − toBase(66_000,455)
  //               − toBase(112_500,455)                         =   801,137
  //     Apr: prev + toBase(44_500,448)                          = 1,000,497
  //
  //   asset/shares/aapl (balance = USD cost¢, balance_base = Σ amountBase):
  //     Feb: 44,000         base: 198,880
  //     Mar: +65,400        base: +297,570  → 496,450
  //     Apr: −44,000 (FIFO) base: −197,120  → 299,330
  //
  //   asset/shares/msft:
  //     Mar: 111,600        base: 507,780
  //     Apr: unchanged
  //
  //   expense/fees/broker (balance_base = Σ amountBase per tranche):
  //     Feb: 400   base: 1,808
  //     Mar: 1,900 base: 1,808+2,730+4,095 = 8,633
  //     Apr: 2,400 base: 8,633+2,240 = 10,873
  //
  //   income/interest (credit, RON):
  //     Jan: 2,083  Feb: 4,166  Mar: 6,249  Apr: 8,332
  console.log('\n[7] Monthly snapshots');

  const snapshots = [
    // asset/bank/ron
    { accountId: bankRon.id, date: '2026-01-01', balance:   950_000, balanceBase:   950_000 },
    { accountId: bankRon.id, date: '2026-02-01', balance:   501_000, balanceBase:   501_000 },
    { accountId: bankRon.id, date: '2026-03-01', balance:    53_000, balanceBase:    53_000 },
    { accountId: bankRon.id, date: '2026-04-01', balance:   501_000, balanceBase:   501_000 },
    // asset/deposit/ron
    { accountId: depositRon.id, date: '2026-01-01', balance: 502_083, balanceBase: 502_083 },
    { accountId: depositRon.id, date: '2026-02-01', balance: 504_166, balanceBase: 504_166 },
    { accountId: depositRon.id, date: '2026-03-01', balance: 506_249, balanceBase: 506_249 },
    { accountId: depositRon.id, date: '2026-04-01', balance: 508_332, balanceBase: 508_332 },
    // asset/bank/usd  (balance in USD¢, balanceBase in RON¢ historical cost)
    { accountId: bankUsd.id, date: '2026-02-01', balance: 155_600, balanceBase:   703_312 },
    { accountId: bankUsd.id, date: '2026-03-01', balance: 177_100, balanceBase:   801_137 },
    { accountId: bankUsd.id, date: '2026-04-01', balance: 221_600, balanceBase: 1_000_497 },
    // asset/shares/aapl
    { accountId: sharesAapl.id, date: '2026-02-01', balance:  44_000, balanceBase: 198_880 },
    { accountId: sharesAapl.id, date: '2026-03-01', balance: 109_400, balanceBase: 496_450 },
    { accountId: sharesAapl.id, date: '2026-04-01', balance:  65_400, balanceBase: 299_330 },
    // asset/shares/msft
    { accountId: sharesMsft.id, date: '2026-03-01', balance: 111_600, balanceBase: 507_780 },
    { accountId: sharesMsft.id, date: '2026-04-01', balance: 111_600, balanceBase: 507_780 },
    // income/salary (credit, RON)
    { accountId: incSalary.id, date: '2026-01-01', balance:   500_000, balanceBase:   500_000 },
    { accountId: incSalary.id, date: '2026-02-01', balance: 1_020_000, balanceBase: 1_020_000 },
    { accountId: incSalary.id, date: '2026-03-01', balance: 1_540_000, balanceBase: 1_540_000 },
    { accountId: incSalary.id, date: '2026-04-01', balance: 2_060_000, balanceBase: 2_060_000 },
    // income/investment (credit, USD)
    { accountId: incInvestment.id, date: '2026-04-01', balance: 1_000, balanceBase: toBase(1_000, r_apr) },
    // expense/food (debit, RON)
    { accountId: expFood.id, date: '2026-01-01', balance:  50_000, balanceBase:  50_000 },
    { accountId: expFood.id, date: '2026-02-01', balance: 115_000, balanceBase: 115_000 },
    { accountId: expFood.id, date: '2026-03-01', balance: 173_000, balanceBase: 173_000 },
    { accountId: expFood.id, date: '2026-04-01', balance: 245_000, balanceBase: 245_000 },
    // expense/fees/broker (debit, USD — balance_base accumulated at each month's rate)
    { accountId: expFees.id, date: '2026-02-01', balance:   400, balanceBase:  1_808 },
    { accountId: expFees.id, date: '2026-03-01', balance: 1_900, balanceBase:  8_633 },
    { accountId: expFees.id, date: '2026-04-01', balance: 2_400, balanceBase: 10_873 },
    // equity/opening (credit, RON — unchanged after opening)
    { accountId: equity.id, date: '2026-01-01', balance: 1_000_000, balanceBase: 1_000_000 },
    { accountId: equity.id, date: '2026-02-01', balance: 1_000_000, balanceBase: 1_000_000 },
    { accountId: equity.id, date: '2026-03-01', balance: 1_000_000, balanceBase: 1_000_000 },
    { accountId: equity.id, date: '2026-04-01', balance: 1_000_000, balanceBase: 1_000_000 },
    // income/interest (credit, RON — cumulative)
    { accountId: incInterest.id, date: '2026-01-01', balance: 2_083, balanceBase: 2_083 },
    { accountId: incInterest.id, date: '2026-02-01', balance: 4_166, balanceBase: 4_166 },
    { accountId: incInterest.id, date: '2026-03-01', balance: 6_249, balanceBase: 6_249 },
    { accountId: incInterest.id, date: '2026-04-01', balance: 8_332, balanceBase: 8_332 },
  ];

  for (const snap of snapshots) {
    await db.insert(accountMonthlySnapshots).values(snap);
  }
  console.log(`  ${snapshots.length} snapshots inserted`);

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════');
  console.log('  Seed complete');
  console.log(`  2 currencies  ·  ${Object.keys(rates).length} exchange rates`);
  console.log(`  2 securities`);
  console.log(`  ${allAccounts.length} accounts  ·  20 transactions  ·  3 tags`);
  console.log(`  ${snapshots.length} monthly snapshots`);
  console.log('══════════════════════════════════════════');
}

seed().catch((err: unknown) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
