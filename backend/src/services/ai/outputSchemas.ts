import { z } from 'zod';

const boundedString = (maximum: number) =>
  z.string().trim().min(1).max(maximum);
const moneySchema = z
  .number()
  .finite()
  .nonnegative()
  .max(100_000_000)
  .multipleOf(0.01);
const signedMoneySchema = z
  .number()
  .finite()
  .min(-100_000_000)
  .max(100_000_000)
  .multipleOf(0.01);

export const ideaSchema = z.strictObject({
  title: boundedString(120),
  description: boundedString(500),
  estimatedCost: moneySchema,
  whyItFits: boundedString(300),
});

export const ideasModelSchema = z.strictObject({
  ideas: z.array(ideaSchema).max(5),
});

export const budgetShiftSchema = z.strictObject({
  category: boundedString(80),
  delta: signedMoneySchema,
  reason: boundedString(300),
});

export const newTaskSchema = z.strictObject({
  title: boundedString(120),
  category: boundedString(80),
  dueDate: z.iso.date(),
  reason: boundedString(300),
});

export const refineModelSchema = z.strictObject({
  budgetShifts: z.array(budgetShiftSchema).max(20),
  newTasks: z.array(newTaskSchema).max(20),
});

export const chatModelSchema = z.strictObject({
  reply: boundedString(1_000),
});

export const ideasResponseSchema = ideasModelSchema.extend({
  aiAvailable: z.boolean(),
});

export const refineResponseSchema = z.strictObject({
  proposedChanges: refineModelSchema,
  baseVersion: z.number().int().positive(),
  aiAvailable: z.boolean(),
});

export const chatResponseSchema = chatModelSchema.extend({
  aiAvailable: z.boolean(),
});

export type Idea = z.infer<typeof ideaSchema>;
export type IdeasModelOutput = z.infer<typeof ideasModelSchema>;
export type RefinementProposal = z.infer<typeof refineModelSchema>;
export type ChatModelOutput = z.infer<typeof chatModelSchema>;
export type IdeasResponse = z.infer<typeof ideasResponseSchema>;
export type RefineResponse = z.infer<typeof refineResponseSchema>;
export type ChatResponse = z.infer<typeof chatResponseSchema>;
