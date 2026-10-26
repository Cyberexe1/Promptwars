import type { EventPlan } from '../../src/domain/models.js';
import { InMemoryEventRepository } from '../../src/repositories/in-memory.js';
import { EventService } from '../../src/services/event-service.js';
import type {
  AiGenerateRequest,
  AiModelClient,
} from '../../src/services/ai/model-client.js';

export const fixedNow = new Date('2029-01-15T12:00:00.000Z');

export function makePlan(overrides: Partial<EventPlan> = {}): EventPlan {
  return {
    event: {
      id: 'event-1',
      userId: 'owner-1',
      version: 3,
      type: 'birthday',
      title: 'Garden celebration',
      date: '2029-06-20',
      guestCount: 40,
      totalBudget: 1_000,
      currency: 'USD',
      city: 'Portland',
      indoorOutdoor: 'outdoor',
      preferences: ['vegetarian', 'low waste'],
      audience: 'mixed',
      createdAt: '2028-12-01T00:00:00.000Z',
      updatedAt: '2029-01-01T00:00:00.000Z',
    },
    budget: [
      {
        category: 'venue',
        label: 'Venue',
        allocated: 500,
        spent: 100,
        notes: [],
      },
      {
        category: 'catering',
        label: 'Catering',
        allocated: 300,
        spent: 50,
        notes: [],
      },
      {
        category: 'activities',
        label: 'Activities',
        allocated: 200,
        spent: 0,
        notes: [],
      },
    ],
    tasks: [
      {
        id: 'book-venue',
        title: 'Confirm venue access',
        category: 'venue',
        dueDate: '2029-02-01',
        status: 'pending',
        priority: 1,
        phase: 'Now',
        urgent: false,
        overdue: false,
      },
    ],
    vendors: [
      {
        id: 'vendor-caterer',
        category: 'catering',
        name: 'Local caterer',
        whyNeeded: 'Prepare guest meals',
        leadTimeDays: 30,
        suggestedBudget: 250,
        questions: ['Can dietary needs be supported?'],
        status: 'to-research',
      },
    ],
    warnings: ['Confirm the outdoor rain plan.'],
    ...overrides,
  };
}

export async function makeEventService(plan = makePlan()) {
  const repository = new InMemoryEventRepository();
  await repository.savePlan(plan);
  return {
    repository,
    events: new EventService(repository, () => fixedNow),
  };
}

export class FakeModel implements AiModelClient {
  readonly requests: AiGenerateRequest[] = [];

  constructor(private readonly outputs: Array<string | Error>) {}

  async generate(request: AiGenerateRequest): Promise<string> {
    this.requests.push(request);
    const output = this.outputs.shift();
    if (output instanceof Error) throw output;
    if (output === undefined) throw new Error('No fake response configured');
    return output;
  }
}

export const validIdeasJson = JSON.stringify({
  ideas: [
    {
      title: 'Seed swap table',
      description: 'Invite guests to exchange labeled seed packets.',
      estimatedCost: 25,
      whyItFits: 'It supports the low-waste preference and outdoor setting.',
    },
  ],
});
