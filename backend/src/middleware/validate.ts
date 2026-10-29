import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { ApiError } from '../errors/api-error.js';

type RequestSource = 'body' | 'params' | 'query';

export function validate<T>(
  schema: ZodType<T>,
  source: RequestSource,
): RequestHandler {
  return (request, response, next) => {
    // eslint-disable-next-line security/detect-object-injection -- source is a closed union of three literals
    const result = schema.safeParse(request[source]);

    if (!result.success) {
      next(ApiError.fromZod(result.error));
      return;
    }

    // eslint-disable-next-line security/detect-object-injection -- source is a closed union of three literals
    response.locals[source] = result.data;
    next();
  };
}
