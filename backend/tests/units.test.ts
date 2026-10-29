import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/errors/api-error.js';
import {
  errorHandler,
  notFoundHandler,
} from '../src/middleware/error-handler.js';
import { BcryptPasswordHasher } from '../src/services/password.js';
import { TokenService } from '../src/services/token.js';

describe('password hasher', () => {
  it('hashes with a salt and verifies only the right password', async () => {
    const hasher = new BcryptPasswordHasher(4);
    const first = await hasher.hash('StrongPass1');
    const second = await hasher.hash('StrongPass1');

    expect(first).not.toBe(second);
    await expect(hasher.verify('StrongPass1', first)).resolves.toBe(true);
    await expect(hasher.verify('WrongPass1', first)).resolves.toBe(false);
  });
});

describe('token service', () => {
  const secret = 'a-unit-test-secret-of-at-least-32-chars';

  it('round-trips the subject', async () => {
    const tokens = new TokenService(secret);
    await expect(tokens.verify(await tokens.create('user-9'))).resolves.toBe(
      'user-9',
    );
  });

  it('rejects tokens signed with another secret, garbage, and no subject', async () => {
    const tokens = new TokenService(secret);
    const other = new TokenService('another-unit-test-secret-32-chars!!');

    await expect(
      tokens.verify(await other.create('user-9')),
    ).rejects.toMatchObject({ status: 401 });
    await expect(tokens.verify('not-a-token')).rejects.toMatchObject({
      status: 401,
    });
    await expect(tokens.verify(await tokens.create(''))).rejects.toMatchObject({
      status: 401,
    });
  });
});

describe('error handling', () => {
  const build = (thrower: () => never) => {
    const app = express();
    app.get('/boom', () => thrower());
    app.use(notFoundHandler);
    app.use(errorHandler);
    return app;
  };

  it('returns API errors with their code, message, and details', async () => {
    const response = await request(
      build(() => {
        throw ApiError.badRequest('Nope', [{ field: 'a', message: 'bad' }]);
      }),
    ).get('/boom');

    expect(response.status).toBe(400);
    expect(response.body.error).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Nope',
      details: [{ field: 'a', message: 'bad' }],
    });
  });

  it('omits details when none exist and hides internals for unknown errors', async () => {
    const known = await request(
      build(() => {
        throw ApiError.conflict('Changed');
      }),
    ).get('/boom');
    expect(known.status).toBe(409);
    expect(known.body.error).not.toHaveProperty('details');

    const unknown = await request(
      build(() => {
        throw new Error('secret database detail');
      }),
    ).get('/boom');
    expect(unknown.status).toBe(500);
    expect(JSON.stringify(unknown.body)).not.toContain(
      'secret database detail',
    );
    expect(unknown.body.error.code).toBe('INTERNAL_ERROR');
  });

  it('returns a JSON 404 for unknown routes', async () => {
    const response = await request(build(() => undefined as never)).get(
      '/nope',
    );
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('builds field-level validation details from Zod errors', async () => {
    const { z } = await import('zod');
    const result = z.object({ a: z.string() }).safeParse({ a: 1 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(ApiError.fromZod(result.error).details).toEqual([
        { field: 'a', message: expect.any(String) },
      ]);
    }
  });
});

describe('environment validation', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('rejects a missing or short JWT secret', async () => {
    vi.resetModules();
    vi.stubEnv('JWT_SECRET', 'too-short');
    await expect(import('../src/config/env.js')).rejects.toThrow(
      'Invalid environment configuration',
    );
  });

  it('refuses the example secret in production', async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRET', 'change-this-to-at-least-32-characters');
    await expect(import('../src/config/env.js')).rejects.toThrow(
      'replace the example JWT_SECRET',
    );
  });

  it('accepts a valid configuration and applies defaults', async () => {
    vi.resetModules();
    vi.stubEnv('JWT_SECRET', 'a-valid-secret-with-more-than-32-chars');
    vi.stubEnv('DDB_ENDPOINT', '');
    const { env } = await import('../src/config/env.js');
    expect(env.PORT).toBeGreaterThan(0);
    expect(env.DDB_ENDPOINT).toBeUndefined();
  });
});
