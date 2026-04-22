import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TenantService } from './tenant.service';
import { TenantId } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';

@ApiTags('admin')
@Controller('admin/tenant')
export class TenantController {
  constructor(private readonly tenants: TenantService) {}

  @Get()
  current(@TenantId() tenantId: string) {
    return this.tenants.get(tenantId);
  }

  @Put('settings')
  @RequirePermissions('admin.*')
  updateSettings(@TenantId() tenantId: string, @Body() body: Record<string, unknown>) {
    return this.tenants.updateSettings(tenantId, body);
  }
}
