import type { RequestHandler } from 'express';
import { ApiError } from '../errors/api-error.js';
import type { TokenService } from '../services/token.js';

export function authenticate(tokenService: TokenService): RequestHandler {
  return async (request, response, next) => {
    try {
      const authorization = request.get('authorization');
      if (!authorization?.startsWith('Bearer ')) {
        throw ApiError.unauthorized();
      }

      const token = authorization.slice('Bearer '.length).trim();
      if (!token) throw ApiError.unauthorized();

      response.locals.userId = await tokenService.verify(token);
      next();
    } catch (error) {
      next(error);
    }
  };
}
