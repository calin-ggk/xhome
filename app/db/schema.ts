import { integer, sqliteTable, text, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// 1. Currencies & Exchange Rates

export const currencies = sqliteTable('currencies', {
  id:             integer('id').primaryKey(),
  code:           text('code').notNull().unique(),
  name:           text('name').notNull(),
  symbol:         text('symbol').notNull(),
  decimalPlaces:  integer('decimal_places').notNull().default(2),
  isBase:         integer('is_base').notNull().default(0),
});

export const exchangeRates = sqliteTable('exchange_rates', {
  id:         integer('id').primaryKey(),
  currencyId: integer('currency_id').notNull().references(() => currencies.id),
  // scaled integer; actual = rate / 10^currencies.decimal_places
  rate:       integer('rate').notNull(),
  date:       text('date').notNull(),
}, t => [uniqueIndex('exchange_rates_currency_date').on(t.currencyId, t.date)]);

// 2. Securities

export const securities = sqliteTable('securities', {
  id:            integer('id').primaryKey(),
  ticker:        text('ticker').notNull().unique(),
  name:          text('name').notNull(),
  currencyId:    integer('currency_id').notNull().references(() => currencies.id),
  type:          text('type').notNull(), // stock | etf | crypto
  quantityScale: integer('quantity_scale').notNull().default(6),
});

export const securityPrices = sqliteTable('security_prices', {
  id:         integer('id').primaryKey(),
  securityId: integer('security_id').notNull().references(() => securities.id),
  date:       text('date').notNull(),
  price:      integer('price').notNull(),
}, t => [uniqueIndex('security_prices_security_date').on(t.securityId, t.date)]);

// 3. Accounts

export const accounts = sqliteTable('accounts', {
  id:         integer('id').primaryKey(),
  name:       text('name').notNull(),
  type:       text('type').notNull(), // debit | credit
  currencyId: integer('currency_id').notNull().references(() => currencies.id),
  category:   text('category').notNull().unique(), // e.g. "asset/bank/revolut"
  securityId: integer('security_id').references(() => securities.id),
  meta:       text('meta'), // JSON
  isActive:   integer('is_active').default(1),
}, t => [index('idx_accounts_category').on(t.category)]);

// 4. Transactions

export const transactions = sqliteTable('transactions', {
  id:          integer('id').primaryKey(),
  date:        text('date').notNull(),
  createdAt:   text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
  description: text('description'),
  hash:        text('hash').unique(),
});

export const transactionEntries = sqliteTable('transaction_entries', {
  id:            integer('id').primaryKey(),
  transactionId: integer('transaction_id').notNull().references(() => transactions.id, { onDelete: 'cascade' }),
  accountId:     integer('account_id').notNull().references(() => accounts.id),
  side:          text('side').notNull(), // debit | credit
  amount:        integer('amount').notNull(),
  amountBase:    integer('amount_base').notNull(),
  // scaled integer; actual = quantity / 10^securities.quantity_scale
  quantity:      integer('quantity'),
  memo:          text('memo'),
});

// 5. Tags

export const tags = sqliteTable('tags', {
  id:   integer('id').primaryKey(),
  name: text('name').notNull().unique(),
});

export const transactionTagMap = sqliteTable('transaction_tag_map', {
  transactionId: integer('transaction_id').notNull().references(() => transactions.id, { onDelete: 'cascade' }),
  tagId:         integer('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
}, t => [uniqueIndex('transaction_tag_map_pk').on(t.transactionId, t.tagId)]);

// 6. Reporting Snapshots

export const accountMonthlySnapshots = sqliteTable('account_monthly_snapshots', {
  id:          integer('id').primaryKey(),
  accountId:   integer('account_id').notNull().references(() => accounts.id),
  date:        text('date').notNull(), // YYYY-MM-01
  balance:     integer('balance').notNull(),
  balanceBase: integer('balance_base').notNull(),
}, t => [uniqueIndex('snapshots_account_date').on(t.accountId, t.date)]);

// Inferred types
export type Currency              = typeof currencies.$inferSelect;
export type InsertCurrency        = typeof currencies.$inferInsert;
export type ExchangeRate          = typeof exchangeRates.$inferSelect;
export type InsertExchangeRate    = typeof exchangeRates.$inferInsert;
export type Security              = typeof securities.$inferSelect;
export type InsertSecurity        = typeof securities.$inferInsert;
export type SecurityPrice         = typeof securityPrices.$inferSelect;
export type InsertSecurityPrice   = typeof securityPrices.$inferInsert;
export type Account               = typeof accounts.$inferSelect;
export type InsertAccount         = typeof accounts.$inferInsert;
export type Transaction           = typeof transactions.$inferSelect;
export type InsertTransaction     = typeof transactions.$inferInsert;
export type TransactionEntry      = typeof transactionEntries.$inferSelect;
export type InsertTransactionEntry = typeof transactionEntries.$inferInsert;
export type Tag                   = typeof tags.$inferSelect;
export type InsertTag             = typeof tags.$inferInsert;
export type AccountMonthlySnapshot     = typeof accountMonthlySnapshots.$inferSelect;
export type InsertAccountMonthlySnapshot = typeof accountMonthlySnapshots.$inferInsert;
