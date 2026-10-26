export type EventType = 'wedding' | 'birthday' | 'community';
export type EventSetting = 'indoor' | 'outdoor' | 'either';
export type EventAudience = 'adults' | 'mixed' | 'kids';

export interface EventContext {
  type: EventType;
  title: string;
  date: string;
  guestCount: number;
  totalBudget: number;
  currency: string;
  city: string;
  indoorOutdoor: EventSetting;
  preferences: string[];
  audience?: EventAudience;
}

export interface EventRecord extends EventContext {
  id: string;
  userId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetItem {
  category: string;
  label: string;
  allocated: number;
  spent: number;
  notes: string[];
}

export type TaskStatus = 'pending' | 'completed';
export type TaskPhase = 'Now' | 'This month' | 'Final weeks' | 'Event week';

export interface PlanTask {
  id: string;
  title: string;
  category: string;
  dueDate: string;
  status: TaskStatus;
  priority: number;
  phase: TaskPhase;
  urgent: boolean;
  overdue: boolean;
}

export type VendorStatus = 'to-research' | 'contacted' | 'quoted' | 'booked';

export interface VendorItem {
  id: string;
  category: string;
  name: string;
  whyNeeded: string;
  leadTimeDays: number;
  suggestedBudget: number;
  questions: string[];
  status: VendorStatus;
  quote?: number;
}

export interface EventPlan {
  event: EventRecord;
  budget: BudgetItem[];
  tasks: PlanTask[];
  vendors: VendorItem[];
  warnings: string[];
}

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}
