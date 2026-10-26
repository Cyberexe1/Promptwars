import type {
  BudgetItem,
  EventPlan,
  EventRecord,
  PlanTask,
  UserRecord,
  VendorItem,
} from '../domain/models.js';
import {
  VersionConflictError,
  type EventRepository,
  type UserRepository,
} from './repository.js';

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class InMemoryUserRepository implements UserRepository {
  private readonly usersByEmail = new Map<string, UserRecord>();

  async create(user: UserRecord): Promise<boolean> {
    if (this.usersByEmail.has(user.email)) return false;
    this.usersByEmail.set(user.email, clone(user));
    return true;
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const user = this.usersByEmail.get(email);
    return user ? clone(user) : null;
  }
}

export class InMemoryEventRepository implements EventRepository {
  private readonly plans = new Map<string, EventPlan>();

  private key(userId: string, eventId: string) {
    return `${userId}:${eventId}`;
  }

  private requireCurrent(
    userId: string,
    eventId: string,
    expectedVersion: number,
  ): EventPlan | null {
    const plan = this.plans.get(this.key(userId, eventId));
    if (!plan) return null;
    if (plan.event.version !== expectedVersion)
      throw new VersionConflictError();
    return plan;
  }

  private incrementVersion(plan: EventPlan): void {
    plan.event.version += 1;
  }

  async listByUser(userId: string): Promise<EventRecord[]> {
    return [...this.plans.values()]
      .filter((plan) => plan.event.userId === userId)
      .map((plan) => clone(plan.event))
      .sort((left, right) => left.date.localeCompare(right.date));
  }

  async getPlan(userId: string, eventId: string): Promise<EventPlan | null> {
    const plan = this.plans.get(this.key(userId, eventId));
    return plan ? clone(plan) : null;
  }

  async savePlan(plan: EventPlan, expectedVersion?: number): Promise<void> {
    const key = this.key(plan.event.userId, plan.event.id);
    const current = this.plans.get(key);
    if (
      (expectedVersion === undefined && current) ||
      (expectedVersion !== undefined &&
        current?.event.version !== expectedVersion)
    ) {
      throw new VersionConflictError();
    }
    this.plans.set(key, clone(plan));
  }

  async deletePlan(
    userId: string,
    eventId: string,
    expectedVersion: number,
  ): Promise<boolean> {
    const plan = this.plans.get(this.key(userId, eventId));
    if (!plan) return false;
    if (plan.event.version !== expectedVersion)
      throw new VersionConflictError();
    return this.plans.delete(this.key(userId, eventId));
  }

  async updateTask(
    userId: string,
    eventId: string,
    taskId: string,
    status: PlanTask['status'],
    expectedVersion: number,
  ): Promise<PlanTask | null> {
    const plan = this.requireCurrent(userId, eventId, expectedVersion);
    const task = plan?.tasks.find((item) => item.id === taskId);
    if (!plan || !task) return null;
    task.status = status;
    this.incrementVersion(plan);
    return clone(task);
  }

  async updateBudget(
    userId: string,
    eventId: string,
    category: string,
    spent: number,
    expectedVersion: number,
  ): Promise<BudgetItem | null> {
    const plan = this.requireCurrent(userId, eventId, expectedVersion);
    const budget = plan?.budget.find((item) => item.category === category);
    if (!plan || !budget) return null;
    budget.spent = spent;
    this.incrementVersion(plan);
    return clone(budget);
  }

  async updateVendor(
    userId: string,
    eventId: string,
    vendorId: string,
    changes: Pick<VendorItem, 'status'> & { quote?: number },
    expectedVersion: number,
  ): Promise<VendorItem | null> {
    const plan = this.requireCurrent(userId, eventId, expectedVersion);
    const vendor = plan?.vendors.find((item) => item.id === vendorId);
    if (!plan || !vendor) return null;
    vendor.status = changes.status;
    if (changes.quote !== undefined) vendor.quote = changes.quote;
    this.incrementVersion(plan);
    return clone(vendor);
  }
}
