import { randomUUID } from 'node:crypto';
import type {
  EventPlan,
  EventRecord,
  PlanTask,
  TaskPhase,
  VendorItem,
} from '../domain/models.js';
import { ApiError } from '../errors/api-error.js';
import {
  VersionConflictError,
  type EventRepository,
} from '../repositories/repository.js';
import type { ApplyRefinementInput } from '../schemas/ai.js';
import type {
  CreateEventInput,
  UpdateBudgetInput,
  UpdateEventInput,
  UpdateTaskInput,
  UpdateVendorInput,
} from '../schemas/event.js';
import { isSemanticallyValidRefinement } from './ai/ai-service.js';
import { crossCheckVendorQuotes } from './planning/cross-checks.js';
import { generatePlan } from './planning/generate-plan.js';

const DAY_MS = 86_400_000;

const contextKeys = [
  'type',
  'title',
  'date',
  'guestCount',
  'totalBudget',
  'currency',
  'city',
  'indoorOutdoor',
  'preferences',
  'audience',
] as const;

function dateOnlyMilliseconds(value: string): number {
  return Date.parse(`${value}T00:00:00.000Z`);
}

function refinementTaskPhase(
  dueDate: string,
  eventDate: string,
  today: string,
): TaskPhase {
  const dueTime = dateOnlyMilliseconds(dueDate);
  const todayTime = dateOnlyMilliseconds(today);
  const daysUntilDue = Math.floor((dueTime - todayTime) / DAY_MS);
  const offsetDays = Math.floor(
    (dateOnlyMilliseconds(eventDate) - dueTime) / DAY_MS,
  );

  if (daysUntilDue < 0) return 'Now';
  if (offsetDays <= 7) return 'Event week';
  if (offsetDays <= 21) return 'Final weeks';
  if (daysUntilDue <= 30) return 'This month';
  return 'Now';
}

function refinementTask(
  task: ApplyRefinementInput['proposedChanges']['newTasks'][number],
  eventDate: string,
  today: string,
): PlanTask {
  const overdue = task.dueDate < today;
  return {
    id: `task-${randomUUID()}`,
    title: task.title,
    category: task.category,
    dueDate: task.dueDate,
    status: 'pending',
    priority: 2,
    phase: refinementTaskPhase(task.dueDate, eventDate, today),
    urgent: overdue,
    overdue,
  };
}

function preserveProgress(previous: EventPlan, next: EventPlan): EventPlan {
  const budgets = new Map(previous.budget.map((item) => [item.category, item]));
  const tasks = new Map(previous.tasks.map((item) => [item.id, item]));
  const vendors = new Map(previous.vendors.map((item) => [item.id, item]));

  return {
    ...next,
    budget: next.budget.map((item) => ({
      ...item,
      spent: budgets.get(item.category)?.spent ?? 0,
    })),
    tasks: next.tasks.map((item) => ({
      ...item,
      status: tasks.get(item.id)?.status ?? item.status,
    })),
    vendors: next.vendors.map((item) => {
      const old = vendors.get(item.id);
      return old
        ? {
            ...item,
            status: old.status,
            ...(old.quote === undefined ? {} : { quote: old.quote }),
          }
        : item;
    }),
  };
}

export class EventService {
  constructor(
    private readonly events: EventRepository,
    private readonly now: () => Date,
  ) {}

