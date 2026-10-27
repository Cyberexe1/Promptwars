import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import {
  InMemoryEventRepository,
  InMemoryUserRepository,
} from '../src/repositories/in-memory.js';
import { VersionConflictError } from '../src/repositories/repository.js';
import type { EventPlan } from '../src/domain/models.js';
import type {
  AiGenerateRequest,
  AiModelClient,
} from '../src/services/ai/model-client.js';
import type { PasswordHasher } from '../src/services/password.js';

const passwords: PasswordHasher = {
  async hash(password) {
    return `test-hash:${password}`;
  },
  async verify(password, passwordHash) {
    return passwordHash === `test-hash:${password}`;
  },
};

class UnavailableModel implements AiModelClient {
  calls = 0;

  async generate(_input: AiGenerateRequest): Promise<string> {
    this.calls += 1;
    throw new Error('AI model unavailable');
  }
}

class ConflictEventRepository extends InMemoryEventRepository {
  private conflictOnNextVersionedSave = false;

  conflictNextSave(): void {
    this.conflictOnNextVersionedSave = true;
  }

  override async savePlan(
    plan: EventPlan,
    expectedVersion?: number,
  ): Promise<void> {
    if (expectedVersion !== undefined && this.conflictOnNextVersionedSave) {
      this.conflictOnNextVersionedSave = false;
      throw new VersionConflictError();
    }
    await super.savePlan(plan, expectedVersion);
  }
}

const eventInput = {
  type: 'wedding',
  title: 'Refinement test wedding',
  date: '2099-06-12',
  guestCount: 100,
  totalBudget: 20_000,
  currency: 'USD',
  city: 'Portland',
  indoorOutdoor: 'indoor',
  preferences: ['vegetarian'],
  audience: 'mixed',
};

const authorization = (token: string) => ({
  Authorization: `Bearer ${token}`,
});

async function signup(app: ReturnType<typeof createApp>, email: string) {
  const response = await request(app).post('/api/auth/signup').send({
    email,
    password: 'StrongPass1',
  });
  expect(response.status).toBe(201);
  return response.body.token as string;
}

