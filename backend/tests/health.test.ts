import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app.js';

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
