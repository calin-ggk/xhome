import { z } from 'zod';

export const SECURITY_TYPES = ['stock', 'etf', 'crypto'] as const;

export const securityFormSchema = z.object({
  ticker:        z.string().min(1).max(20).regex(/^[A-Z0-9.\-]+$/, 'securities.invalidTicker'),
  name:          z.string().min(1, 'Name is required').max(100),
  currencyId:    z.coerce.number().int().positive(),
  type:          z.enum(SECURITY_TYPES),
  quantityScale: z.coerce.number().int().min(0).max(10),
});

export const deleteSecuritySchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type SecurityFormData = z.infer<typeof securityFormSchema>;
