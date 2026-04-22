import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ActivityService } from './activity.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser, TenantId } from '../../common/decorators/current-user.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { RequestUser } from '../../common/types/request-context';

// ── DTOs ─────────────────────────────────────────────────────────────────────

export class ListActivitiesQuery {
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() targetType?: string;
  @IsOptional() @IsString() targetId?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsDateString() dueBefore?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) skip?: number = 0;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) take?: number = 20;
}

export class CreateActivityDto {
  @IsString() type!: string;
  @IsString() subject!: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() priority?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsDateString() startAt?: string;
  @IsOptional() @IsDateString() endAt?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() targetType?: string;
  @IsOptional() @IsString() targetId?: string;
}

export class UpdateActivityDto {
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() priority?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsDateString() startAt?: string;
  @IsOptional() @IsDateString() endAt?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() targetType?: string;
  @IsOptional() @IsString() targetId?: string;
  @IsOptional() @IsString() ownerId?: string;
}

// ── Controller ────────────────────────────────────────────────────────────────

@UseGuards(PermissionsGuard)
@Controller('activities')
export class ActivityController {
  constructor(private readonly service: ActivityService) {}

  @Get()
  @RequirePermissions('activity.read')
  list(@TenantId() tenantId: string, @Query() query: ListActivitiesQuery) {
    return this.service.list(tenantId, query);
  }

  @Get(':id')
  @RequirePermissions('activity.read')
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.service.get(tenantId, id);
  }

  @Post()
  @RequirePermissions('activity.write')
  create(
    @TenantId() tenantId: string,
    @Body() body: CreateActivityDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.create(tenantId, body as unknown as Record<string, unknown>, user);
  }

  @Put(':id')
  @RequirePermissions('activity.write')
  update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() body: UpdateActivityDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.update(tenantId, id, body as unknown as Record<string, unknown>, user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('activity.write')
  softDelete(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.service.softDelete(tenantId, id);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('activity.write')
  complete(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.complete(tenantId, id, user);
  }
}
