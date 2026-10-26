import type { ErrorRequestHandler, RequestHandler } from 'express';
import { env } from '../config/env.js';

export const notFoundHandler: RequestHandler = (_request, response) => {
  response.status(404).json({ error: 'Route not found' });
};

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  _request,
  response,
  _next,
) => {
  const message =
    env.NODE_ENV === 'production'
      ? 'An unexpected error occurred'
      : error instanceof Error
        ? error.message
        : 'Unknown error';

  response.status(500).json({ error: message });
};
