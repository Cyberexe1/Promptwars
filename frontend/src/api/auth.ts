import { jsonBody, request } from './http';
import type { AuthResponse, HealthResponse } from './types';
export const getHealth = (signal?: AbortSignal) =>
  request<HealthResponse>('/health', { signal });
export const signup = (email: string, password: string, signal?: AbortSignal) =>
  request<AuthResponse>('/auth/signup', {
    method: 'POST',
    body: jsonBody({ email, password }),
    signal,
  });
export const login = (email: string, password: string, signal?: AbortSignal) =>
  request<AuthResponse>('/auth/login', {
    method: 'POST',
    body: jsonBody({ email, password }),
    signal,
  });
