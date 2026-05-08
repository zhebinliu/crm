import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';
import { RecordTypeService } from './record-type.service';
import { TenantId } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';

class CreateRecordTypeDto {
  @IsString() apiName!: string;
  @IsString() label!: string;
  @IsString() @IsOptional() description?: string;
  @IsBoolean() @IsOptional() isDefault?: boolean;
  @IsBoolean() @IsOptional() isActive?: boolean;
  @IsObject() @IsOptional() picklistOverrides?: Record<string, string>;
  @IsString() @IsOptional() layoutId?: string | null;
}

class UpdateRecordTypeDto {
  @IsString() @IsOptional() label?: string;
  @IsString() @IsOptional() description?: string;
  @IsBoolean() @IsOptional() isDefault?: boolean;
  @IsBoolean() @IsOptional() isActive?: boolean;
  @IsObject() @IsOptional() picklistOverrides?: Record<string, string>;
  @IsString() @IsOptional() layoutId?: string | null;
}

@ApiTags('admin')
@Controller('admin/metadata/objects/:objectApiName/record-types')
export class RecordTypeController {
  constructor(private readonly svc: RecordTypeService) {}

  @Get()
  @RequirePermissions('metadata.read')
  list(@TenantId() tid: string, @Param('objectApiName') obj: string) {
    return this.svc.list(tid, obj);
  }

  @Get(':recordTypeId')
  @RequirePermissions('metadata.read')
  get(@TenantId() tid: string, @Param('recordTypeId') id: string) {
    return this.svc.get(tid, id);
  }

  @Post()
  @RequirePermissions('metadata.write')
  create(
    @TenantId() tid: string,
    @Param('objectApiName') obj: string,
    @Body() dto: CreateRecordTypeDto,
  ) {
    return this.svc.create(tid, obj, dto);
  }

  @Patch(':recordTypeId')
  @RequirePermissions('metadata.write')
  update(
    @TenantId() tid: string,
    @Param('recordTypeId') id: string,
    @Body() dto: UpdateRecordTypeDto,
  ) {
    return this.svc.update(tid, id, dto);
  }

  @Delete(':recordTypeId')
  @RequirePermissions('metadata.write')
  remove(@TenantId() tid: string, @Param('recordTypeId') id: string) {
    return this.svc.remove(tid, id);
  }
}
