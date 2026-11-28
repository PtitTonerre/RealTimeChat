import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { UsersService } from './users.service.js';
import { SessionService } from './session.service.js';
import { SessionGuard } from './session.guard.js';

@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    UsersService,
    SessionService,
    SessionGuard,
  ],
  exports: [
    AuthService,
    UsersService,
    SessionGuard,
  ],
})
export class AuthModule {}
