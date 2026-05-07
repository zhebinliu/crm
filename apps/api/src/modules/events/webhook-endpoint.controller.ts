// ─── WebhookEndpointController ───────────────────────────────────────────
// Admin CRUD for inbound webhook endpoints.

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantId } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';

class CreateEndpointDto {
  @IsString() @MinLength(3) @MaxLength(64) slug!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() eventType?: string;
  @IsOptional() @IsString() signingSecret?: string;
}

class UpdateEndpointDto {
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() eventType?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@UseGuards(PermissionsGuard)
@Controller('admin/webhook-endpoints')
export class WebhookEndpointController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('admin.*')
  list(@TenantId() tenantId: string) {
    return this.prisma.webhookEndpoint.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post()
  @RequirePermissions('admin.*')
  async create(@TenantId() tenantId: string, @Body() body: CreateEndpointDto) {
    return this.prisma.webhookEndpoint.create({
      data: {
        tenantId,
        slug: body.slug,
        description: body.description,
        eventType: body.eventType,
        signingSecret: body.signingSecret ?? randomBytes(24).toString('hex'),
      },
    });
  }

  @Patch(':id')
  @RequirePermissions('admin.*')
  async update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() body: UpdateEndpointDto,
  ) {
    await this.prisma.webhookEndpoint.updateMany({ where: { id, tenantId }, data: body });
    return this.prisma.webhookEndpoint.findFirst({ where: { id, tenantId } });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('admin.*')
  async remove(@TenantId() tenantId: string, @Param('id') id: string) {
    await this.prisma.webhookEndpoint.deleteMany({ where: { id, tenantId } });
  }

  @Get(':id/recent')
  @RequirePermissions('admin.*')
  recent(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.prisma.webhookInboundEvent.findMany({
      where: { tenantId, endpointId: id },
      orderBy: { receivedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        idempotencyKey: true,
        receivedAt: true,
        processedAt: true,
        attempts: true,
        lastError: true,
      },
    });
  }
}
