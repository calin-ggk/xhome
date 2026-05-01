import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Missing required environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

export const BASE_CURRENCY = 'RON';
