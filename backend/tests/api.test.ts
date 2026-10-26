import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import {
  InMemoryEventRepository,
  InMemoryUserRepository,
} from '../src/repositories/in-memory.js';
import type { PasswordHasher } from '../src/services/password.js';

const passwords: PasswordHasher = {
  async hash(password) {
    return `test-hash:${password}`;
  },
  async verify(password, passwordHash) {
    return passwordHash === `test-hash:${password}`;
  },
};

const eventInput = {
  type: 'wedding',
  title: 'Alex and Sam',
  date: '2099-06-12',
  guestCount: 120,
  totalBudget: 25_000,
  currency: 'usd',
  city: 'Portland',
  indoorOutdoor: 'outdoor',
  preferences: ['vegetarian', 'eco-friendly'],
  audience: 'mixed',
};

async function signup(app: ReturnType<typeof createApp>, email: string) {
  const response = await request(app).post('/api/auth/signup').send({
    email,
    password: 'StrongPass1',
  });
  expect(response.status).toBe(201);
  return response.body.token as string;
}

const authorization = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('Phase 2 API', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp({
      users: new InMemoryUserRepository(),
      events: new InMemoryEventRepository(),
      passwords,
      now: () => new Date('2026-10-26T12:00:00.000Z'),
    });
  });

  it('supports signup and login without exposing account existence on failures', async () => {
    const signupResponse = await request(app).post('/api/auth/signup').send({
      email: 'Planner@Example.com',
      password: 'StrongPass1',
    });

    expect(signupResponse.status).toBe(201);
    expect(signupResponse.body.user.email).toBe('planner@example.com');
    expect(signupResponse.body.token).toEqual(expect.any(String));
    expect(signupResponse.body.user).not.toHaveProperty('passwordHash');

    const duplicate = await request(app).post('/api/auth/signup').send({
      email: 'planner@example.com',
      password: 'StrongPass1',
    });
    expect(duplicate.status).toBe(409);

    const login = await request(app).post('/api/auth/login').send({
      email: 'planner@example.com',
      password: 'StrongPass1',
    });
    expect(login.status).toBe(200);
    expect(login.body.token).toEqual(expect.any(String));

    const wrongPassword = await request(app).post('/api/auth/login').send({
      email: 'planner@example.com',
      password: 'WrongPass1',
    });
    const missingAccount = await request(app).post('/api/auth/login').send({
      email: 'missing@example.com',
      password: 'WrongPass1',
    });
    expect(wrongPassword.status).toBe(401);
    expect(missingAccount.status).toBe(401);
    expect(wrongPassword.body).toEqual(missingAccount.body);
  });

  it('rejects unauthenticated and strictly invalid event requests', async () => {
    expect((await request(app).get('/api/events')).status).toBe(401);

    const token = await signup(app, 'valid@example.com');
    const unknownQuery = await request(app)
      .get('/api/events?unsupported=true')
      .set(authorization(token));
    expect(unknownQuery.status).toBe(400);

    const invalid = await request(app)
      .post('/api/events')
      .set(authorization(token))
      .send({ ...eventInput, unexpected: true });

    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');

    const inventedCurrency = await request(app)
      .post('/api/events')
      .set(authorization(token))
      .send({ ...eventInput, currency: 'ZZZ' });
    expect(inventedCurrency.status).toBe(400);
  });

  it('creates a contextual plan and supports every event mutation endpoint', async () => {
    const token = await signup(app, 'owner@example.com');
    const created = await request(app)
      .post('/api/events')
      .set(authorization(token))
      .send(eventInput);

    expect(created.status).toBe(201);
    expect(created.body.event.currency).toBe('USD');
    expect(created.body.budget.length).toBeGreaterThan(0);
    expect(created.body.tasks.length).toBeGreaterThan(0);
    expect(created.body.vendors.length).toBeGreaterThan(0);
    expect(
      created.body.budget.reduce(
        (sum: number, item: { allocated: number }) => sum + item.allocated,
        0,
      ),
    ).toBe(eventInput.totalBudget);

    const eventId = created.body.event.id as string;
    const taskId = created.body.tasks[0].id as string;
    const category = created.body.budget[0].category as string;
    const vendorId = created.body.vendors[0].id as string;

    const list = await request(app)
      .get('/api/events')
      .set(authorization(token));
    expect(list.status).toBe(200);
    expect(list.body.events).toHaveLength(1);

    const detail = await request(app)
      .get(`/api/events/${eventId}`)
      .set(authorization(token));
    expect(detail.status).toBe(200);

    const task = await request(app)
      .patch(`/api/events/${eventId}/tasks/${taskId}`)
      .set(authorization(token))
      .send({ completed: true });
    expect(task.status).toBe(200);
    expect(task.body.task.status).toBe('completed');

    const spending = await request(app)
      .patch(`/api/events/${eventId}/budget/${category}`)
      .set(authorization(token))
      .send({ spent: 999.99 });
    expect(spending.status).toBe(200);
    expect(spending.body.budget.spent).toBe(999.99);

    const vendor = await request(app)
      .patch(`/api/events/${eventId}/vendors/${vendorId}`)
      .set(authorization(token))
      .send({ status: 'quoted', quote: 500 });
    expect(vendor.status).toBe(200);
    expect(vendor.body.vendor).toMatchObject({ status: 'quoted', quote: 500 });

    const updated = await request(app)
      .patch(`/api/events/${eventId}`)
      .set(authorization(token))
      .send({ guestCount: 150 });
    expect(updated.status).toBe(200);
    expect(updated.body.event.guestCount).toBe(150);
    expect(
      updated.body.tasks.find((item: { id: string }) => item.id === taskId)
        .status,
    ).toBe('completed');
    expect(
      updated.body.budget.find(
        (item: { category: string }) => item.category === category,
      ).spent,
    ).toBe(999.99);

    const deleted = await request(app)
      .delete(`/api/events/${eventId}`)
      .set(authorization(token));
    expect(deleted.status).toBe(204);
    expect(
      (
        await request(app)
          .get(`/api/events/${eventId}`)
          .set(authorization(token))
      ).status,
    ).toBe(404);
  });

  it('enforces event ownership for reads and nested mutations', async () => {
    const ownerToken = await signup(app, 'owner@example.com');
    const otherToken = await signup(app, 'other@example.com');
    const created = await request(app)
      .post('/api/events')
      .set(authorization(ownerToken))
      .send(eventInput);
    const eventId = created.body.event.id as string;
    const taskId = created.body.tasks[0].id as string;

    expect(
      (
        await request(app)
          .get(`/api/events/${eventId}`)
          .set(authorization(otherToken))
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .patch(`/api/events/${eventId}/tasks/${taskId}`)
          .set(authorization(otherToken))
          .send({ completed: true })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .delete(`/api/events/${eventId}`)
          .set(authorization(otherToken))
      ).status,
    ).toBe(404);
  });
});
