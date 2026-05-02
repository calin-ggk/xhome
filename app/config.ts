import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL:       z.string().min(1),
  AUTH_USERNAME:      z.string().min(1),
  AUTH_PASSWORD_HASH: z.string().min(1),
  SESSION_SECRET:     z.string().min(32),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Missing required environment variables:', z.treeifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