describe('refinement confirmation API', () => {
  let app: ReturnType<typeof createApp>;
  let events: ConflictEventRepository;
  let model: UnavailableModel;
  let token: string;
  let plan: EventPlan;
  let currentTime: string;

  beforeEach(async () => {
    events = new ConflictEventRepository();
    model = new UnavailableModel();
    currentTime = '2026-10-26T12:00:00.000Z';
    app = createApp({
      users: new InMemoryUserRepository(),
      events,
      passwords,
      aiModel: model,
      aiRequestLimit: 0,
      now: () => new Date(currentTime),
    });
    token = await signup(app, 'owner@example.com');
    const created = await request(app)
      .post('/api/events')
      .set(authorization(token))
      .send(eventInput);
    expect(created.status).toBe(201);
    plan = created.body as EventPlan;
  });

  function balancedProposal() {
    const source = plan.budget[0];
    const destination = plan.budget[1];
    return {
      budgetShifts: [
        {
          category: source.category,
          delta: -12.34,
          reason: 'Use the existing package.',
        },
        {
          category: destination.category,
          delta: 12.34,
          reason: 'Fund the custom detail.',
        },
      ],
      newTasks: [
        {
          title: 'Confirm custom vegetarian menu',
          category: destination.category,
          dueDate: '2099-06-05',
          reason: 'The custom menu needs confirmation.',
        },
      ],
    };
  }

  async function apply(body: unknown, authToken = token) {
    return request(app)
      .post(`/api/events/${plan.event.id}/refinements/apply`)
      .set(authorization(authToken))
      .send(body);
  }

  it('atomically conserves allocations, appends a server-owned task, and increments the plan version without AI', async () => {
    currentTime = '2026-10-27T12:00:00.000Z';
    const originalTotalCents = plan.budget.reduce(
      (total, item) => total + Math.round(item.allocated * 100),
      0,
    );
    const originalBudgets = new Map(
      plan.budget.map((item) => [item.category, item]),
    );

    const response = await apply({
      baseVersion: plan.event.version,
      proposedChanges: balancedProposal(),
    });

    expect(response.status).toBe(200);
    const applied = response.body as EventPlan;
    expect(applied.event.version).toBe(plan.event.version + 1);
    expect(applied.event.updatedAt).toBe(currentTime);
    expect(
      applied.budget.reduce(
        (total, item) => total + Math.round(item.allocated * 100),
        0,
      ),
    ).toBe(originalTotalCents);

    for (const item of applied.budget) {
      const original = originalBudgets.get(item.category)!;
      const shift = balancedProposal().budgetShifts.find(
        (candidate) => candidate.category === item.category,
      );
      expect(Math.round(item.allocated * 100)).toBe(
        Math.round(original.allocated * 100) +
          Math.round((shift?.delta ?? 0) * 100),
      );
      expect(item.spent).toBe(original.spent);
      expect(item.notes).toEqual(original.notes);
    }

    const customTask = applied.tasks.find(
      (task) => task.title === 'Confirm custom vegetarian menu',
    );
    expect(customTask).toEqual({
      id: expect.stringMatching(
        /^task-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      ),
      title: 'Confirm custom vegetarian menu',
      category: plan.budget[1].category,
      dueDate: '2099-06-05',
      status: 'pending',
      priority: 2,
      phase: 'Event week',
      urgent: false,
      overdue: false,
    });
    expect(customTask).not.toHaveProperty('reason');
    expect(model.calls).toBe(0);

    const persisted = await request(app)
      .get(`/api/events/${plan.event.id}`)
      .set(authorization(token));
    expect(persisted.status).toBe(200);
    expect(persisted.body).toEqual(applied);
  });

  it('returns the existing conflict for a stale base version and a replayed retry', async () => {
    const body = {
      baseVersion: plan.event.version,
      proposedChanges: balancedProposal(),
    };
    const first = await apply(body);
    expect(first.status).toBe(200);

    const retry = await apply(body);
    expect(retry.status).toBe(409);
    expect(retry.body).toEqual({
      error: {
        code: 'CONFLICT',
        message:
          'This event changed while the request was running. Refresh and try again.',
      },
    });

    const persisted = await request(app)
      .get(`/api/events/${plan.event.id}`)
      .set(authorization(token));
    expect(persisted.body.event.version).toBe(plan.event.version + 1);
    expect(
      persisted.body.tasks.filter(
        (task: { title: string }) =>
          task.title === 'Confirm custom vegetarian menu',
      ),
    ).toHaveLength(1);
  });

  it('returns the same conflict when the atomic repository write loses a race', async () => {
    events.conflictNextSave();
    const response = await apply({
      baseVersion: plan.event.version,
      proposedChanges: balancedProposal(),
    });

    expect(response.status).toBe(409);
    expect(response.body.error.message).toBe(
      'This event changed while the request was running. Refresh and try again.',
    );
    const persisted = await events.getPlan(plan.event.userId, plan.event.id);
    expect(persisted).toEqual(plan);
  });

  it('keeps cross-user event existence private', async () => {
    const otherToken = await signup(app, 'other@example.com');
    const response = await apply(
      {
        baseVersion: plan.event.version,
        proposedChanges: balancedProposal(),
      },
      otherToken,
    );

    expect(response.status).toBe(404);
    expect(response.body.error).toEqual({
      code: 'NOT_FOUND',
      message: 'Event not found',
    });
  });

  it.each([
    [
      'an unknown category',
      () => ({
        budgetShifts: [
          { category: 'unknown', delta: 0, reason: 'Tampered category.' },
        ],
        newTasks: [],
      }),
    ],
    [
      'unbalanced shifts',
      () => ({
        budgetShifts: [
          {
            category: plan.budget[0].category,
            delta: 1,
            reason: 'Missing balancing change.',
          },
        ],
        newTasks: [],
      }),
    ],
    [
      'a task date outside today through event date',
      () => ({
        budgetShifts: [],
        newTasks: [
          {
            title: 'Already expired',
            category: plan.budget[0].category,
            dueDate: '2026-10-25',
            reason: 'This date is no longer valid.',
          },
        ],
      }),
    ],
    ['an empty proposal', () => ({ budgetShifts: [], newTasks: [] })],
    [
      'client-owned task fields',
      () => ({
        budgetShifts: [],
        newTasks: [
          {
            title: 'Tampered task',
            category: plan.budget[0].category,
            dueDate: '2099-06-01',
            reason: 'Attempt to control server fields.',
            id: 'client-id',
            status: 'completed',
            priority: 1,
          },
        ],
      }),
    ],
  ])('rejects %s with 400', async (_name, proposal) => {
    const response = await apply({
      baseVersion: plan.event.version,
      proposedChanges: proposal(),
    });
    expect(response.status).toBe(400);
  });

  it('rejects an allocation that would fall below already-spent funds', async () => {
    const source = plan.budget[0];
    const destination = plan.budget[1];
    const spentResponse = await request(app)
      .patch(`/api/events/${plan.event.id}/budget/${source.category}`)
      .set(authorization(token))
      .send({ spent: source.allocated });
    expect(spentResponse.status).toBe(200);

    const current = await request(app)
      .get(`/api/events/${plan.event.id}`)
      .set(authorization(token));
    const response = await apply({
      baseVersion: current.body.event.version,
      proposedChanges: {
        budgetShifts: [
          {
            category: source.category,
            delta: -1,
            reason: 'Would underfund spent money.',
          },
          {
            category: destination.category,
            delta: 1,
            reason: 'Balanced destination increase.',
          },
        ],
        newTasks: [],
      },
    });

    expect(response.status).toBe(400);
  });

  it('strictly rejects malformed or tampered apply envelopes', async () => {
    const malformedDate = await apply({
      baseVersion: plan.event.version,
      proposedChanges: {
        budgetShifts: [],
        newTasks: [
          {
            title: 'Bad date',
            category: plan.budget[0].category,
            dueDate: '2099-99-99',
            reason: 'Invalid calendar date.',
          },
        ],
      },
    });
    expect(malformedDate.status).toBe(400);

    const extraTopLevel = await apply({
      baseVersion: plan.event.version,
      proposedChanges: balancedProposal(),
      approved: true,
    });
    expect(extraTopLevel.status).toBe(400);

    const nonPositiveVersion = await apply({
      baseVersion: 0,
      proposedChanges: balancedProposal(),
    });
    expect(nonPositiveVersion.status).toBe(400);
  });
});
