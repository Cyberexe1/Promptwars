import type { ApiErrorEnvelope } from './types';

const rawBase =
  (import.meta.env.VITE_API_URL as string | undefined) ??
  'http://localhost:8080';
export const API_BASE_URL = rawBase.trim().replace(/\/+$/, '');
const STORAGE_KEY = 'gatherly.auth';
function storedToken(): string | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as { token?: unknown };
    return typeof parsed.token === 'string' ? parsed.token : null;
  } catch {
    return null;
  }
}

let tokenProvider: () => string | null = storedToken;
let unauthorizedHandler: () => void = () => undefined;

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
export function configureHttp(options: {
  getToken?: () => string | null;
  onUnauthorized?: () => void;
}) {
  const previousTokenProvider = tokenProvider;
  const previousUnauthorizedHandler = unauthorizedHandler;
  if (options.getToken) tokenProvider = options.getToken;
  if (options.onUnauthorized) unauthorizedHandler = options.onUnauthorized;

  return () => {
    tokenProvider = previousTokenProvider;
    unauthorizedHandler = previousUnauthorizedHandler;
  };
}

function isEnvelope(value: unknown): value is ApiErrorEnvelope {
  if (!value || typeof value !== 'object' || !('error' in value)) return false;
  const error = (value as { error?: unknown }).error;
  return (
    !!error &&
    typeof error === 'object' &&
    typeof (error as { message?: unknown }).message === 'string'
  );
}

export async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  const token = tokenProvider();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body !== undefined && !headers.has('Content-Type'))
    headers.set('Content-Type', 'application/json');
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api${path}`, { ...init, headers });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError')
      throw error;
    throw new ApiError(
      'Unable to reach the server. Check your connection and try again.',
      0,
      'NETWORK_ERROR',
      error,
    );
  }
  const text = response.status === 204 ? '' : await response.text();
  let payload: unknown;
  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      payload = text;
    }
  }
  if (!response.ok) {
    const envelope = isEnvelope(payload) ? payload.error : undefined;
    const error = new ApiError(
      envelope?.message ?? `Request failed (${response.status})`,
      response.status,
      envelope?.code ?? 'HTTP_ERROR',
      envelope?.details,
    );
    if (response.status === 401) unauthorizedHandler();
    throw error;
  }
  return payload as T;
}

export const jsonBody = (value: unknown) => JSON.stringify(value);
