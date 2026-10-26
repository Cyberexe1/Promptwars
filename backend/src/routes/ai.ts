import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import {
  chatRequestSchema,
  ideasRequestSchema,
  refineRequestSchema,
  type ChatRequest,
  type IdeasRequest,
  type RefineRequest,
} from '../schemas/ai.js';
import { emptyQuerySchema } from '../schemas/common.js';
import { eventIdParamsSchema } from '../schemas/event.js';
import type { EventAiService } from '../services/ai/ai-service.js';

export function createAiRouter(ai: EventAiService): Router {
  const router = Router({ mergeParams: true });
  const userId = (locals: Record<string, unknown>) => locals.userId as string;
  const eventId = (locals: Record<string, unknown>) =>
    (locals.params as { id: string }).id;

  router.use(validate(eventIdParamsSchema, 'params'));
  router.use(validate(emptyQuerySchema, 'query'));

  router.post(
    '/ideas',
    validate(ideasRequestSchema, 'body'),
    async (_request, response) => {
      response.json(
        await ai.ideas(
          userId(response.locals),
          eventId(response.locals),
          response.locals.body as IdeasRequest,
        ),
      );
    },
  );

  router.post(
    '/refine',
    validate(refineRequestSchema, 'body'),
    async (_request, response) => {
      response.json(
        await ai.refine(
          userId(response.locals),
          eventId(response.locals),
          response.locals.body as RefineRequest,
        ),
      );
    },
  );

  router.post(
    '/chat',
    validate(chatRequestSchema, 'body'),
    async (_request, response) => {
      response.json(
        await ai.chat(
          userId(response.locals),
          eventId(response.locals),
          response.locals.body as ChatRequest,
        ),
      );
    },
  );

  return router;
}
