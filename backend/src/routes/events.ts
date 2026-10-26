import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import {
  budgetParamsSchema,
  createEventSchema,
  eventIdParamsSchema,
  taskParamsSchema,
  updateBudgetSchema,
  updateEventSchema,
  updateTaskSchema,
  updateVendorSchema,
  vendorParamsSchema,
  type CreateEventInput,
  type UpdateBudgetInput,
  type UpdateEventInput,
  type UpdateTaskInput,
  type UpdateVendorInput,
} from '../schemas/event.js';
import type { EventService } from '../services/event-service.js';
import { emptyQuerySchema } from '../schemas/common.js';

interface EventParams {
  id: string;
}

export function createEventsRouter(events: EventService): Router {
  const router = Router();
  const userId = (locals: Record<string, unknown>) => locals.userId as string;
  router.use(validate(emptyQuerySchema, 'query'));

  router.get('/', async (_request, response) => {
    response.json({ events: await events.list(userId(response.locals)) });
  });

  router.post(
    '/',
    validate(createEventSchema, 'body'),
    async (_request, response) => {
      const plan = await events.create(
        userId(response.locals),
        response.locals.body as CreateEventInput,
      );
      response.status(201).json(plan);
    },
  );

  router.get(
    '/:id',
    validate(eventIdParamsSchema, 'params'),
    async (_request, response) => {
      const { id } = response.locals.params as EventParams;
      response.json(await events.get(userId(response.locals), id));
    },
  );

  router.patch(
    '/:id',
    validate(eventIdParamsSchema, 'params'),
    validate(updateEventSchema, 'body'),
    async (_request, response) => {
      const { id } = response.locals.params as EventParams;
      response.json(
        await events.update(
          userId(response.locals),
          id,
          response.locals.body as UpdateEventInput,
        ),
      );
    },
  );

  router.delete(
    '/:id',
    validate(eventIdParamsSchema, 'params'),
    async (_request, response) => {
      const { id } = response.locals.params as EventParams;
      await events.delete(userId(response.locals), id);
      response.status(204).send();
    },
  );

  router.patch(
    '/:id/tasks/:taskId',
    validate(taskParamsSchema, 'params'),
    validate(updateTaskSchema, 'body'),
    async (_request, response) => {
      const { id, taskId } = response.locals.params as EventParams & {
        taskId: string;
      };
      response.json({
        task: await events.updateTask(
          userId(response.locals),
          id,
          taskId,
          response.locals.body as UpdateTaskInput,
        ),
      });
    },
  );

  router.patch(
    '/:id/budget/:category',
    validate(budgetParamsSchema, 'params'),
    validate(updateBudgetSchema, 'body'),
    async (_request, response) => {
      const { id, category } = response.locals.params as EventParams & {
        category: string;
      };
      response.json(
        await events.updateBudget(
          userId(response.locals),
          id,
          category,
          response.locals.body as UpdateBudgetInput,
        ),
      );
    },
  );

  router.patch(
    '/:id/vendors/:vendorId',
    validate(vendorParamsSchema, 'params'),
    validate(updateVendorSchema, 'body'),
    async (_request, response) => {
      const { id, vendorId } = response.locals.params as EventParams & {
        vendorId: string;
      };
      response.json(
        await events.updateVendor(
          userId(response.locals),
          id,
          vendorId,
          response.locals.body as UpdateVendorInput,
        ),
      );
    },
  );

  return router;
}
