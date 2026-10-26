import { randomUUID } from 'node:crypto';
import { ApiError } from '../errors/api-error.js';
import type { UserRepository } from '../repositories/repository.js';
import type { LoginInput, SignupInput } from '../schemas/auth.js';
import type { PasswordHasher } from './password.js';
import type { TokenService } from './token.js';

const DUMMY_PASSWORD_HASH =
  '$2b$12$PTiVsDuG0bMBeZvdburU4OyIRUVCITIJsPO2Ev2oxvnMXHSJP9LSq';

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly passwords: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly now: () => Date,
  ) {}

  async signup(input: SignupInput) {
    const user = {
      id: randomUUID(),
      email: input.email,
      passwordHash: await this.passwords.hash(input.password),
      createdAt: this.now().toISOString(),
    };

    if (!(await this.users.create(user))) {
      throw ApiError.conflict('An account with this email already exists');
    }

    return {
      user: { id: user.id, email: user.email, createdAt: user.createdAt },
      token: await this.tokens.create(user.id),
    };
  }

  async login(input: LoginInput) {
    const user = await this.users.findByEmail(input.email);
    const valid = await this.passwords.verify(
      input.password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );

    if (!user || !valid) {
      throw ApiError.unauthorized('Invalid email or password');
    }

    return {
      user: { id: user.id, email: user.email, createdAt: user.createdAt },
      token: await this.tokens.create(user.id),
    };
  }
}
