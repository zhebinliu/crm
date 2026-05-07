import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { FormulaService } from './formula.service';
import { TenantId } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';

class EvalDto {
  @IsString() @MaxLength(2_000) formula!: string;
  @IsOptional() @IsObject() record?: Record<string, unknown>;
}

class DecorateDto {
  @IsString() objectApiName!: string;
  @IsObject() record!: Record<string, unknown>;
}

@UseGuards(PermissionsGuard)
@Controller('formula')
export class FormulaController {
  constructor(private readonly svc: FormulaService) {}

  /**
   * POST /v1/formula/evaluate
   * Body: { formula, record? }
   * Returns: { value, error? }
   *
   * Useful for the metadata-editor UI to preview a formula's output.
   */
  @Post('evaluate')
  @RequirePermissions('metadata.read')
  evaluate(@Body() body: EvalDto) {
    return this.svc.evaluate(body.formula, body.record ?? {});
  }

  /**
   * POST /v1/formula/decorate
   * Body: { objectApiName, record }
   * Returns: record + every formula field's computed value attached.
   */
  @Post('decorate')
  @RequirePermissions('metadata.read')
  decorate(@TenantId() tid: string, @Body() body: DecorateDto) {
    return this.svc.decorateRecord(tid, body.objectApiName, body.record);
  }
}
