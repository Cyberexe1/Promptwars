import { jwtVerify, SignJWT } from 'jose';
import { ApiError } from '../errors/api-error.js';

const encoder = new TextEncoder();

export class TokenService {
  private readonly secret: Uint8Array;

  constructor(secret: string) {
    this.secret = encoder.encode(secret);
  }

  async create(userId: string): Promise<string> {
    return new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(this.secret);
  }

  async verify(token: string): Promise<string> {
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        algorithms: ['HS256'],
      });
      if (!payload.sub) throw new Error('Missing token subject');
      return payload.sub;
    } catch {
      throw ApiError.unauthorized('Invalid or expired access token');
    }
  }
}
