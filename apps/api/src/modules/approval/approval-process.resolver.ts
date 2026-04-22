import { Resolver, Query, Mutation, Args, ID, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { ApprovalService } from './approval.service';
import { ApprovalProcess, PaginatedApprovalProcess } from './approval-process.type';
import { CreateApprovalProcessInput, UpdateApprovalProcessInput } from './approval-process.input';
import { GqlCurrentUser } from '../auth/decorators/gql-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import type { RequestUser } from '../../common/types/request-context';

@Resolver(() => ApprovalProcess)
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ApprovalProcessResolver {
  constructor(private readonly approvalService: ApprovalService) {}

  @Query(() => PaginatedApprovalProcess)
  @RequirePermissions('approvalProcess.read')
  async approvalProcesss(
    @GqlCurrentUser() user: RequestUser,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ) {
    const res = await this.approvalService.list(user.tenantId, { skip, take });
    return { data: res.data, total: res.total };
  }

  @Query(() => ApprovalProcess)
  @RequirePermissions('approvalProcess.read')
  async approvalProcess(
    @GqlCurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ) {
    return this.approvalService.get(user.tenantId, id);
  }

  @Mutation(() => ApprovalProcess)
  @RequirePermissions('approvalProcess.write')
  async createApprovalProcess(
    @GqlCurrentUser() user: RequestUser,
    @Args('input') input: CreateApprovalProcessInput,
  ) {
    return this.approvalService.create(user.tenantId, input as any, user);
  }

  @Mutation(() => ApprovalProcess)
  @RequirePermissions('approvalProcess.write')
  async updateApprovalProcess(
    @GqlCurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateApprovalProcessInput,
  ) {
    return this.approvalService.update(user.tenantId, id, input as any, user);
  }

  @Mutation(() => Boolean)
  @RequirePermissions('approvalProcess.delete')
  async deleteApprovalProcess(
    @GqlCurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ) {
    await this.approvalService.softDelete(user.tenantId, id);
    return true;
  }
}
