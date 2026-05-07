// ─── Admin endpoints for embedding maintenance ─────────────────────────────
//
// POST /admin/embeddings/reindex { recordType?: string }  → backfill embeddings
//   Requires admin permissions; reindexes all records of the given type
//   (or all supported types if omitted) for the caller's tenant.

import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { TenantId } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { EmbeddingService } from './embedding.service';

class ReindexDto {
  @IsOptional()
  @IsString()
  @IsIn(['lead', 'account', 'contact', 'opportunity', 'case', 'activity'])
  recordType?: string;
}

@UseGuards(PermissionsGuard)
@Controller('admin/embeddings')
export class EmbeddingController {
  constructor(private readonly embeddings: EmbeddingService) {}

  @Post('reindex')
  @RequirePermissions('ai.invoke')
  async reindex(@TenantId() tenantId: string, @Body() body: ReindexDto) {
    const count = await this.embeddings.reindexAll(tenantId, body.recordType);
    return { count, recordType: body.recordType ?? 'all' };
  }
}
