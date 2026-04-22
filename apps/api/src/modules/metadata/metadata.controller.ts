import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsArray, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { MetadataService } from './metadata.service';
import { TenantId } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { FieldType } from '@prisma/client';

class CreateFieldDto {
  @IsString() apiName!: string;
  @IsString() label!: string;
  @IsEnum(FieldType) type!: FieldType;
  @IsOptional() required?: boolean;
  @IsOptional() unique?: boolean;
  @IsString() @IsOptional() helpText?: string;
  @IsString() @IsOptional() picklistId?: string;
  @IsString() @IsOptional() referenceTo?: string;
  @IsNumber() @IsOptional() precision?: number;
  @IsNumber() @IsOptional() scale?: number;
  @IsNumber() @IsOptional() displayOrder?: number;
  @IsOptional() defaultValue?: unknown;
}

@ApiTags('admin')
@Controller('admin/metadata')
export class MetadataController {
  constructor(private readonly svc: MetadataService) {}

  // Objects
  @Get('objects')
  @RequirePermissions('metadata.read')
  listObjects(@TenantId() tid: string) { return this.svc.listObjects(tid); }

  @Get('objects/:apiName')
  @RequirePermissions('metadata.read')
  getObject(@TenantId() tid: string, @Param('apiName') name: string) { return this.svc.getObject(tid, name); }

  @Post('objects')
  @RequirePermissions('admin.*')
  createObject(@TenantId() tid: string, @Body() body: { apiName: string; label: string; labelPlural: string; iconName?: string }) {
    return this.svc.createObject(tid, body);
  }

  @Put('objects/:apiName')
  @RequirePermissions('admin.*')
  updateObject(@TenantId() tid: string, @Param('apiName') name: string, @Body() body: { label?: string; labelPlural?: string }) {
    return this.svc.updateObject(tid, name, body);
  }

  @Delete('objects/:apiName')
  @RequirePermissions('admin.*')
  removeObject(@TenantId() tid: string, @Param('apiName') name: string) { return this.svc.removeObject(tid, name); }

  // Fields
  @Get('objects/:apiName/fields')
  @RequirePermissions('metadata.read')
  listFields(@TenantId() tid: string, @Param('apiName') name: string) { return this.svc.listFields(tid, name); }

  @Post('objects/:apiName/fields')
  @RequirePermissions('admin.*')
  createField(@TenantId() tid: string, @Param('apiName') name: string, @Body() dto: CreateFieldDto) {
    return this.svc.createField(tid, name, dto);
  }

  @Put('fields/:id')
  @RequirePermissions('admin.*')
  updateField(@TenantId() tid: string, @Param('id') id: string, @Body() dto: Partial<CreateFieldDto>) {
    return this.svc.updateField(tid, id, dto);
  }

  @Delete('fields/:id')
  @RequirePermissions('admin.*')
  removeField(@TenantId() tid: string, @Param('id') id: string) { return this.svc.removeField(tid, id); }

  // Picklists
  @Get('picklists')
  @RequirePermissions('metadata.read')
  listPicklists(@TenantId() tid: string) { return this.svc.listPicklists(tid); }

  @Get('picklists/:apiName')
  @RequirePermissions('metadata.read')
  getPicklist(@TenantId() tid: string, @Param('apiName') name: string) { return this.svc.getPicklist(tid, name); }

  @Post('picklists')
  @RequirePermissions('admin.*')
  createPicklist(@TenantId() tid: string, @Body() body: { apiName: string; label: string; values: { value: string; label: string }[] }) {
    return this.svc.createPicklist(tid, body);
  }

  @Put('picklists/:id/values')
  @RequirePermissions('admin.*')
  upsertValues(@TenantId() tid: string, @Param('id') id: string, @Body() body: { values: { value: string; label: string }[] }) {
    return this.svc.upsertPicklistValues(tid, id, body.values);
  }

  // Page Layouts — stored in ObjectDef.customData.layout
  @Get('objects/:apiName/layout')
  @RequirePermissions('metadata.read')
  getLayout(@TenantId() tid: string, @Param('apiName') name: string) {
    return this.svc.getLayout(tid, name);
  }

  @Post('objects/:apiName/layout')
  @RequirePermissions('admin.*')
  saveLayout(@TenantId() tid: string, @Param('apiName') name: string, @Body() body: { sections: unknown[] }) {
    return this.svc.saveLayout(tid, name, body.sections);
  }
}
