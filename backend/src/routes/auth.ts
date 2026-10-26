import { Router } from 'express';
import type { LoginInput, SignupInput } from '../schemas/auth.js';
import { loginSchema, signupSchema } from '../schemas/auth.js';
import type { AuthService } from '../services/auth-service.js';
import { emptyQuerySchema } from '../schemas/common.js';
import { validate } from '../middleware/validate.js';

export function createAuthRouter(auth: AuthService): Router {
  const router = Router();
  router.use(validate(emptyQuerySchema, 'query'));

  router.post(
    '/signup',
    validate(signupSchema, 'body'),
    async (_request, response) => {
      const result = await auth.signup(response.locals.body as SignupInput);
      response.status(201).json(result);
    },
  );

  router.post(
    '/login',
    validate(loginSchema, 'body'),
    async (_request, response) => {
      const result = await auth.login(response.locals.body as LoginInput);
      response.status(200).json(result);
    },
  );

  return router;
}
