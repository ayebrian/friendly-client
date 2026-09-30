import { z } from 'zod';

export const emailSchema = z.object({
  email: z.string().trim().max(2048).pipe(z.email('Введите корректный адрес почты.')),
});

export const codeSchema = z.object({
  code: z.string().regex(/^\d{4}-?\d{4}$/, 'Введите все 8 цифр кода из письма.'),
});
