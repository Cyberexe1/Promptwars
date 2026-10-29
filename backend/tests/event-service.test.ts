import { beforeEach, describe, expect, it } from 'vitest';
import type { EventPlan } from '../src/domain/models.js';
import { ApiError } from '../src/errors/api-error.js';
import { InMemoryEventRepository } from '../src/repositories/in-memory.js';
import {
  VersionConflictError,
  type EventRepository,
} from '../src/repositories/repository.js';
import type { CreateEventInput } from '../src/schemas/event.js';
import { EventService } from '../src/services/event-service.js';

const TODAY = new Date('2026-10-26T12:00:00.000Z');
const input: CreateEventInput = {
  type: 'wedding',
  title: 'Alex and Sam',
  date: '2027-03-20',
  guestCount: 100,
  totalBudget: 20_000,
  currency: 'USD',
  city: 'Portland',
  indoorOutdoor: 'outdoor',
  preferences: ['vegetarian'],
  audience: 'mixed',
};

async function rejection(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
}

describe('EventService', () => {
  let repository: InMemoryEventRepository;
  let service: EventService;
  let plan: EventPlan;

  beforeEach(async () => {
    repository = new InMemoryEventRepository();
    service = new EventService(repository, () => TODAY);
    plan = await service.create('user-1', input);
  });

  it('keeps events private to their owner', async () => {
    expect((await service.list('user-1')).map((event) => event.id)).toEqual([
      plan.event.id,
    ]);
    expect(await service.list('user-2')).toEqual([]);
    expect((await rejection(service.get('user-2', plan.event.id))).status).toBe(
      404,
    );
    expect(
      (await rejection(service.delete('user-2', plan.event.id))).status,
    ).toBe(404);
  });

  describe('update', () => {
    it('regenerates the plan but keeps the user’s progress', async () => {
      const task = plan.tasks[0]!;
      const budget = plan.budget[0]!;
      const vendor = plan.vendors[0]!;
      await service.updateTask('user-1', plan.event.id, task.id, {
        status: 'completed',
      });
      await service.updateBudget('user-1', plan.event.id, budget.category, {
        spent: 123.45,
      });
      await service.updateVendor('user-1', plan.event.id, vendor.id, {
        status: 'quoted',
        quote: 999,
      });

      const updated = await service.update('user-1', plan.event.id, {
        guestCount: 150,
      });

      expect(updated.event.guestCount).toBe(150);
      expect(updated.event.version).toBeGreaterThan(plan.event.version);
      expect(updated.tasks.find((item) => item.id === task.id)?.status).toBe(
        'completed',
      );
      expect(
        updated.budget.find((item) => item.category === budget.category)?.spent,
      ).toBe(123.45);
      expect(
        updated.vendors.find((item) => item.id === vendor.id),
      ).toMatchObject({
        status: 'quoted',
        quote: 999,
      });
    });

    it('can change details without regenerating, or regenerate without changes', async () => {
      const renamed = await service.update('user-1', plan.event.id, {
        title: 'Renamed',
        regenerate: false,
      });
      expect(renamed.event.title).toBe('Renamed');
      expect(renamed.tasks.map((task) => task.id)).toEqual(
        plan.tasks.map((task) => task.id),
      );

      const regenerated = await service.update('user-1', plan.event.id, {
        regenerate: true,
      });
      expect(regenerated.event.version).toBe(renamed.event.version + 1);

      const untouched = await service.update('user-1', plan.event.id, {});
      expect(untouched.event.title).toBe('Renamed');
    });

    it('reports a missing event', async () => {
      expect(
        (await rejection(service.update('user-1', 'missing', { title: 'x' })))
          .status,
      ).toBe(404);
    });
  });

  describe('deletion', () => {
    it('removes the plan', async () => {
      await service.delete('user-1', plan.event.id);
      expect(await repository.getPlan('user-1', plan.event.id)).toBeNull();
    });

    it('reports 404 if the plan vanished and 409 if it changed concurrently', async () => {
      const vanishing: EventRepository = {
        ...repository,
        getPlan: repository.getPlan.bind(repository),
        deletePlan: async () => false,
      } as EventRepository;
      const missing = new EventService(vanishing, () => TODAY);
      expect(
        (await rejection(missing.delete('user-1', plan.event.id))).status,
      ).toBe(404);

      const racing: EventRepository = {
        ...repository,
        getPlan: repository.getPlan.bind(repository),
        deletePlan: async () => {
          throw new VersionConflictError();
        },
      } as EventRepository;
      const conflicted = new EventService(racing, () => TODAY);
      expect(
        (await rejection(conflicted.delete('user-1', plan.event.id))).status,
      ).toBe(409);
    });
  });

  describe('task updates', () => {
    it('accepts a status or the legacy completed flag', async () => {
      const id = plan.tasks[0]!.id;
      expect(
        (
          await service.updateTask('user-1', plan.event.id, id, {
            completed: true,
          })
        ).status,
      ).toBe('completed');
      expect(
        (
          await service.updateTask('user-1', plan.event.id, id, {
            completed: false,
          })
        ).status,
      ).toBe('pending');
      expect(
        (
          await service.updateTask('user-1', plan.event.id, id, {
            status: 'completed',
          })
        ).status,
      ).toBe('completed');
    });

    it('rejects unknown tasks and converts races into conflicts', async () => {
      expect(
        (
          await rejection(
            service.updateTask('user-1', plan.event.id, 'nope', {
              status: 'completed',
            }),
          )
        ).status,
      ).toBe(404);

      const gone: EventRepository = {
        ...repository,
        getPlan: repository.getPlan.bind(repository),
        updateTask: async () => null,
      } as EventRepository;
      expect(
        (
          await rejection(
            new EventService(gone, () => TODAY).updateTask(
              'user-1',
              plan.event.id,
              plan.tasks[0]!.id,
              { status: 'completed' },
            ),
          )
        ).status,
      ).toBe(404);

      const racing: EventRepository = {
        ...repository,
        getPlan: repository.getPlan.bind(repository),
        updateTask: async () => {
          throw new VersionConflictError();
        },
      } as EventRepository;
      expect(
        (
          await rejection(
            new EventService(racing, () => TODAY).updateTask(
              'user-1',
              plan.event.id,
              plan.tasks[0]!.id,
              { status: 'completed' },
            ),
          )
        ).status,
      ).toBe(409);
    });
  });

  describe('budget updates', () => {
    it('warns only when spending passes the allocation', async () => {
      const item = plan.budget[0]!;
      const under = await service.updateBudget(
        'user-1',
        plan.event.id,
        item.category,
        { spent: item.allocated },
      );
      expect(under.warning).toBeNull();
      const over = await service.updateBudget(
        'user-1',
        plan.event.id,
        item.category,
        { spent: item.allocated + 10 },
      );
      expect(over.warning).toContain('exceeds its allocation by 10.00');
    });

    it('rejects unknown categories, including ones that disappear mid-request', async () => {
      expect(
        (
          await rejection(
            service.updateBudget('user-1', plan.event.id, 'nope', { spent: 1 }),
          )
        ).status,
      ).toBe(404);
      const gone: EventRepository = {
        ...repository,
        getPlan: repository.getPlan.bind(repository),
        updateBudget: async () => null,
      } as EventRepository;
      expect(
        (
          await rejection(
            new EventService(gone, () => TODAY).updateBudget(
              'user-1',
              plan.event.id,
              plan.budget[0]!.category,
              { spent: 1 },
            ),
          )
        ).status,
      ).toBe(404);
    });
  });

  describe('vendor updates', () => {
    it('keeps the current status when only a quote is sent', async () => {
      const vendor = plan.vendors[0]!;
      await service.updateVendor('user-1', plan.event.id, vendor.id, {
        status: 'contacted',
      });
      const result = await service.updateVendor(
        'user-1',
        plan.event.id,
        vendor.id,
        { quote: 100 },
      );
      expect(result.vendor).toMatchObject({ status: 'contacted', quote: 100 });
      expect(Array.isArray(result.warnings)).toBe(true);
    });

    it('rejects unknown vendors, including ones that disappear mid-request', async () => {
      expect(
        (
          await rejection(
            service.updateVendor('user-1', plan.event.id, 'nope', {
              status: 'booked',
            }),
          )
        ).status,
      ).toBe(404);
      const gone: EventRepository = {
        ...repository,
        getPlan: repository.getPlan.bind(repository),
        updateVendor: async () => null,
      } as EventRepository;
      expect(
        (
          await rejection(
            new EventService(gone, () => TODAY).updateVendor(
              'user-1',
              plan.event.id,
              plan.vendors[0]!.id,
              { status: 'booked' },
            ),
          )
        ).status,
      ).toBe(404);
    });
  });

  describe('refinement', () => {
    const category = (index: number) => plan.budget[index]!.category;
    const apply = (
      changes: Partial<EventPlan> | Record<string, unknown>,
      baseVersion?: number,
    ) =>
      service.applyRefinement('user-1', plan.event.id, {
        baseVersion: baseVersion ?? plan.event.version,
        proposedChanges: { budgetShifts: [], newTasks: [], ...changes },
      } as never);

    it('moves budget between categories and adds tasks in the right phases', async () => {
      const taskCategory = category(0);
      const result = await apply({
        budgetShifts: [
          { category: category(0), delta: -100, reason: 'Trim' },
          { category: category(1), delta: 100, reason: 'Boost' },
        ],
        newTasks: [
          {
            title: 'Event week task',
            category: taskCategory,
            dueDate: '2027-03-15',
            reason: 'a',
          },
          {
            title: 'Final weeks task',
            category: taskCategory,
            dueDate: '2027-03-01',
            reason: 'b',
          },
          {
            title: 'This month task',
            category: taskCategory,
            dueDate: '2026-11-10',
            reason: 'c',
          },
          {
            title: 'Far future task',
            category: taskCategory,
            dueDate: '2027-01-10',
            reason: 'd',
          },
          {
            title: 'Due today task',
            category: taskCategory,
            dueDate: '2026-10-26',
            reason: 'e',
          },
        ],
      });

      const phaseOf = (title: string) =>
        result.tasks.find((task) => task.title === title)?.phase;
      expect(phaseOf('Event week task')).toBe('Event week');
      expect(phaseOf('Final weeks task')).toBe('Final weeks');
      expect(phaseOf('This month task')).toBe('This month');
      expect(phaseOf('Far future task')).toBe('Now');
      expect(phaseOf('Due today task')).toBe('This month');
      expect(result.event.version).toBe(plan.event.version + 1);
      expect(result.budget[0]!.allocated).toBe(plan.budget[0]!.allocated - 100);
      expect(result.budget[1]!.allocated).toBe(plan.budget[1]!.allocated + 100);
    });

    it('rejects stale versions, empty proposals, and invalid proposals', async () => {
      expect(
        (
          await rejection(
            apply(
              {
                newTasks: [
                  {
                    title: 'x',
                    category: category(0),
                    dueDate: '2027-01-01',
                    reason: 'r',
                  },
                ],
              },
              99,
            ),
          )
        ).status,
      ).toBe(409);
      expect((await rejection(apply({}))).status).toBe(400);
      expect(
        (
          await rejection(
            apply({
              budgetShifts: [{ category: 'nope', delta: 5, reason: 'r' }],
            }),
          )
        ).status,
      ).toBe(400);
      expect(
        (
          await rejection(
            apply({
              newTasks: [
                {
                  title: 'Past',
                  category: category(0),
                  dueDate: '2020-01-01',
                  reason: 'r',
                },
              ],
            }),
          )
        ).status,
      ).toBe(400);
    });

    it('refuses refinements that would exceed the storage limit', async () => {
      const crowded: EventRepository = {
        ...repository,
        getPlan: async () => ({
          ...plan,
          tasks: Array.from({ length: 100 }, (_, index) => ({
            ...plan.tasks[0]!,
            id: `t${index}`,
          })),
        }),
      } as EventRepository;
      const error = await rejection(
        new EventService(crowded, () => TODAY).applyRefinement(
          'user-1',
          plan.event.id,
          {
            baseVersion: plan.event.version,
            proposedChanges: {
              budgetShifts: [],
              newTasks: [
                {
                  title: 'One more',
                  category: category(0),
                  dueDate: '2027-01-01',
                  reason: 'r',
                },
              ],
            },
          } as never,
        ),
      );
      expect(error.status).toBe(400);
      expect(error.message).toContain('too large');
    });

    it('turns concurrent writes into conflicts', async () => {
      const racing: EventRepository = {
        ...repository,
        getPlan: repository.getPlan.bind(repository),
        savePlan: async () => {
          throw new VersionConflictError();
        },
      } as EventRepository;
      const error = await rejection(
        new EventService(racing, () => TODAY).applyRefinement(
          'user-1',
          plan.event.id,
          {
            baseVersion: plan.event.version,
            proposedChanges: {
              budgetShifts: [],
              newTasks: [
                {
                  title: 'Racy',
                  category: category(0),
                  dueDate: '2027-01-01',
                  reason: 'r',
                },
              ],
            },
          } as never,
        ),
      );
      expect(error.status).toBe(409);
    });
  });

  it('flags tasks that become overdue and spending beyond allocations', async () => {
    const later = new EventService(
      repository,
      () => new Date('2027-03-01T00:00:00.000Z'),
    );
    const item = plan.budget[0]!;
    await service.updateBudget('user-1', plan.event.id, item.category, {
      spent: item.allocated + 50,
    });

    const view = await later.get('user-1', plan.event.id);

    expect(view.tasks.some((task) => task.overdue && task.urgent)).toBe(true);
    expect(
      view.warnings.some((warning) =>
        warning.includes('exceeds its allocation by 50.00'),
      ),
    ).toBe(true);
  });
});
