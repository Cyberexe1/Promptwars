import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import {
  InMemoryEventRepository,
  InMemoryUserRepository,
} from '../src/repositories/in-memory.js';
import type {
  AiGenerateRequest,
  AiModelClient,
} from '../src/services/ai/model-client.js';
import type { PasswordHasher } from '../src/services/password.js';

class QueueModel implements AiModelClient {
  readonly requests: AiGenerateRequest[] = [];

  constructor(private readonly outputs: Array<string | Error>) {}

  async generate(input: AiGenerateRequest): Promise<string> {
    this.requests.push(input);
    const output = this.outputs.shift();
    if (output instanceof Error) throw output;
    if (output === undefined) throw new Error('No response configured');
    return output;
  }
}

const passwords: PasswordHasher = {
  async hash(password) {
    return `hash:${password}`;
  },
  async verify(password, passwordHash) {
    return passwordHash === `hash:${password}`;
  },
};

const eventInput = {
  type: 'wedding',
  title: 'AI test wedding',
  date: '2099-06-12',
  guestCount: 100,
  totalBudget: 20_000,
  currency: 'USD',
  city: 'Portland',
  indoorOutdoor: 'indoor',
  preferences: ['vegetarian'],
  audience: 'mixed',
};

const ideasJson = JSON.stringify({
  ideas: [
    {
      title: 'Seasonal table cards',
      description: 'Use local foliage and reusable place cards.',
      estimatedCost: 50,
      whyItFits: 'It matches the sustainability preference.',
    },
  ],
});
const refineJson = JSON.stringify({
  budgetShifts: [
    { category: 'venue', delta: -100, reason: 'Choose an off-peak time.' },
    { category: 'catering', delta: 100, reason: 'Improve dietary options.' },
  ],
  newTasks: [
    {
      title: 'Confirm vegetarian menu',
      category: 'catering',
      dueDate: '2099-05-01',
      reason: 'The preference needs vendor confirmation.',
    },
  ],
});
const chatJson = JSON.stringify({ reply: 'Confirm the venue first.' });

async function createUserAndEvent(
  app: ReturnType<typeof createApp>,
  email: string,
) {
  const signup = await request(app).post('/api/auth/signup').send({
    email,
    password: 'StrongPass1',
  });
  const token = signup.body.token as string;
  const created = await request(app)
    .post('/api/events')
    .set('Authorization', `Bearer ${token}`)
    .send(eventInput);
  expect(created.status).toBe(201);
  return { token, eventId: created.body.event.id as string };
}

const authorize = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('Phase 3 AI API', () => {
  let users: InMemoryUserRepository;
  let events: InMemoryEventRepository;

  beforeEach(() => {
    users = new InMemoryUserRepository();
    events = new InMemoryEventRepository();
  });

  function buildApp(model: AiModelClient) {
    return createApp({
      users,
      events,
      passwords,
      aiModel: model,
      now: () => new Date('2026-10-26T12:00:00.000Z'),
    });
  }

  it('serves validated ideas, refinement previews, and context-aware chat', async () => {
    const model = new QueueModel([ideasJson, refineJson, chatJson]);
    const app = buildApp(model);
    const { token, eventId } = await createUserAndEvent(
      app,
      'planner@example.com',
    );

    const ideas = await request(app)
      .post(`/api/events/${eventId}/ai/ideas`)
      .set(authorize(token))
      .send({ category: 'decor', extraNotes: 'Keep it low waste.' });
    expect(ideas.status).toBe(200);
    expect(ideas.body).toMatchObject({ aiAvailable: true });

    const refine = await request(app)
      .post(`/api/events/${eventId}/ai/refine`)
      .set(authorize(token))
      .send({ instruction: 'Improve the vegetarian menu.' });
    expect(refine.status).toBe(200);
    expect(refine.body).toMatchObject({
      aiAvailable: true,
      baseVersion: 1,
      proposedChanges: { budgetShifts: expect.any(Array) },
    });

    const chat = await request(app)
      .post(`/api/events/${eventId}/ai/chat`)
      .set(authorize(token))
      .send({
        message: 'What should I do first?',
        history: [{ role: 'user', content: 'Help me prioritize.' }],
      });
    expect(chat.status).toBe(200);
    expect(chat.body).toEqual({
      reply: 'Confirm the venue first.',
      aiAvailable: true,
    });
    expect(model.requests).toHaveLength(3);
  });

  it('preserves ownership and strict validation before model access', async () => {
    const model = new QueueModel([ideasJson]);
    const app = buildApp(model);
    const owner = await createUserAndEvent(app, 'owner@example.com');
    const other = await createUserAndEvent(app, 'other@example.com');

    const forbidden = await request(app)
      .post(`/api/events/${owner.eventId}/ai/ideas`)
      .set(authorize(other.token))
      .send({});
    expect(forbidden.status).toBe(404);

    const invalid = await request(app)
      .post(`/api/events/${other.eventId}/ai/chat?unexpected=true`)
      .set(authorize(other.token))
      .send({ message: '\u0000  ', injected: true });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
    expect(model.requests).toHaveLength(0);
  });

  it('returns useful HTTP 200 fallbacks when Bedrock is unavailable', async () => {
    const model = new QueueModel([new Error('credentials must stay private')]);
    const app = buildApp(model);
    const { token, eventId } = await createUserAndEvent(
      app,
      'fallback@example.com',
    );

    const response = await request(app)
      .post(`/api/events/${eventId}/ai/chat`)
      .set(authorize(token))
      .send({ message: 'What is next?' });
    expect(response.status).toBe(200);
    expect(response.body.aiAvailable).toBe(false);
    expect(response.body.reply).toContain('Total remaining budget');
    expect(JSON.stringify(response.body)).not.toContain('credentials');
  });

  it('shares a 20-request AI quota per user without affecting another user', async () => {
    const model = new QueueModel(Array(21).fill(chatJson));
    const app = buildApp(model);
    const first = await createUserAndEvent(app, 'first@example.com');
    const second = await createUserAndEvent(app, 'second@example.com');

    for (let count = 0; count < 20; count += 1) {
      const response = await request(app)
        .post(`/api/events/${first.eventId}/ai/chat`)
        .set(authorize(first.token))
        .send({ message: `Question ${count + 1}` });
      expect(response.status).toBe(200);
    }

    const limited = await request(app)
      .post(`/api/events/${first.eventId}/ai/chat`)
      .set(authorize(first.token))
      .send({ message: 'One too many' });
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');

    const independent = await request(app)
      .post(`/api/events/${second.eventId}/ai/chat`)
      .set(authorize(second.token))
      .send({ message: 'My first question' });
    expect(independent.status).toBe(200);
    expect(model.requests).toHaveLength(21);
  });
});
