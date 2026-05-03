import { z } from 'zod';

export const ACCOUNT_TYPES    = ['debit', 'credit'] as const;
export const ACCOUNT_SUBTYPES = ['simple', 'deposit', 'security'] as const;

export const accountFormSchema = z.object({
  name:        z.string().min(1, 'Name is required').max(100),
  type:        z.enum(ACCOUNT_TYPES),
  accountType: z.enum(ACCOUNT_SUBTYPES),
  currencyId:  z.coerce.number().int().positive(),
  category:    z.string().min(1).regex(
    /^[a-z]+(?:\/[a-z0-9_-]+)+$/,
    'Use lowercase slash-separated segments, e.g. asset/bank/revolut',
  ),
  isActive:    z.coerce.number().int().min(0).max(1).default(1),
  securityId:  z.coerce.number().int().positive().nullable().optional(),
}).superRefine((data, ctx) => {
  if (data.accountType === 'security' && !data.securityId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['securityId'], message: 'Security account requires a security.' });
  }
  if (data.accountType !== 'security' && data.securityId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['securityId'], message: 'Only security accounts may have a security.' });
  }
});

export const deleteAccountSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type AccountFormData = z.infer<typeof accountFormSchema>;
