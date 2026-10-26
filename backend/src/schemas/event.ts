import { z } from 'zod';

const SUPPORTED_CURRENCIES = new Set([
  'AED',
  'AUD',
  'BDT',
  'BRL',
  'CAD',
  'CHF',
  'CNY',
  'DKK',
  'EGP',
  'EUR',
  'GBP',
  'GHS',
  'HKD',
  'IDR',
  'ILS',
  'INR',
  'KES',
  'LKR',
  'MXN',
  'MYR',
  'NGN',
  'NOK',
  'NPR',
  'NZD',
  'PHP',
  'PKR',
  'PLN',
  'QAR',
  'SAR',
  'SEK',
  'SGD',
  'THB',
  'TRY',
  'TZS',
  'USD',
  'ZAR',
]);

const futureDateSchema = z.iso.date().refine(
  (value) => {
    const endOfDate = new Date(`${value}T23:59:59.999Z`);
    return endOfDate.getTime() > Date.now();
  },
  { message: 'Event date must be in the future' },
);

const eventFieldsSchema = z.strictObject({
  type: z.enum(['wedding', 'birthday', 'community']),
  title: z.string().trim().min(2).max(120),
  date: futureDateSchema,
  guestCount: z.number().int().min(1).max(2_000),
  totalBudget: z.number().positive().max(100_000_000).multipleOf(0.01),
  currency: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .refine((value) => SUPPORTED_CURRENCIES.has(value), {
      message: 'Currency must be a supported ISO 4217 code',
    }),
  city: z.string().trim().min(2).max(100),
  indoorOutdoor: z.enum(['indoor', 'outdoor', 'either']),
  preferences: z.array(z.string().trim().min(2).max(50)).max(15).default([]),
  audience: z.enum(['adults', 'mixed', 'kids']).optional(),
});

export const createEventSchema = eventFieldsSchema;

export const updateEventSchema = eventFieldsSchema
  .partial()
  .extend({ regenerate: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

export const eventIdParamsSchema = z.strictObject({
  id: z.uuid(),
});

export const taskParamsSchema = eventIdParamsSchema.extend({
  taskId: z
    .string()
    .min(3)
    .max(120)
    .regex(/^[a-z0-9-]+$/),
});

export const budgetParamsSchema = eventIdParamsSchema.extend({
  category: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9-]+$/),
});

export const vendorParamsSchema = eventIdParamsSchema.extend({
  vendorId: z
    .string()
    .min(3)
    .max(120)
    .regex(/^[a-z0-9-]+$/),
});

export const updateTaskSchema = z
  .strictObject({
    status: z.enum(['pending', 'completed']).optional(),
    completed: z.boolean().optional(),
  })
  .refine(
    (value) => value.status !== undefined || value.completed !== undefined,
    {
      message: 'A task status is required',
    },
  );

export const updateBudgetSchema = z.strictObject({
  spent: z.number().nonnegative().max(100_000_000).multipleOf(0.01),
});

export const updateVendorSchema = z
  .strictObject({
    status: z.enum(['to-research', 'contacted', 'quoted', 'booked']).optional(),
    quote: z
      .number()
      .nonnegative()
      .max(100_000_000)
      .multipleOf(0.01)
      .optional(),
  })
  .refine((value) => value.status !== undefined || value.quote !== undefined, {
    message: 'A vendor status or quote is required',
  });

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type UpdateBudgetInput = z.infer<typeof updateBudgetSchema>;
export type UpdateVendorInput = z.infer<typeof updateVendorSchema>;
