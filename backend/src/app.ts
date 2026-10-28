import cors from 'cors';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { documentClient } from './config/dynamodb.js';
import { env } from './config/env.js';
import { authenticate } from './middleware/authenticate.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import {
  DynamoEventRepository,
  DynamoUserRepository,
} from './repositories/dynamodb.js';
import type {
  EventRepository,
  UserRepository,
} from './repositories/repository.js';
import { createAiRouter } from './routes/ai.js';
import { createAuthRouter } from './routes/auth.js';
import { createEventsRouter } from './routes/events.js';
import { healthRouter } from './routes/health.js';
import { EventAiService } from './services/ai/ai-service.js';
import { BedrockAiModelClient } from './services/ai/bedrock-client.js';
import type { AiModelClient } from './services/ai/model-client.js';
import { AuthService } from './services/auth-service.js';
import { EventService } from './services/event-service.js';
import {
  BcryptPasswordHasher,
  type PasswordHasher,
} from './services/password.js';
import { TokenService } from './services/token.js';

export interface AppDependencies {
  users: UserRepository;
  events: EventRepository;
  now?: () => Date;
  passwords?: PasswordHasher;
  tokens?: TokenService;
  aiModel?: AiModelClient;
  aiRequestLimit?: number;
}

export function createApp(dependencies: AppDependencies) {
  const app = express();
  const now = dependencies.now ?? (() => new Date());
  const passwords = dependencies.passwords ?? new BcryptPasswordHasher();
  const tokens = dependencies.tokens ?? new TokenService(env.JWT_SECRET);
  const aiModel =
    dependencies.aiModel ??
    new BedrockAiModelClient({
      modelId: env.BEDROCK_MODEL_ID,
      region: env.AWS_REGION,
      guardrailId: env.BEDROCK_GUARDRAIL_ID,
      guardrailVersion: env.BEDROCK_GUARDRAIL_VERSION,
    });
  const auth = new AuthService(dependencies.users, passwords, tokens, now);
  const events = new EventService(dependencies.events, now);
  const ai = new EventAiService(events, aiModel, now);

  app.disable('x-powered-by');
  if (env.NODE_ENV === 'production') app.set('trust proxy', 1);
  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        callback(null, !origin || origin === env.FRONTEND_ORIGIN);
      },
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  );
  app.use(express.json({ limit: '100kb' }));

  app.use('/api/health', healthRouter);
  app.use(
    '/api/auth',
    rateLimit({
      windowMs: 15 * 60 * 1_000,
      limit: 20,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
    }),
    createAuthRouter(auth),
  );
  app.use(
    '/api/events/:id/ai',
    authenticate(tokens),
    rateLimit({
      windowMs: 15 * 60 * 1_000,
      limit: dependencies.aiRequestLimit ?? 20,
      keyGenerator: (_request, response) =>
        String(response.locals.userId ?? 'unauthenticated'),
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (_request, response) => {
        response.status(429).json({
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many AI requests; try again later',
          },
        });
      },
    }),
    createAiRouter(ai),
  );
  app.use('/api/events', authenticate(tokens), createEventsRouter(events));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

const users = new DynamoUserRepository(documentClient, env.DDB_TABLE_NAME);
const events = new DynamoEventRepository(documentClient, env.DDB_TABLE_NAME);

export const app = createApp({ users, events });
