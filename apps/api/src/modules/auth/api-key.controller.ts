import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { Request } from 'express';
import { ApiKeyService } from './api-key.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { TenantId } from '../../common/decorators/current-user.decorator';

class CreateApiKeyDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsArray() @ArrayNotEmpty() permissions!: string[];
  @IsOptional() @IsDateString() expiresAt?: string;
}

@ApiTags('admin')
@Controller('admin/api-keys')
export class ApiKeyController {
  constructor(private readonly apiKeys: ApiKeyService) {}

  /**
   * Issue a new API key. The plaintext key is in the response — surface
   * it to the user once and warn that it won't be shown again.
   */
  @Post()
  @RequirePermissions('admin.*')
  async create(
    @TenantId() tenantId: string,
    @Req() req: Request,
    @Body() dto: CreateApiKeyDto,
  ) {
    if (!req.user) throw new UnauthorizedException();
    if (req.user.isApiKey) {
      // API keys creating API keys is an obvious privilege-escalation risk.
      throw new BadRequestException({
        code: 'API_KEY_CANNOT_ISSUE',
        message: 'API keys cannot issue new API keys',
      });
    }
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    return this.apiKeys.issue(tenantId, dto.name, dto.permissions, expiresAt, req.user.id);
  }

  @Get()
  @RequirePermissions('admin.*')
  list(@TenantId() tenantId: string) {
    return this.apiKeys.list(tenantId);
  }

  @Delete(':id')
  @RequirePermissions('admin.*')
  async revoke(@TenantId() tenantId: string, @Param('id') id: string) {
    await this.apiKeys.revoke(id, tenantId);
    return { ok: true };
  }
}
