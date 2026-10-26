import type {
  BudgetItem,
  EventPlan,
  EventRecord,
  PlanTask,
  UserRecord,
  VendorItem,
} from '../domain/models.js';

export class VersionConflictError extends Error {
  constructor() {
    super('The event changed during this request');
    this.name = 'VersionConflictError';
  }
}

export interface UserRepository {
  create(user: UserRecord): Promise<boolean>;
  findByEmail(email: string): Promise<UserRecord | null>;
}

export interface EventRepository {
  listByUser(userId: string): Promise<EventRecord[]>;
  getPlan(userId: string, eventId: string): Promise<EventPlan | null>;
  savePlan(plan: EventPlan, expectedVersion?: number): Promise<void>;
  deletePlan(
    userId: string,
    eventId: string,
    expectedVersion: number,
  ): Promise<boolean>;
  updateTask(
    userId: string,
    eventId: string,
    taskId: string,
    status: PlanTask['status'],
    expectedVersion: number,
  ): Promise<PlanTask | null>;
  updateBudget(
    userId: string,
    eventId: string,
    category: string,
    spent: number,
    expectedVersion: number,
  ): Promise<BudgetItem | null>;
  updateVendor(
    userId: string,
    eventId: string,
    vendorId: string,
    changes: Pick<VendorItem, 'status'> & { quote?: number },
    expectedVersion: number,
  ): Promise<VendorItem | null>;
}
