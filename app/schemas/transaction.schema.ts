import { z } from 'zod';

const numStr = (msg: string) =>
  z.string().regex(/^\d+(\.\d+)?$/, msg);

export const entryFormSchema = z.object({
  accountId:       z.coerce.number().int().positive(),
  side:            z.enum(['debit', 'credit']),
  amountStr:       numStr('transactions.invalidAmount').refine(v => parseFloat(v) > 0, 'transactions.amountPositive'),
  rateStr:         numStr('transactions.invalidRate').refine(v => parseFloat(v) > 0, 'transactions.ratePositive'),
  memo:            z.string().max(500).default(''),
  quantityStr:     z.string().nullish().transform(v => v || null),
  interestRatePct: z.string().nullish().transform(v => v || null),
  maturityDate:    z.string().nullish().transform(v => v || null),
});

export const transactionFormSchema = z.object({
  date:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'transactions.invalidDate'),
  description: z.string().max(500).nullish().transform(v => v || null),
  tagIds:      z.array(z.coerce.number().int().positive()).default([]),
  entries:     z.array(entryFormSchema).min(2, 'transactions.minEntries'),
}).superRefine((data, ctx) => {
  let debitBase = 0;
  let creditBase = 0;
  for (const e of data.entries) {
    const amtCents = Math.round(parseFloat(e.amountStr) * 100);
    const rate     = parseFloat(e.rateStr) || 1;
    if (!isFinite(amtCents) || !isFinite(rate)) continue;
    const base = Math.round(amtCents * rate);
    if (e.side === 'debit') debitBase += base;
    else creditBase += base;
  }
  if (debitBase !== creditBase) {
    ctx.addIssue({
      code: 'custom',
      path: ['entries'],
      message: 'transactions.notBalanced',
    });
  }
});

export const deleteTransactionSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type EntryFormData       = z.infer<typeof entryFormSchema>;
export type TransactionFormData = z.infer<typeof transactionFormSchema>;
