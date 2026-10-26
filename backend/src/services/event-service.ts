import { randomUUID } from 'node:crypto';
import type { EventPlan, EventRecord, VendorItem } from '../domain/models.js';
import { ApiError } from '../errors/api-error.js';
import {
  VersionConflictError,
  type EventRepository,
} from '../repositories/repository.js';
import type {
  CreateEventInput,
  UpdateBudgetInput,
  UpdateEventInput,
  UpdateTaskInput,
  UpdateVendorInput,
} from '../schemas/event.js';
import { crossCheckVendorQuotes } from './planning/cross-checks.js';
import { generatePlan } from './planning/generate-plan.js';

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

  async update(
    userId: string,
    eventId: string,
    input: UpdateEventInput,
  ): Promise<EventPlan> {
    const previous = await this.requirePlan(userId, eventId);
    const eventChanges = Object.fromEntries(
      contextKeys
        .filter((key) => input[key] !== undefined)
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
