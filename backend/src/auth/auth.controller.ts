import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';

import type { Request, Response } from 'express';

import { AuthService } from './auth.service.js';

import {
  SESSION_COOKIE,
  SESSION_DURATION_MS,
} from './session.service.js';

import type {
  PublicUser,
  RegisteredUser,
} from './auth.types.js';

import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private getSessionToken(req: Request): string | undefined {
    const value: unknown = req.cookies?.[SESSION_COOKIE];

    return typeof value === 'string' ? value : undefined;
  }

  @Post('register')
  register(@Body() dto: RegisterDto): Promise<RegisteredUser> {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: PublicUser }> {
    const { token, user } = await this.authService.login(dto);

    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_DURATION_MS,
    });

    return { user };
  }

  @Get('me')
  async me(@Req() req: Request): Promise<PublicUser> {
    const user = await this.authService.getAuthenticatedUser(
      this.getSessionToken(req),
    );

    if (!user) {
      throw new UnauthorizedException();
    }

    return user;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    await this.authService.logout(this.getSessionToken(req));

    res.clearCookie(SESSION_COOKIE, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });

    return { message: 'Logged out successfully' };
  }
}
