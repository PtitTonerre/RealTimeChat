import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { createHash, randomBytes } from 'node:crypto';
import argon2 from 'argon2';

import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';

export const SESSION_COOKIE = 'rtc_session';
export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export interface PublicUser {
  id: string;
  username: string;
  email: string;
}

export interface RegisteredUser extends PublicUser {
  createdAt: string;
}

function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async register(dto: RegisterDto): Promise<RegisteredUser> {
    const username = dto.username.trim();
    const email = dto.email.trim();

    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    try {
      const user = await this.prisma.user.create({
        data: {
          username,
          usernameKey: username.toLowerCase(),
          email,
          emailKey: email.toLowerCase(),
          passwordHash,
        },
        select: {
          id: true,
          username: true,
          email: true,
          createdAt: true,
        },
      });

      return {
        id: user.id,
        username: user.username,
        email: user.email,
        createdAt: user.createdAt.toISOString(),
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Username or email already in use',
        );
      }

      throw error;
    }
  }

  async login(
    dto: LoginDto,
  ): Promise<{ token: string; user: PublicUser }> {
    const user = await this.prisma.user.findUnique({
      where: {
        emailKey: dto.email.trim().toLowerCase(),
      },
      select: {
        id: true,
        username: true,
        email: true,
        passwordHash: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await argon2.verify(
      user.passwordHash,
      dto.password,
    );

    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = randomBytes(32).toString('hex');
    const tokenHash = hashSessionToken(token);

    await this.prisma.session.create({
      data: {
        tokenHash,
        userId: user.id,
        expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
      },
    });

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
    };
  }

  async getAuthenticatedUser(
    token: string | undefined,
  ): Promise<PublicUser | null> {
    if (!token) {
      return null;
    }

    const session = await this.prisma.session.findUnique({
      where: {
        tokenHash: hashSessionToken(token),
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
      },
    });

    if (!session || session.expiresAt <= new Date()) {
      return null;
    }

    return session.user;
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token) {
      return;
    }

    await this.prisma.session.deleteMany({
      where: {
        tokenHash: hashSessionToken(token),
      },
    });
  }
}
