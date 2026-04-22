import { Resolver, Query, Mutation, Args, ID, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { ApprovalService } from './approval.service';
import { ApprovalRequest, PaginatedApprovalRequest } from './approval-request.type';
import { CreateApprovalRequestInput, UpdateApprovalRequestInput } from './approval-request.input';
import { GqlCurrentUser } from '../auth/decorators/gql-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import type { RequestUser } from '../../common/types/request-context';

@Resolver(() => ApprovalRequest)
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ApprovalRequestResolver {
  constructor(private readonly approvalService: ApprovalService) {}

  @Query(() => PaginatedApprovalRequest)
  @RequirePermissions('approvalRequest.read')
  async approvalRequests(
    @GqlCurrentUser() user: RequestUser,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ) {
    const res = await this.approvalService.list(user.tenantId, { skip, take });
    return { data: res.data, total: res.total };
  }

  @Query(() => ApprovalRequest)
  @RequirePermissions('approvalRequest.read')
  async approvalRequest(
    @GqlCurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ) {
    return this.approvalService.get(user.tenantId, id);
  }

  @Mutation(() => ApprovalRequest)
  @RequirePermissions('approvalRequest.write')
  async createApprovalRequest(
    @GqlCurrentUser() user: RequestUser,
    @Args('input') input: CreateApprovalRequestInput,
  ) {
    return this.approvalService.create(user.tenantId, input as any, user);
  }

  @Mutation(() => ApprovalRequest)
  @RequirePermissions('approvalRequest.write')
  async updateApprovalRequest(
    @GqlCurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateApprovalRequestInput,
  ) {
    return this.approvalService.update(user.tenantId, id, input as any, user);
  }

  @Mutation(() => Boolean)
  @RequirePermissions('approvalRequest.delete')
  async deleteApprovalRequest(
    @GqlCurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ) {
    await this.approvalService.softDelete(user.tenantId, id);
    return true;
  }
}
