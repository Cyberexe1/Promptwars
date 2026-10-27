import { jsonBody, request } from './http';
import type {
  ChatHistoryItem,
  ChatResponse,
  IdeaCategory,
  IdeasResponse,
  RefineResponse,
} from './types';
const enc = encodeURIComponent;
export const generateIdeas = (
  eventId: string,
  input: { category?: IdeaCategory; extraNotes?: string },
) =>
  request<IdeasResponse>(`/events/${enc(eventId)}/ai/ideas`, {
    method: 'POST',
    body: jsonBody(input),
  });
export const refineEvent = (eventId: string, instruction: string) =>
  request<RefineResponse>(`/events/${enc(eventId)}/ai/refine`, {
    method: 'POST',
    body: jsonBody({ instruction }),
  });
export const chat = (
  eventId: string,
  message: string,
  history: ChatHistoryItem[],
) =>
  request<ChatResponse>(`/events/${enc(eventId)}/ai/chat`, {
    method: 'POST',
    body: jsonBody({ message, history: history.slice(-10) }),
  });
