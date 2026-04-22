import { Resolver, Query, Mutation, Args, ID, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { WorkflowService } from './workflow.service';
import { WorkflowRule, PaginatedWorkflowRule } from './workflow-rule.type';
import { CreateWorkflowRuleInput, UpdateWorkflowRuleInput } from './workflow-rule.input';
import { GqlCurrentUser } from '../auth/decorators/gql-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import type { RequestUser } from '../../common/types/request-context';

@Resolver(() => WorkflowRule)
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WorkflowRuleResolver {
  constructor(private readonly workflowService: WorkflowService) {}

  @Query(() => PaginatedWorkflowRule)
  @RequirePermissions('workflowRule.read')
  async workflowRules(
    @GqlCurrentUser() user: RequestUser,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ) {
    const res = await this.workflowService.list(user.tenantId, { skip, take });
    return { data: res.data, total: res.total };
  }

  @Query(() => WorkflowRule)
  @RequirePermissions('workflowRule.read')
  async workflowRule(
    @GqlCurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ) {
    return this.workflowService.get(user.tenantId, id);
  }

  @Mutation(() => WorkflowRule)
  @RequirePermissions('workflowRule.write')
  async createWorkflowRule(
    @GqlCurrentUser() user: RequestUser,
    @Args('input') input: CreateWorkflowRuleInput,
  ) {
    return this.workflowService.create(user.tenantId, input as any, user);
  }

  @Mutation(() => WorkflowRule)
  @RequirePermissions('workflowRule.write')
  async updateWorkflowRule(
    @GqlCurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateWorkflowRuleInput,
  ) {
    return this.workflowService.update(user.tenantId, id, input as any, user);
  }

  @Mutation(() => Boolean)
  @RequirePermissions('workflowRule.delete')
  async deleteWorkflowRule(
    @GqlCurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ) {
    await this.workflowService.softDelete(user.tenantId, id);
    return true;
  }
}
