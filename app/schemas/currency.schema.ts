import { z } from 'zod';

export const currencyFormSchema = z.object({
  code:          z.string().min(2).max(10).regex(/^[A-Z][A-Z0-9]*$/, 'Code must be 2–10 uppercase letters or digits'),
  name:          z.string().min(1, 'Name is required').max(100),
  symbol:        z.string().min(1, 'Symbol is required').max(10),
  decimalPlaces: z.coerce.number().int().min(0).max(8),
});

export const deleteCurrencySchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type CurrencyFormData = z.infer<typeof currencyFormSchema>;
