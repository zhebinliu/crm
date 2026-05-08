import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsNotEmpty, IsString } from 'class-validator';
import type { Request } from 'express';
import { MfaService } from './mfa.service';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';

class CodeDto {
  @IsString() @IsNotEmpty() code!: string;
}

class MfaVerifyDto {
  @IsString() @IsNotEmpty() mfaToken!: string;
  @IsString() @IsNotEmpty() code!: string;
}

@ApiTags('auth')
@Controller('auth')
export class MfaController {
  constructor(
    private readonly mfa: MfaService,
    private readonly auth: AuthService,
  ) {}

  /** Step 1: generate a secret + QR. Returns plaintext backup codes once. */
  @Post('mfa/provision')
  async provision(@Req() req: Request) {
    const user = req.user;
    if (!user) throw new UnauthorizedException();
    return this.mfa.provision(user.id);
  }

  /** Step 2: confirm the QR was scanned correctly and flip enabled=true. */
  @Post('mfa/enable')
  async enable(@Req() req: Request, @Body() dto: CodeDto) {
    const user = req.user;
    if (!user) throw new UnauthorizedException();
    const ok = await this.mfa.verifyAndEnable(user.id, dto.code);
    if (!ok) throw new BadRequestException({ code: 'INVALID_MFA_CODE', message: 'Invalid code' });
    return { ok: true };
  }

  /** Disable MFA (requires a current valid code first). */
  @Post('mfa/disable')
  async disable(@Req() req: Request, @Body() dto: CodeDto) {
    const user = req.user;
    if (!user) throw new UnauthorizedException();
    const ok = await this.mfa.disable(user.id, dto.code);
    if (!ok) throw new BadRequestException({ code: 'INVALID_MFA_CODE', message: 'Invalid code' });
    return { ok: true };
  }

  /**
   * Step 2 of two-step login. The mfaToken is the short-lived JWT issued
   * by `/auth/login` when MFA is required; `code` is the user's TOTP or
   * a backup code.
   */
  @Public()
  @Throttle({
    short: { limit: 5, ttl: 1000 },
    long: { limit: 30, ttl: 60_000 },
  })
  @Post('mfa-verify')
  async verify(@Body() dto: MfaVerifyDto) {
    return this.auth.verifyMfaAndIssueTokens(dto.mfaToken, dto.code);
  }
}
