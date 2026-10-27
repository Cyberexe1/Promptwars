import { z } from 'zod';
import { refineModelSchema } from '../services/ai/outputSchemas.js';
import { sanitizeText } from '../services/ai/sanitize.js';

const sanitizedTextSchema = z
  .string()
  .transform((value) => sanitizeText(value))
  .pipe(z.string().min(1).max(500));

export const ideasRequestSchema = z.strictObject({
  category: z
    .enum(['theme', 'menu', 'activities', 'decor', 'gifts'])
    .optional(),
  extraNotes: sanitizedTextSchema.optional(),
});

export const refineRequestSchema = z.strictObject({
  instruction: sanitizedTextSchema,
});

export const chatHistoryItemSchema = z.strictObject({
  role: z.enum(['user', 'assistant']),
  content: sanitizedTextSchema,
});

export const chatRequestSchema = z.strictObject({
  message: sanitizedTextSchema,
  history: z.array(chatHistoryItemSchema).max(10).optional(),
});

export const applyRefinementSchema = z.strictObject({
  baseVersion: z.number().int().positive(),
  proposedChanges: refineModelSchema,
});

export type IdeasRequest = z.infer<typeof ideasRequestSchema>;
export type RefineRequest = z.infer<typeof refineRequestSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatHistoryItem = z.infer<typeof chatHistoryItemSchema>;
export type ApplyRefinementInput = z.infer<typeof applyRefinementSchema>;
