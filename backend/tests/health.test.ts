import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app, createApp } from '../src/app.js';
import {
  InMemoryEventRepository,
  InMemoryUserRepository,
} from '../src/repositories/in-memory.js';

describe('GET /api/health', () => {
  it('reports that the API is healthy', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'ok' });
    expect(new Date(response.body.time).toISOString()).toBe(response.body.time);
  });

  it('applies security headers and allows only the configured browser origin', async () => {
    const allowed = await request(app)
      .get('/api/health')
      .set('Origin', 'http://localhost:5173');
    const blocked = await request(app)
      .get('/api/health')
      .set('Origin', 'https://attacker.invalid');

    expect(allowed.headers['access-control-allow-origin']).toBe(
      'http://localhost:5173',
    );
    expect(allowed.headers['x-content-type-options']).toBe('nosniff');
    expect(allowed.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('transport efficiency and cache safety', () => {
  const build = () =>
    createApp({
      users: new InMemoryUserRepository(),
      events: new InMemoryEventRepository(),
      passwords: {
        hash: async (password) => `hash:${password}`,
        verify: async (password, hash) => hash === `hash:${password}`,
      },
      now: () => new Date('2026-10-26T12:00:00.000Z'),
    });

  it('never lets shared caches store API responses, and never stores tokens', async () => {
    const api = build();
    const health = await request(api).get('/api/health');
    const signup = await request(api)
      .post('/api/auth/signup')
      .send({ email: 'planner@example.com', password: 'StrongPass1' });

    expect(health.headers['cache-control']).toBe('private, no-cache');
    expect(signup.status).toBe(201);
    expect(signup.headers['cache-control']).toBe('no-store');
  });

  it('gzips large plan responses and keeps them smaller on the wire', async () => {
    const api = build();
    const signup = await request(api)
      .post('/api/auth/signup')
      .send({ email: 'planner@example.com', password: 'StrongPass1' });
    const headers = { Authorization: `Bearer ${signup.body.token as string}` };
    const created = await request(api)
      .post('/api/events')
      .set(headers)
      .send({
        type: 'wedding',
        title: 'Alex and Sam',
        date: '2099-06-12',
        guestCount: 120,
        totalBudget: 25_000,
        currency: 'USD',
        city: 'Portland',
        indoorOutdoor: 'outdoor',
        preferences: ['vegetarian'],
        audience: 'mixed',
      });
    expect(created.status).toBe(201);

    const plain = await request(api)
      .get(`/api/events/${created.body.event.id as string}`)
      .set(headers)
      .set('Accept-Encoding', 'identity');
    const gzipped = await request(api)
      .get(`/api/events/${created.body.event.id as string}`)
      .set(headers)
      .set('Accept-Encoding', 'gzip');

    // The plan is well above the 1 KB compression threshold.
    expect(Number(plain.headers['content-length'])).toBeGreaterThan(4_000);
    expect(plain.headers['content-encoding']).toBeUndefined();
    expect(gzipped.headers['content-encoding']).toBe('gzip');
    expect(gzipped.headers.vary).toMatch(/Accept-Encoding/i);
    expect(gzipped.body).toEqual(plain.body);
  });
});
