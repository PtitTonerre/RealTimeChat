
import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import type { PublicUser } from './auth.types.js';

export const SESSION_COOKIE = 'rtc_session';
export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async create(userId: string): Promise<string> {
    const token = randomBytes(32).toString('hex');

    await this.prisma.session.create({
      data: {
        tokenHash: this.hashToken(token),
        userId,
        expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
      },
    });

    return token;
  }

  async getUser(token: string | undefined): Promise<PublicUser | null> {
    if (!token) return null;

    const session = await this.prisma.session.findUnique({
      where: { tokenHash: this.hashToken(token) },
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

  async revoke(token: string | undefined): Promise<void> {
    if (!token) return;

    await this.prisma.session.deleteMany({
      where: { tokenHash: this.hashToken(token) },
    });
  }
}
