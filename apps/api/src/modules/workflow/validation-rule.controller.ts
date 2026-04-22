import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';
import { ValidationRuleService } from './validation-rule.service';
import { TenantId } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';

class CreateValidationRuleDto {
  @IsString() name!: string;
  @IsString() @IsOptional() description?: string;
  @IsString() objectApiName!: string;
  conditions!: unknown;
  @IsString() errorMessage!: string;
  @IsString() @IsOptional() errorField?: string;
  @IsBoolean() @IsOptional() isActive?: boolean;
  @IsNumber() @IsOptional() priority?: number;
}

@ApiTags('admin')
@Controller('admin/validation-rules')
export class ValidationRuleController {
  constructor(private readonly svc: ValidationRuleService) {}

  @Get()
  @RequirePermissions('workflow.read')
  list(@TenantId() tid: string, @Query('objectApiName') obj?: string) {
    return this.svc.list(tid, obj);
  }

  @Post()
  @RequirePermissions('admin.*')
  create(@TenantId() tid: string, @Body() dto: CreateValidationRuleDto) {
    return this.svc.create(tid, dto);
  }

  @Put(':id')
  @RequirePermissions('admin.*')
  update(@TenantId() tid: string, @Param('id') id: string, @Body() dto: Partial<CreateValidationRuleDto>) {
    return this.svc.update(tid, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('admin.*')
  remove(@TenantId() tid: string, @Param('id') id: string) {
    return this.svc.remove(tid, id);
  }
}
