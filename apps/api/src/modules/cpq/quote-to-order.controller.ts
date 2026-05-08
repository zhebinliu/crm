import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsOptional } from 'class-validator';
import { QuoteToOrderService } from './quote-to-order.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser, TenantId } from '../../common/decorators/current-user.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { RequestUser } from '../../common/types/request-context';

export class ConvertToOrderDto {
  @IsOptional() @IsBoolean() skipApproval?: boolean;
}

@UseGuards(PermissionsGuard)
@Controller('quotes')
export class QuoteToOrderController {
  constructor(private readonly service: QuoteToOrderService) {}

  /**
   * Convert an approved Quote into a draft Order. Errors with
   * APPROVAL_REQUIRED if the quote's effective discount exceeds the tenant
   * threshold and no APPROVED ApprovalRequest exists.
   */
  @Post(':id/convert-to-order')
  @RequirePermissions('order.write')
  convert(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() body: ConvertToOrderDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.convert(tenantId, id, user, { skipApproval: body.skipApproval });
  }
}
