import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, Post, Patch, Query, UseGuards,
} from '@nestjs/common';
import { IsArray, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { KnowledgeService } from './knowledge.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser, TenantId } from '../../common/decorators/current-user.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { RequestUser } from '../../common/types/request-context';

const STATUSES = ['draft', 'published', 'archived'];

class ListKnowledgeQuery {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsIn(STATUSES) status?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) skip?: number = 0;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) take?: number = 20;
}

class CreateArticleDto {
  @IsString() title!: string;
  @IsString() content!: string;
  @IsOptional() @IsString() summary?: string;
  @IsOptional() @IsIn(STATUSES) status?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsArray() tags?: string[];
  @IsOptional() @IsString() ownerId?: string;
}

class UpdateArticleDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() content?: string;
  @IsOptional() @IsString() summary?: string;
  @IsOptional() @IsIn(STATUSES) status?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsArray() tags?: string[];
  @IsOptional() @IsString() ownerId?: string;
}

class SearchKnowledgeQuery {
  @IsString() q!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number = 10;
}

@UseGuards(PermissionsGuard)
@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly svc: KnowledgeService) {}

  @Get('search')
  @RequirePermissions('case.read')
  search(@TenantId() tid: string, @Query() q: SearchKnowledgeQuery) {
    return this.svc.search(tid, q.q, q.limit);
  }

  @Get()
  @RequirePermissions('case.read')
  list(@TenantId() tid: string, @Query() q: ListKnowledgeQuery) {
    return this.svc.list(tid, q);
  }

  @Get(':id')
  @RequirePermissions('case.read')
  get(@TenantId() tid: string, @Param('id') id: string) {
    return this.svc.get(tid, id);
  }

  @Post()
  @RequirePermissions('case.write')
  create(@TenantId() tid: string, @Body() body: CreateArticleDto, @CurrentUser() user: RequestUser) {
    return this.svc.create(tid, body as unknown as Record<string, unknown>, user);
  }

  @Patch(':id')
  @RequirePermissions('case.write')
  update(
    @TenantId() tid: string, @Param('id') id: string,
    @Body() body: UpdateArticleDto, @CurrentUser() user: RequestUser,
  ) {
    return this.svc.update(tid, id, body as unknown as Record<string, unknown>, user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('case.write')
  remove(@TenantId() tid: string, @Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.svc.softDelete(tid, id, user);
  }

  @Post(':id/publish')
  @RequirePermissions('case.write')
  publish(@TenantId() tid: string, @Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.svc.publish(tid, id, user);
  }

  @Post(':id/archive')
  @RequirePermissions('case.write')
  archive(@TenantId() tid: string, @Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.svc.archive(tid, id, user);
  }

  @Post(':id/revert-to-draft')
  @RequirePermissions('case.write')
  revertToDraft(@TenantId() tid: string, @Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.svc.revertToDraft(tid, id, user);
  }

  @Post(':id/view')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('case.read')
  view(@TenantId() tid: string, @Param('id') id: string) {
    return this.svc.recordView(tid, id);
  }

  @Post(':id/helpful')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('case.read')
  helpful(@TenantId() tid: string, @Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.svc.markHelpful(tid, id, user.id);
  }

  @Post(':id/not-helpful')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('case.read')
  notHelpful(@TenantId() tid: string, @Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.svc.markNotHelpful(tid, id, user.id);
  }
}

class SuggestArticlesQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number = 5;
}

@UseGuards(PermissionsGuard)
@Controller('cases')
export class CaseDeflectionController {
  constructor(private readonly svc: KnowledgeService) {}

  /**
   * Given a case ID, return top-K published articles relevant for
   * deflection. Uses the case's subject + description as the query.
   */
  @Post(':id/suggest-articles')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('case.read')
  async suggest(
    @TenantId() tid: string,
    @Param('id') id: string,
    @Query() q: SuggestArticlesQuery,
  ) {
    // Best-effort: load the case via prisma directly through the service's
    // injected prisma. Easier path: ask KnowledgeService.searchForCase to
    // do the heavy lifting; here we look up the case first.
    return this.svc.suggestForCaseId(tid, id, q.limit);
  }
}
