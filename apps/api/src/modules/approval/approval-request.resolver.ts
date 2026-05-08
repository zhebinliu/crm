import { Resolver, Query, Mutation, Args, ID, Int } from '@nestjs/graphql';
import { BadRequestException, UseGuards } from '@nestjs/common';
import { ApprovalService } from './approval.service';
import { ApprovalRequest, PaginatedApprovalRequest } from './approval-request.type';
import { CreateApprovalRequestInput, UpdateApprovalRequestInput } from './approval-request.input';
import { GqlCurrentUser } from '../auth/decorators/gql-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import type { RequestUser } from '../../common/types/request-context';

// Approval requests have no direct CRUD — they are created via `submit()` and
// finalized via approve/reject/recall. The CRUD-shaped GraphQL surface is a
// scaffold; mutations point at the real submit/recall flow rather than
// inventing new write paths.
@Resolver(() => ApprovalRequest)
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ApprovalRequestResolver {
  constructor(private readonly approvalService: ApprovalService) {}

  @Query(() => PaginatedApprovalRequest)
  @RequirePermissions('approvalRequest.read')
  async approvalRequests(
    @GqlCurrentUser() user: RequestUser,
    @Args('skip', { type: () => Int, nullable: true }) _skip?: number,
    @Args('take', { type: () => Int, nullable: true }) _take?: number,
  ) {
    const data = await this.approvalService.listRequests(user.tenantId);
    return { data, total: data.length };
  }

  @Query(() => ApprovalRequest)
  @RequirePermissions('approvalRequest.read')
  async approvalRequest(
    @GqlCurrentUser() _user: RequestUser,
    @Args('id', { type: () => ID }) _id: string,
  ) {
    // Single-request fetch is not yet exposed on the service; the list query
    // above is the supported path for now.
    throw new BadRequestException({
      code: 'BAD_TRANSITION',
      message: 'approvalRequest(id) is not implemented; use approvalRequests query',
    });
  }

  @Mutation(() => ApprovalRequest)
  @RequirePermissions('approvalRequest.write')
  async createApprovalRequest(
    @GqlCurrentUser() _user: RequestUser,
    @Args('input') _input: CreateApprovalRequestInput,
  ) {
    // Requests are created via the submit() flow on ApprovalService, which
    // requires (objectApiName, recordId). The GraphQL surface for that lives
    // elsewhere; raw create is intentionally not supported.
    throw new BadRequestException({
      code: 'BAD_TRANSITION',
      message: 'Approval requests must be created via submit(objectApiName, recordId)',
    });
  }

  @Mutation(() => ApprovalRequest)
  @RequirePermissions('approvalRequest.write')
  async updateApprovalRequest(
    @GqlCurrentUser() _user: RequestUser,
    @Args('id', { type: () => ID }) _id: string,
    @Args('input') _input: UpdateApprovalRequestInput,
  ) {
    throw new BadRequestException({
      code: 'BAD_TRANSITION',
      message: 'Approval requests are immutable; use approve/reject/recall',
    });
  }

  @Mutation(() => Boolean)
  @RequirePermissions('approvalRequest.delete')
  async deleteApprovalRequest(
    @GqlCurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ) {
    // Closest semantic match for "delete" is recall by submitter.
    await this.approvalService.recall(user.tenantId, user.id, id);
    return true;
  }
}
