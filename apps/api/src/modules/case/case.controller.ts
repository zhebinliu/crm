import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, Post, Put, Query, UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { CaseService } from './case.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser, TenantId } from '../../common/decorators/current-user.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { RequestUser } from '../../common/types/request-context';

const CASE_STATUSES = ['NEW', 'WORKING', 'ESCALATED', 'WAITING_ON_CUSTOMER', 'CLOSED_RESOLVED', 'CLOSED_NOT_RESOLVED'];
const CASE_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

class ListCasesQuery {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsIn(CASE_STATUSES) status?: string;
  @IsOptional() @IsIn(CASE_PRIORITIES) priority?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() contactId?: string;
  @IsOptional() @IsString() source?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) skip?: number = 0;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) take?: number = 20;
}

class CreateCaseDto {
  @IsString() subject!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsIn(CASE_STATUSES) status?: string;
  @IsOptional() @IsIn(CASE_PRIORITIES) priority?: string;
  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() contactId?: string;
}

class UpdateCaseDto {
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsIn(CASE_STATUSES) status?: string;
  @IsOptional() @IsIn(CASE_PRIORITIES) priority?: string;
  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() contactId?: string;
}

class AddCommentDto {
  @IsString() body!: string;
  @IsOptional() @IsBoolean() isPublic?: boolean;
}

@UseGuards(PermissionsGuard)
@Controller('cases')
export class CaseController {
  constructor(private readonly svc: CaseService) {}

  @Get()
  @RequirePermissions('case.read')
  list(@TenantId() tid: string, @Query() q: ListCasesQuery) {
    return this.svc.list(tid, q);
  }

  @Get(':id')
  @RequirePermissions('case.read')
  get(@TenantId() tid: string, @Param('id') id: string) {
    return this.svc.get(tid, id);
  }

  @Post()
  @RequirePermissions('case.write')
  create(@TenantId() tid: string, @Body() body: CreateCaseDto, @CurrentUser() user: RequestUser) {
    return this.svc.create(tid, body as unknown as Record<string, unknown>, user);
  }

  @Put(':id')
  @RequirePermissions('case.write')
  update(
    @TenantId() tid: string, @Param('id') id: string,
    @Body() body: UpdateCaseDto, @CurrentUser() user: RequestUser,
  ) {
    return this.svc.update(tid, id, body as unknown as Record<string, unknown>, user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('case.delete')
  remove(@TenantId() tid: string, @Param('id') id: string) {
    return this.svc.softDelete(tid, id);
  }

  @Get(':id/comments')
  @RequirePermissions('case.read')
  comments(@TenantId() tid: string, @Param('id') id: string) {
    return this.svc.listComments(tid, id);
  }

  @Post(':id/comments')
  @RequirePermissions('case.write')
  addComment(
    @TenantId() tid: string, @Param('id') id: string,
    @Body() body: AddCommentDto, @CurrentUser() user: RequestUser,
  ) {
    return this.svc.addComment(tid, id, body.body, body.isPublic ?? false, user);
  }
}
