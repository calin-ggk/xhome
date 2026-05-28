// Copy this file to init.local.ts and fill in your own data.
// init.local.ts is gitignored.
import type { AccountDef } from './init';

export const CURRENCIES = [
  { code: 'EUR', name: 'Euro',           symbol: '€',   decimalPlaces: 2 },
  { code: 'RON', name: 'Romanian Leu',   symbol: 'lei', decimalPlaces: 2 },
  { code: 'USD', name: 'US Dollar',      symbol: '$',   decimalPlaces: 2 },
];

export const ACCOUNTS: AccountDef[] = [
  // ── Assets ──
  { category: 'asset/bank/current-ron',    name: 'Current RON',  type: 'debit', accountType: 'simple', currency: 'RON', isReconcilable: 1, opening: { amount: '0.00', rate: '0.2009' } },
  { category: 'asset/bank/current-usd',    name: 'Current USD',  type: 'debit', accountType: 'simple', currency: 'USD', isReconcilable: 1, opening: { amount: '0.00', rate: '0.9250' } },
  { category: 'asset/savings/savings-ron', name: 'Savings RON',  type: 'debit', accountType: 'simple', currency: 'RON', isReconcilable: 1, opening: { amount: '0.00', rate: '0.2009' } },
  {
    category: 'asset/securities/aapl', name: 'AAPL', type: 'debit', accountType: 'security', currency: 'USD',
    security: { ticker: 'AAPL', name: 'Apple Inc.',             type: 'stock', quantityScale: 6 },
    opening: { amount: '0.00', rate: '0.9250', quantity: '0' },
  },
  {
    category: 'asset/securities/amd',  name: 'AMD',  type: 'debit', accountType: 'security', currency: 'USD',
    security: { ticker: 'AMD',  name: 'Advanced Micro Devices', type: 'stock', quantityScale: 6 },
    opening: { amount: '0.00', rate: '0.9250', quantity: '0' },
  },

  // ── Income ──
  { category: 'income/salary',    name: 'Salary',    type: 'credit', accountType: 'simple', currency: 'RON' },
  { category: 'income/dividends', name: 'Dividends', type: 'credit', accountType: 'simple', currency: 'USD' },

  // ── Expenses ──
  { category: 'expense/rent',      name: 'Rent',             type: 'debit', accountType: 'simple', currency: 'RON' },
  { category: 'expense/food',      name: 'Food & Groceries', type: 'debit', accountType: 'simple', currency: 'RON' },
  { category: 'expense/transport', name: 'Transport',        type: 'debit', accountType: 'simple', currency: 'RON' },
  { category: 'expense/utilities', name: 'Utilities',        type: 'debit', accountType: 'simple', currency: 'RON' },
];
