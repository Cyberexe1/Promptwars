import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, configureHttp, request } from '../src/api/http';

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('HTTP client', () => {
  it('attaches the current bearer token and handles 204 responses', async () => {
    localStorage.setItem(
      'gatherly.auth',
      JSON.stringify({ token: 'stored-token', user: { id: 'user-1' } }),
    );
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));

    await expect(request<void>('/events/event-1', { method: 'DELETE' }))
      .resolves.toBeUndefined;
    expect(
      new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('Authorization'),
    ).toBe('Bearer stored-token');
  });

  it('preserves structured errors and invokes the configured 401 handler', async () => {
    const unauthorized = vi.fn();
    cleanups.push(configureHttp({ onUnauthorized: unauthorized }));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid or expired access token',
          },
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const error = await request('/events').catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
    expect(unauthorized).toHaveBeenCalledOnce();
  });

  it('turns transport failures into safe retryable network errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new Error('private network detail'),
    );

    await expect(request('/health')).rejects.toMatchObject({
      status: 0,
      code: 'NETWORK_ERROR',
      message:
        'Unable to reach the server. Check your connection and try again.',
    });
  });
});
