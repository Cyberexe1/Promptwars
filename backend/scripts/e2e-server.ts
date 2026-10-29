/**
 * Test-only API server for browser end-to-end tests.
 *
 * Runs the real Express app (routing, validation, auth, planning engine, rate
 * limits, error handling) with in-memory storage and a model client that is
 * always unavailable, so the AI fallback paths are exercised deterministically
 * and nothing reaches AWS.
 */
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import {
  InMemoryEventRepository,
  InMemoryUserRepository,
} from '../src/repositories/in-memory.js';
import { AiModelUnavailableError } from '../src/services/ai/bedrock-client.js';
import { BcryptPasswordHasher } from '../src/services/password.js';

const app = createApp({
  users: new InMemoryUserRepository(),
  events: new InMemoryEventRepository(),
  passwords: new BcryptPasswordHasher(4),
  aiModel: {
    generate: () => Promise.reject(new AiModelUnavailableError()),
  },
});

// Only announce readiness once the socket is really bound.
const server = app.listen(env.PORT, '127.0.0.1');
server.once('listening', () => {
  console.log(`E2E_API_READY ${env.PORT}`);
});
server.once('error', (error) => {
  console.error('E2E_API_FAILED', error.message);
  process.exit(1);
});
