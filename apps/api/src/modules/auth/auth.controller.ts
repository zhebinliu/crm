import { Body, Controller, Post, Req } from '@nestjs/common';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';

class LoginDto {
  @IsString() @IsNotEmpty() tenantSlug!: string;
  @IsEmail() email!: string;
  @IsString() @MinLength(8) password!: string;
}

class RefreshDto {
  @IsString() @IsNotEmpty() refreshToken!: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // Tighten the default tier on login: brute-force credential stuffing is
  // the realistic threat here, so cap at 5 req/s and 50 req/min per IP
  // (login is unauthenticated, so the tracker falls back to ip:<ip>).
  @Public()
  @Throttle({
    short: { limit: 5, ttl: 1000 },
    long: { limit: 50, ttl: 60_000 },
  })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.tenantSlug, dto.email, dto.password);
  }

  @Public()
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  async logout(@Body() dto: RefreshDto) {
    await this.auth.logout(dto.refreshToken);
    return { ok: true };
  }

  @Post('me')
  me(@Req() req: Request) {
    return req.user;
  }
}
