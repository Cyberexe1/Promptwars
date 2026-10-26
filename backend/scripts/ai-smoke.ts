import { env } from '../src/config/env.js';
import { InMemoryEventRepository } from '../src/repositories/in-memory.js';
import { ideasResponseSchema } from '../src/services/ai/outputSchemas.js';
import { EventAiService } from '../src/services/ai/ai-service.js';
import { BedrockAiModelClient } from '../src/services/ai/bedrock-client.js';
import { EventService } from '../src/services/event-service.js';

const now = () => new Date();
const futureDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1_000)
  .toISOString()
  .slice(0, 10);

async function main(): Promise<void> {
  const repository = new InMemoryEventRepository();
  const events = new EventService(repository, now);
  const plan = await events.create('smoke-user', {
    type: 'community',
    title: 'Neighborhood Skills Fair',
    date: futureDate,
    guestCount: 60,
    totalBudget: 2_500,
    currency: 'USD',
    city: 'Sample City',
    indoorOutdoor: 'either',
    preferences: ['accessible', 'low waste'],
    audience: 'mixed',
  });
  const model = new BedrockAiModelClient({
    modelId: env.BEDROCK_MODEL_ID,
    region: env.AWS_REGION,
    guardrailId: env.BEDROCK_GUARDRAIL_ID,
    guardrailVersion: env.BEDROCK_GUARDRAIL_VERSION,
  });
  const ai = new EventAiService(events, model, now);
  const response = await ai.ideas('smoke-user', plan.event.id, {
    category: 'activities',
    extraNotes: 'Prefer inclusive, low-cost activities.',
  });
  const valid = ideasResponseSchema.safeParse(response);

  if (!valid.success || !response.aiAvailable || response.ideas.length === 0) {
    throw new Error('AI smoke test did not return available, valid ideas');
  }
  console.log(`AI smoke test passed with ${response.ideas.length} idea(s).`);
}

main().catch(() => {
  console.error('AI smoke test failed. Check model access and configuration.');
  process.exitCode = 1;
});