  private async withConflictHandling<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof VersionConflictError) {
        throw ApiError.conflict(
          'This event changed while the request was running. Refresh and try again.',
        );
      }
      throw error;
    }
  }

  private async requirePlan(
    userId: string,
    eventId: string,
  ): Promise<EventPlan> {
    const plan = await this.events.getPlan(userId, eventId);
    if (!plan) throw ApiError.notFound('Event not found');
    return plan;
  }

  private refreshWarnings(plan: EventPlan): EventPlan {
    const today = this.now().toISOString().slice(0, 10);
    const tasks = plan.tasks.map((task) => ({
      ...task,
      overdue: task.status !== 'completed' && task.dueDate < today,
      urgent:
        task.urgent || (task.status !== 'completed' && task.dueDate < today),
    }));
    const dynamicWarnings = crossCheckVendorQuotes(plan.budget, plan.vendors);
    const spendingWarnings = plan.budget
      .filter((item) => item.spent > item.allocated)
      .map(
        (item) =>
          `${item.label} spending exceeds its allocation by ${(item.spent - item.allocated).toFixed(2)}.`,
      );

    return {
      ...plan,
      tasks,
      warnings: [
        ...new Set([...plan.warnings, ...dynamicWarnings, ...spendingWarnings]),
      ],
    };
  }

  list(userId: string) {
    return this.events.listByUser(userId);
  }

  async create(userId: string, input: CreateEventInput): Promise<EventPlan> {
    const timestamp = this.now().toISOString();
    const event: EventRecord = {
      id: randomUUID(),
      userId,
      version: 1,
      ...input,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const plan = generatePlan(event, this.now());
    await this.withConflictHandling(() => this.events.savePlan(plan));
    return this.refreshWarnings(plan);
  }

  async get(userId: string, eventId: string): Promise<EventPlan> {
    return this.refreshWarnings(await this.requirePlan(userId, eventId));
  }

  async applyRefinement(
    userId: string,
    eventId: string,
    input: ApplyRefinementInput,
  ): Promise<EventPlan> {
    const previous = await this.requirePlan(userId, eventId);
    if (previous.event.version !== input.baseVersion) {
      throw ApiError.conflict(
        'This event changed while the request was running. Refresh and try again.',
      );
    }

    const { proposedChanges } = input;
    if (
      proposedChanges.budgetShifts.length === 0 &&
      proposedChanges.newTasks.length === 0
    ) {
      throw ApiError.badRequest('The refinement proposal cannot be empty');
    }

    const now = this.now();
    const today = now.toISOString().slice(0, 10);
    if (!isSemanticallyValidRefinement(proposedChanges, previous, today)) {
      throw ApiError.badRequest(
        'The refinement proposal is not valid for the current event plan',
      );
    }
    const projectedEntityCount =
      1 +
      previous.budget.length +
      previous.tasks.length +
      proposedChanges.newTasks.length +
      previous.vendors.length;
    if (projectedEntityCount > 100) {
      throw ApiError.badRequest(
        'The refinement would make this plan too large to apply safely',
      );
    }

    const budgetDeltas = new Map(
      proposedChanges.budgetShifts.map((shift) => [
        shift.category,
        Math.round(shift.delta * 100),
      ]),
    );
    const plan = this.refreshWarnings({
      ...previous,
      event: {
        ...previous.event,
        version: previous.event.version + 1,
        updatedAt: now.toISOString(),
      },
      budget: previous.budget.map((item) => ({
        ...item,
        allocated:
          (Math.round(item.allocated * 100) +
            (budgetDeltas.get(item.category) ?? 0)) /
          100,
      })),
      tasks: [
        ...previous.tasks,
        ...proposedChanges.newTasks.map((task) =>
          refinementTask(task, previous.event.date, today),
        ),
      ],
    });

    await this.withConflictHandling(() =>
      this.events.savePlan(plan, input.baseVersion),
    );
    return plan;
  }

  async update(
    userId: string,
    eventId: string,
    input: UpdateEventInput,
  ): Promise<EventPlan> {
    const previous = await this.requirePlan(userId, eventId);
    const eventChanges = Object.fromEntries(
      contextKeys
        // eslint-disable-next-line security/detect-object-injection -- key comes from the contextKeys const tuple
        .filter((key) => input[key] !== undefined)
        // eslint-disable-next-line security/detect-object-injection -- key comes from the contextKeys const tuple
        .map((key) => [key, input[key]]),
    ) as Partial<EventRecord>;
    const event: EventRecord = {
      ...previous.event,
      ...eventChanges,
      version: previous.event.version + 1,
      updatedAt: this.now().toISOString(),
    };
    const contextChanged = Object.keys(eventChanges).length > 0;
    const shouldRegenerate = input.regenerate ?? contextChanged;
    const plan = shouldRegenerate
      ? preserveProgress(previous, generatePlan(event, this.now()))
      : { ...previous, event };

    await this.withConflictHandling(() =>
      this.events.savePlan(plan, previous.event.version),
    );
    return this.refreshWarnings(plan);
  }

  async delete(userId: string, eventId: string): Promise<void> {
    const plan = await this.requirePlan(userId, eventId);
    const deleted = await this.withConflictHandling(() =>
      this.events.deletePlan(userId, eventId, plan.event.version),
    );
    if (!deleted) throw ApiError.notFound('Event not found');
  }

  async updateTask(
    userId: string,
    eventId: string,
    taskId: string,
    input: UpdateTaskInput,
  ) {
    const plan = await this.requirePlan(userId, eventId);
    const current = plan.tasks.find((task) => task.id === taskId);
    if (!current) throw ApiError.notFound('Task not found');
    const status = input.status ?? (input.completed ? 'completed' : 'pending');
    const task = await this.withConflictHandling(() =>
      this.events.updateTask(
        userId,
        eventId,
        taskId,
        status,
        plan.event.version,
      ),
    );
    if (!task) throw ApiError.notFound('Task not found');
    return task;
  }

  async updateBudget(
    userId: string,
    eventId: string,
    category: string,
    input: UpdateBudgetInput,
  ) {
    const plan = await this.requirePlan(userId, eventId);
    if (!plan.budget.some((item) => item.category === category)) {
      throw ApiError.notFound('Budget category not found');
    }
    const item = await this.withConflictHandling(() =>
      this.events.updateBudget(
        userId,
        eventId,
        category,
        input.spent,
        plan.event.version,
      ),
    );
    if (!item) throw ApiError.notFound('Budget category not found');
    return {
      budget: item,
      warning:
        item.spent > item.allocated
          ? `${item.label} spending exceeds its allocation by ${(item.spent - item.allocated).toFixed(2)}.`
          : null,
    };
  }

  async updateVendor(
    userId: string,
    eventId: string,
    vendorId: string,
    input: UpdateVendorInput,
  ): Promise<{ vendor: VendorItem; warnings: string[] }> {
    const plan = await this.requirePlan(userId, eventId);
    const current = plan.vendors.find((vendor) => vendor.id === vendorId);
    if (!current) throw ApiError.notFound('Vendor not found');
    const vendor = await this.withConflictHandling(() =>
      this.events.updateVendor(
        userId,
        eventId,
        vendorId,
        {
          status: input.status ?? current.status,
          ...(input.quote === undefined ? {} : { quote: input.quote }),
        },
        plan.event.version,
      ),
    );
    if (!vendor) throw ApiError.notFound('Vendor not found');

    const vendors = plan.vendors.map((item) =>
      item.id === vendorId ? vendor : item,
    );
    return {
      vendor,
      warnings: crossCheckVendorQuotes(plan.budget, vendors),
    };
  }
}
