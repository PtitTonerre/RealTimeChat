import { ConflictException, Injectable } from '@nestjs/common';
import argon2 from 'argon2';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { RegisterDto } from './dto/register.dto.js';
import type { RegisteredUser } from './auth.types.js';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: RegisterDto): Promise<RegisteredUser> {
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

  findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: {
        emailKey: email.trim().toLowerCase(),
      },
      select: {
        id: true,
        username: true,
        email: true,
        passwordHash: true,
      },
    });
  }

  async search(userId: string, search: string) {
    const query = search.trim().toLowerCase();

    if (query.length < 2 || query.length > 20) {
      return [];
    }

    return this.prisma.user.findMany({
      where: {
        id: { not: userId },
        usernameKey: { contains: query },
      },
      select: {
        id: true,
        username: true,
      },
      orderBy: {
        usernameKey: 'asc',
      },
      take: 20,
    });
  }
}
