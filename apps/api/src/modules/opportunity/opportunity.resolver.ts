import { Resolver, Query, Mutation, Args, ID, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { OpportunityService } from './opportunity.service';
import { Opportunity, PaginatedOpportunity } from './opportunity.type';
import { CreateOpportunityInput, UpdateOpportunityInput } from './opportunity.input';
import { GqlCurrentUser } from '../auth/decorators/gql-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import type { RequestUser } from '../../common/types/request-context';

@Resolver(() => Opportunity)
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OpportunityResolver {
  constructor(private readonly opportunities: OpportunityService) {}

  @Query(() => PaginatedOpportunity)
  @RequirePermissions('opportunity.read')
  async opportunities(
    @GqlCurrentUser() user: RequestUser,
    @Args('search', { type: () => String, nullable: true }) search?: string,
    @Args('accountId', { type: () => ID, nullable: true }) accountId?: string,
    @Args('ownerId', { type: () => ID, nullable: true }) ownerId?: string,
    @Args('stage', { type: () => String, nullable: true }) stage?: string,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ) {
    const res = await this.opportunities.list(user.tenantId, {
      search,
      accountId,
      ownerId,
      stage,
      skip,
      take,
    });
    return { data: res.data, total: res.total };
  }

  @Query(() => Opportunity)
  @RequirePermissions('opportunity.read')
  async opportunity(
    @GqlCurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ) {
    return this.opportunities.get(user.tenantId, id);
  }

  @Mutation(() => Opportunity)
  @RequirePermissions('opportunity.write')
  async createOpportunity(
    @GqlCurrentUser() user: RequestUser,
    @Args('input') input: CreateOpportunityInput,
  ) {
    return this.opportunities.create(user.tenantId, input as any, user);
  }

  @Mutation(() => Opportunity)
  @RequirePermissions('opportunity.write')
  async updateOpportunity(
    @GqlCurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateOpportunityInput,
  ) {
    return this.opportunities.update(user.tenantId, id, input as any, user);
  }

  @Mutation(() => Boolean)
  @RequirePermissions('opportunity.delete')
  async deleteOpportunity(
    @GqlCurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ) {
    await this.opportunities.softDelete(user.tenantId, id);
    return true;
  }
}
