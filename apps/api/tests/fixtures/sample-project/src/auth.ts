// Authentication module

import { User } from './user';
import { hash, verify } from './crypto';

export interface AuthConfig {
  secret: string;
  expiresIn: number;
}

export interface AuthToken {
  userId: string;
  expires: number;
}

export class AuthService {
  private config: AuthConfig;

  constructor(config: AuthConfig) {
    this.config = config;
  }

  async login(email: string, password: string): Promise<AuthToken | null> {
    const user = await this.findUserByEmail(email);
    if (!user) return null;

    const valid = await verify(password, user.passwordHash);
    if (!valid) return null;

    return this.createToken(user.id);
  }

  async validateToken(token: string): Promise<User | null> {
    // validate and decode token
    const decoded = this.decodeToken(token);
    if (!decoded || decoded.expires < Date.now()) {
      return null;
    }
    return this.findUserById(decoded.userId);
  }

  private createToken(userId: string): AuthToken {
    return {
      userId,
      expires: Date.now() + this.config.expiresIn,
    };
  }

  private decodeToken(token: string): AuthToken | null {
    // simplified decode
    try {
      return JSON.parse(atob(token));
    } catch {
      return null;
    }
  }

  private async findUserByEmail(email: string): Promise<User | null> {
    // stub - would query database
    return null;
  }

  private async findUserById(id: string): Promise<User | null> {
    // stub - would query database
    return null;
  }
}

export function createAuthMiddleware(authService: AuthService) {
  return async (req: { headers: { authorization?: string } }, next: () => void) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      throw new Error('Unauthorized');
    }

    const user = await authService.validateToken(token);
    if (!user) {
      throw new Error('Invalid token');
    }

    next();
  };
}
