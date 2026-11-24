
import { Injectable, UnauthorizedException } from '@nestjs/common';
import argon2 from 'argon2';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';
import type { PublicUser, RegisteredUser } from './auth.types.js';
import { UsersService } from './users.service.js';
import { SessionService } from './session.service.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionService,
  ) {}

  register(dto: RegisterDto): Promise<RegisteredUser> {
    return this.users.create(dto);
  }

  async login(
    dto: LoginDto,
  ): Promise<{ token: string; user: PublicUser }> {
    const account = await this.users.findByEmail(dto.email);

    if (
      !account ||
      !(await argon2.verify(account.passwordHash, dto.password))
    ) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = await this.sessions.create(account.id);

    return {
      token,
      user: {
        id: account.id,
        username: account.username,
        email: account.email,
      },
    };
  }

  getAuthenticatedUser(
    token: string | undefined,
  ): Promise<PublicUser | null> {
    return this.sessions.getUser(token);
  }

  logout(token: string | undefined): Promise<void> {
    return this.sessions.revoke(token);
  }
}
