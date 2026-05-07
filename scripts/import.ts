/**
 * CSV data import script.
 *
 * Usage:
 *   node --experimental-strip-types scripts/import.ts [options] <file.csv>
 *   npm run import -- [options] <file.csv>
 *
 * Options:
 *   --env=<file>  Env file to load (default: .env.test)
 *   --dry-run     Validate without writing to the database
 *   --help        Show usage
 *
 * See import/seed.csv for the full CSV format reference.
 */
import { readFileSync } from 'node:fs';
import { config as loadEnv } from 'dotenv';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import * as schema from '../app/db/schema.ts';

// ── CLI ───────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
CSV Data Import

Usage:
  node --experimental-strip-types scripts/import.ts [options] <file.csv>
  npm run import -- [options] <file.csv>

Options:
  --env=<file>  Env file to load  (default: .env.test)
  --dry-run     Validate without writing to the database
  --help        Show this message

CSV Format:
  First column is the entity type. Lines starting with # are comments.
  Define entities in this order (currencies before accounts, accounts before transactions):

  currency,<CODE>,<name>,<symbol>,<decimal_places>,<is_base: true|false>
  exchange_rate,<CODE>,<YYYY-MM-DD>,<rate>
  security,<TICKER>,<name>,<CURRENCY_CODE>,<type: stock|etf|crypto>,<quantity_scale>
  account,<name>,<type: debit|credit>,<account_type: simple|deposit|security>,<CURRENCY_CODE>,<category>,[is_active: true|false],[SECURITY_TICKER]
  tag,<name>
  transaction,<YYYY-MM-DD>,<description>,[tags: name1|name2]
  entry,<account_name>,<side: debit|credit>,<amount>,<rate>,[memo],[quantity],[interest_rate_pct],[maturity_date]

  Notes:
  - Each transaction row must be followed by at least 2 entry rows
  - amount: decimal in currency units (e.g. 5000.00 for 5000 RON)
  - rate: exchange rate to base currency (use 1 for base-currency entries)
  - Multiple tags separated by | (e.g. salary|bonus)
  - The entire import runs in a single SQLite transaction — all or nothing

Examples:
  node --experimental-strip-types scripts/import.ts --env=.env mydata.csv
  node --experimental-strip-types scripts/import.ts --dry-run mydata.csv
  npm run import -- --env=.env mydata.csv
