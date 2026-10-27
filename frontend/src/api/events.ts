import { jsonBody, request } from './http';
import type {
  BudgetUpdateResponse,
  CreateEventInput,
  EventPlan,
  EventRecord,
  RefinementProposal,
  TaskStatus,
  VendorStatus,
  VendorUpdateResponse,
} from './types';
const enc = encodeURIComponent;
export const listEvents = (signal?: AbortSignal) =>
  request<{ events: EventRecord[] }>('/events', { signal });
export const createEvent = (input: CreateEventInput) =>
  request<EventPlan>('/events', { method: 'POST', body: jsonBody(input) });
export const getEvent = (id: string, signal?: AbortSignal) =>
  request<EventPlan>(`/events/${enc(id)}`, { signal });
export const deleteEvent = (id: string) =>
  request<void>(`/events/${enc(id)}`, { method: 'DELETE' });
export const updateTask = (
  eventId: string,
  taskId: string,
  status: TaskStatus,
) =>
  request<{ task: EventPlan['tasks'][number] }>(
    `/events/${enc(eventId)}/tasks/${enc(taskId)}`,
    { method: 'PATCH', body: jsonBody({ status }) },
  );
export const updateBudget = (
  eventId: string,
  category: string,
  spent: number,
) =>
  request<BudgetUpdateResponse>(
    `/events/${enc(eventId)}/budget/${enc(category)}`,
    { method: 'PATCH', body: jsonBody({ spent }) },
  );
export const updateVendor = (
  eventId: string,
  vendorId: string,
  input: { status?: VendorStatus; quote?: number },
) =>
  request<VendorUpdateResponse>(
    `/events/${enc(eventId)}/vendors/${enc(vendorId)}`,
    { method: 'PATCH', body: jsonBody(input) },
  );
export const applyRefinement = (
  eventId: string,
  baseVersion: number,
  proposedChanges: RefinementProposal,
) =>
  request<EventPlan>(`/events/${enc(eventId)}/refinements/apply`, {
    method: 'POST',
    body: jsonBody({ baseVersion, proposedChanges }),
  });
