import { z } from 'zod';

export const tagFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(50),
});

export const deleteTagSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type TagFormData = z.infer<typeof tagFormSchema>;
