import { z } from 'zod';

export const emailSchema = z.string().email().transform((e) => e.toLowerCase().trim());

export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(200);

export const authActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('signin'),
    email: emailSchema,
    password: z.string().min(1).max(200),
  }),
  z.object({ action: z.literal('logout') }),
  z.object({
    action: z.literal('request-reset'),
    email: emailSchema,
  }),
  z.object({
    action: z.literal('complete-setup'),
    token: z.string().min(1),
    password: passwordSchema,
  }),
  z.object({
    action: z.literal('complete-reset'),
    token: z.string().min(1),
    password: passwordSchema,
  }),
]);

export const createInvestorSchema = z.object({
  name: z.string().min(1).max(120),
  email: emailSchema,
  principal: z.coerce.number().nonnegative().default(0),
  rate: z.string().max(60).default(''),
  termMonths: z.coerce.number().int().nonnegative().default(0),
});

export const updateInvestorSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  principal: z.coerce.number().nonnegative().optional(),
  rate: z.string().max(60).optional(),
  termMonths: z.coerce.number().int().nonnegative().optional(),
});