`);
  process.exit(0);
}

const dryRun  = args.includes('--dry-run');
const envFile = args.find(a => a.startsWith('--env='))?.slice('--env='.length) ?? '.env.test';
const csvFile = args.filter(a => !a.startsWith('--')).at(-1);

if (!csvFile) {
  console.error('Error: No CSV file specified. Run with --help for usage.');
  process.exit(1);
}

// ── Env ───────────────────────────────────────────────────────────────────────

loadEnv({ path: envFile, override: true });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error(`Error: DATABASE_URL not set. Checked env file: ${envFile}`);
  process.exit(1);
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Side         = 'debit' | 'credit';
type AccountType  = 'simple' | 'deposit' | 'security';
type SecurityType = 'stock' | 'etf' | 'crypto';

interface CurrencyRow { code: string; name: string; symbol: string; decimalPlaces: number; isBase: boolean }
interface RateRow     { currencyCode: string; date: string; rate: number }
interface SecurityRow { ticker: string; name: string; currencyCode: string; type: SecurityType; quantityScale: number }
interface AccountRow  { name: string; type: Side; accountType: AccountType; currencyCode: string; category: string; isActive: boolean; securityTicker: string | null }
interface TagRow      { name: string }
interface EntryRow    { account: string; side: Side; amountStr: string; rateStr: string; memo: string; quantityStr: string | null; interestRatePct: string | null; maturityDate: string | null }
interface TxRow       { date: string; description: string | null; tags: string[]; entries: EntryRow[] }

// ── CSV parser ────────────────────────────────────────────────────────────────

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { quoted = false; }
      else { cur += ch; }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      out.push(cur.trim()); cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

// ── Parse CSV ─────────────────────────────────────────────────────────────────

const currencyRows: CurrencyRow[] = [];
const rateRows:     RateRow[]     = [];
const securityRows: SecurityRow[] = [];
const accountRows:  AccountRow[]  = [];
const tagRows:      TagRow[]      = [];
const txRows:       TxRow[]       = [];

let pendingTx: TxRow | null = null;
let lineNum = 0;

function fail(msg: string): never {
  console.error(`Error at line ${lineNum}: ${msg}`);
  process.exit(1);
}

function col(fields: string[], index: number, name: string): string {
  const v = fields[index]?.trim();
  if (!v) fail(`Missing required column '${name}'`);
  return v;
}

for (const raw of readFileSync(csvFile, 'utf8').split('\n')) {
  lineNum++;
  const line = raw.trim();
  if (!line || line.startsWith('#')) continue;

  const f      = parseCsvLine(line);
  const entity = f[0]?.toLowerCase().trim();

  if (entity !== 'entry' && pendingTx !== null) {
    if (pendingTx.entries.length < 2) fail(`Transaction "${pendingTx.description}" has fewer than 2 entries`);
    txRows.push(pendingTx);
    pendingTx = null;
  }

  switch (entity) {
    case 'currency':
      currencyRows.push({
        code:          col(f, 1, 'code').toUpperCase(),
        name:          col(f, 2, 'name'),
        symbol:        col(f, 3, 'symbol'),
        decimalPlaces: parseInt(col(f, 4, 'decimal_places'), 10),
        isBase:        f[5]?.trim().toLowerCase() === 'true',
      });
      break;

    case 'exchange_rate':
      rateRows.push({
        currencyCode: col(f, 1, 'currency_code').toUpperCase(),
        date:         col(f, 2, 'date'),
        rate:         parseFloat(col(f, 3, 'rate')),
      });
      break;

    case 'security':
      securityRows.push({
        ticker:        col(f, 1, 'ticker').toUpperCase(),
        name:          col(f, 2, 'name'),
        currencyCode:  col(f, 3, 'currency_code').toUpperCase(),
        type:          col(f, 4, 'type') as SecurityType,
        quantityScale: parseInt(f[5]?.trim() || '4', 10),
      });
      break;

    case 'account':
      accountRows.push({
        name:           col(f, 1, 'name'),
        type:           col(f, 2, 'type') as Side,
        accountType:    col(f, 3, 'account_type') as AccountType,
        currencyCode:   col(f, 4, 'currency_code').toUpperCase(),
        category:       col(f, 5, 'category'),
        isActive:       f[6]?.trim().toLowerCase() !== 'false',
        securityTicker: f[7]?.trim() || null,
      });
      break;

    case 'tag':
      tagRows.push({ name: col(f, 1, 'name') });
      break;

    case 'transaction':
      pendingTx = {
        date:        col(f, 1, 'date'),
        description: f[2]?.trim() || null,
        tags:        f[3]?.trim() ? f[3].trim().split('|').map(t => t.trim()).filter(Boolean) : [],
        entries:     [],
      };
      break;

    case 'entry':
      if (!pendingTx) fail("'entry' row without a preceding 'transaction' row");
      pendingTx.entries.push({
        account:         col(f, 1, 'account'),
        side:            col(f, 2, 'side') as Side,
        amountStr:       col(f, 3, 'amount'),
        rateStr:         f[4]?.trim() || '1',
        memo:            f[5]?.trim() || '',
        quantityStr:     f[6]?.trim() || null,
        interestRatePct: f[7]?.trim() || null,
        maturityDate:    f[8]?.trim() || null,
      });
      break;

    default:
      fail(`Unknown entity type: '${entity}'`);
  }
}

if (pendingTx !== null) {
  if (pendingTx.entries.length < 2) fail(`Last transaction "${pendingTx.description}" has fewer than 2 entries`);
  txRows.push(pendingTx);
}

// ── Validate double-entry balance ─────────────────────────────────────────────

for (const t of txRows) {
  let debit = 0, credit = 0;
  for (const e of t.entries) {
    const cents = Math.round(parseFloat(e.amountStr) * 100);
    const base  = Math.round(cents * (parseFloat(e.rateStr) || 1));
    if (e.side === 'debit') debit += base; else credit += base;
  }
  if (debit !== credit) {
    console.error(`Unbalanced transaction "${t.description}" (${t.date}): debit_base=${debit} credit_base=${credit}`);
    process.exit(1);
  }
}

console.log(
  `Parsed  ${currencyRows.length} currencies · ` +
  `${rateRows.length} exchange rates · ` +
  `${securityRows.length} securities · ` +
  `${accountRows.length} accounts · ` +
  `${tagRows.length} tags · ` +
  `${txRows.length} transactions`,
);

if (dryRun) {
  console.log('[dry-run] Validation passed. No data written.');
  process.exit(0);
}

// ── Import ────────────────────────────────────────────────────────────────────

const db = drizzle({ connection: { source: DATABASE_URL }, schema });

const RATE_SCALE = 4;

db.transaction(dbTx => {
  // 1. Currencies
  console.log('\n[1] Currencies');
  const currencyMap = new Map<string, { id: number; isBase: boolean }>();
  let baseId: number | null = null;

  for (const c of currencyRows) {
    const [row] = dbTx.insert(schema.currencies)
      .values({ code: c.code, name: c.name, symbol: c.symbol, decimalPlaces: c.decimalPlaces, isBase: 0 })
      .returning().all();
    if (!row) throw new Error(`Failed to insert currency ${c.code}`);
    currencyMap.set(c.code, { id: row.id, isBase: c.isBase });
    if (c.isBase) baseId = row.id;
    console.log(`  ${c.code} id=${row.id}${c.isBase ? ' (base)' : ''}`);
  }

  if (baseId !== null) {
    dbTx.update(schema.currencies).set({ isBase: 1 }).where(eq(schema.currencies.id, baseId)).run();
  }

  // 2. Exchange rates
  console.log('\n[2] Exchange rates');
  for (const r of rateRows) {
    const cur = currencyMap.get(r.currencyCode);
    if (!cur) throw new Error(`Unknown currency in exchange_rate: ${r.currencyCode}`);
    const stored = Math.round(r.rate * Math.pow(10, RATE_SCALE));
    dbTx.insert(schema.exchangeRates)
      .values({ currencyId: cur.id, date: r.date, rate: stored, rateScale: RATE_SCALE })
      .onConflictDoNothing()
      .run();
    console.log(`  ${r.currencyCode} ${r.date} = ${r.rate}`);
  }

  // 3. Securities
  console.log('\n[3] Securities');
  const securityMap = new Map<string, { id: number }>();

  for (const s of securityRows) {
    const cur = currencyMap.get(s.currencyCode);
    if (!cur) throw new Error(`Unknown currency for security ${s.ticker}: ${s.currencyCode}`);
    const [row] = dbTx.insert(schema.securities)
      .values({ ticker: s.ticker, name: s.name, currencyId: cur.id, type: s.type, quantityScale: s.quantityScale })
      .returning().all();
    if (!row) throw new Error(`Failed to insert security ${s.ticker}`);
    securityMap.set(s.ticker, { id: row.id });
    console.log(`  ${s.ticker} id=${row.id}`);
  }

  // 4. Accounts
  console.log('\n[4] Accounts');
  const accountMap = new Map<string, { id: number; accountType: string }>();

  for (const a of accountRows) {
    const cur = currencyMap.get(a.currencyCode);
    if (!cur) throw new Error(`Unknown currency for account "${a.name}": ${a.currencyCode}`);

    let securityId: number | null = null;
    if (a.securityTicker) {
      const sec = securityMap.get(a.securityTicker.toUpperCase());
      if (!sec) throw new Error(`Unknown security for account "${a.name}": ${a.securityTicker}`);
      securityId = sec.id;
    }

    const [row] = dbTx.insert(schema.accounts)
      .values({
        name: a.name, type: a.type, accountType: a.accountType,
        currencyId: cur.id, category: a.category,
        isActive: a.isActive ? 1 : 0, securityId,
      })
      .returning().all();
    if (!row) throw new Error(`Failed to insert account "${a.name}"`);
    accountMap.set(a.name, { id: row.id, accountType: a.accountType });
    console.log(`  "${a.name}" id=${row.id}`);
  }

  // 5. Tags
  console.log('\n[5] Tags');
  const tagMap = new Map<string, number>();

  for (const t of tagRows) {
    const [row] = dbTx.insert(schema.tags).values({ name: t.name }).returning().all();
    if (!row) throw new Error(`Failed to insert tag "${t.name}"`);
    tagMap.set(t.name, row.id);
    console.log(`  "${t.name}" id=${row.id}`);
  }

  // 6. Transactions
  console.log('\n[6] Transactions');
  for (const txRow of txRows) {
    const [t] = dbTx.insert(schema.transactions)
      .values({ date: txRow.date, description: txRow.description })
      .returning().all();
    if (!t) throw new Error(`Failed to insert transaction "${txRow.description}"`);

    for (const e of txRow.entries) {
      const acct = accountMap.get(e.account);
      if (!acct) throw new Error(`Unknown account "${e.account}" in transaction "${txRow.description}"`);

      const amtCents    = Math.round(parseFloat(e.amountStr) * 100);
      const rateDecimal = parseFloat(e.rateStr) || 1;
      const amountBase  = Math.round(amtCents * rateDecimal);

      // Matches transaction.service.ts buildEntryRows logic
      let quantity: number | null = null;
      if (e.quantityStr && acct.accountType === 'security') {
        quantity = Math.round(parseFloat(e.quantityStr) * 1e6);
      }

      let interestRate: number | null = null;
      let maturityDate: string | null = null;
      if (acct.accountType === 'deposit') {
        if (e.interestRatePct) interestRate = Math.round(parseFloat(e.interestRatePct) * 100);
        if (e.maturityDate)    maturityDate = e.maturityDate;
      }

      dbTx.insert(schema.transactionEntries).values({
        transactionId: t.id, accountId: acct.id, side: e.side,
        amount: amtCents, amountBase, quantity, interestRate, maturityDate,
        memo: e.memo || null,
      }).run();
    }

    for (const tagName of txRow.tags) {
      const tagId = tagMap.get(tagName);
      if (tagId === undefined) throw new Error(`Unknown tag "${tagName}" in transaction "${txRow.description}"`);
      dbTx.insert(schema.transactionTagMap).values({ transactionId: t.id, tagId }).run();
    }

    console.log(`  [${txRow.date}] ${(txRow.description ?? '(no description)').padEnd(45)} ${txRow.entries.length} entries`);
  }
});

console.log('\nImport complete.');
