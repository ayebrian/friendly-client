import { z } from 'zod';

export const emailSchema = z.object({
  email: z.string().trim().max(2048).pipe(z.email('Enter a valid email address.')),
});

export const codeSchema = z.object({
  code: z.string().regex(/^\d{4}-?\d{4}$/, 'Enter all 8 digits from the email.'),
});
