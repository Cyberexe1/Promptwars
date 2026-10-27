export type EventType = 'wedding' | 'birthday' | 'community';
export type EventSetting = 'indoor' | 'outdoor' | 'either';
export type EventAudience = 'adults' | 'mixed' | 'kids';
export type TaskStatus = 'pending' | 'completed';
export type TaskPhase = 'Now' | 'This month' | 'Final weeks' | 'Event week';
export type VendorStatus = 'to-research' | 'contacted' | 'quoted' | 'booked';
export type IdeaCategory = 'theme' | 'menu' | 'activities' | 'decor' | 'gifts';

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
export type CreateEventInput = EventContext;
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
export interface PublicUser {
  id: string;
  email: string;
  createdAt: string;
}
export interface AuthResponse {
  user: PublicUser;
  token: string;
}
export interface ValidationDetail {
  field: string;
  message: string;
}
export interface ApiErrorEnvelope {
  error: { code: string; message: string; details?: unknown };
}
export interface HealthResponse {
  status: 'ok';
  time: string;
}
export interface Idea {
  title: string;
  description: string;
  estimatedCost: number;
  whyItFits: string;
}
export interface IdeasResponse {
  ideas: Idea[];
  aiAvailable: boolean;
}
export interface BudgetShift {
  category: string;
  delta: number;
  reason: string;
}
export interface NewTask {
  title: string;
  category: string;
  dueDate: string;
  reason: string;
}
export interface RefinementProposal {
  budgetShifts: BudgetShift[];
  newTasks: NewTask[];
}
export interface RefineResponse {
  proposedChanges: RefinementProposal;
  baseVersion: number;
  aiAvailable: boolean;
}
export interface ChatHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}
export interface ChatResponse {
  reply: string;
  aiAvailable: boolean;
}
export interface BudgetUpdateResponse {
  budget: BudgetItem;
  warning: string | null;
}
export interface VendorUpdateResponse {
  vendor: VendorItem;
  warnings: string[];
}
