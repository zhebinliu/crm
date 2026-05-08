import { Resolver, Query, Mutation, Args, ID, Int, ResolveField, Parent, Context } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { OpportunityService } from './opportunity.service';
import { Opportunity, PaginatedOpportunity } from './opportunity.type';
import { CreateOpportunityInput, UpdateOpportunityInput } from './opportunity.input';
import { Account } from '../account/account.type';
import { User } from '../user/user.type';
import { GqlCurrentUser } from '../auth/decorators/gql-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import type { RequestUser } from '../../common/types/request-context';
import type { DataLoaderRegistry } from '../../common/graphql/dataloader.registry';

interface GqlContext {
  loaders?: DataLoaderRegistry;
}

@Resolver(() => Opportunity)
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OpportunityResolver {
  constructor(private readonly opportunitiesService: OpportunityService) {}

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
    const res = await this.opportunitiesService.list(user.tenantId, {
      search,
      accountId,
      ownerId,
      stage,
      skip,
      take,
    }, user);
    return { data: res.data, total: res.total };
  }

  @Query(() => Opportunity)
  @RequirePermissions('opportunity.read')
  async opportunity(
    @GqlCurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ) {
    return this.opportunitiesService.get(user.tenantId, id, user);
  }

  // ── @ResolveField — DataLoader-batched parents (Wave 18f) ────────────
  // List queries returning N opportunities used to fire N findFirst calls
  // for `account`. With the loader, all of them collapse into a single
  // findMany({ where: { id: { in: [...] } }}).

  @ResolveField('account', () => Account, { nullable: true })
  async resolveAccount(
    @Parent() opp: { accountId?: string; account?: unknown },
    @Context() ctx: GqlContext,
  ) {
    if (opp.account) return opp.account;
    if (!opp.accountId || !ctx?.loaders) return null;
    return ctx.loaders.accountById.load(opp.accountId);
  }

  @ResolveField('owner', () => User, { nullable: true })
  async resolveOwner(
    @Parent() opp: { ownerId?: string; owner?: unknown },
    @Context() ctx: GqlContext,
  ) {
    if (opp.owner) return opp.owner;
    if (!opp.ownerId || !ctx?.loaders) return null;
    return ctx.loaders.userById.load(opp.ownerId);
  }

  @Mutation(() => Opportunity)
  @RequirePermissions('opportunity.write')
  async createOpportunity(
    @GqlCurrentUser() user: RequestUser,
    @Args('input') input: CreateOpportunityInput,
  ) {
    return this.opportunitiesService.create(user.tenantId, input as any, user);
  }

  @Mutation(() => Opportunity)
  @RequirePermissions('opportunity.write')
  async updateOpportunity(
    @GqlCurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateOpportunityInput,
  ) {
    return this.opportunitiesService.update(user.tenantId, id, input as any, user);
  }

  @Mutation(() => Boolean)
  @RequirePermissions('opportunity.delete')
  async deleteOpportunity(
    @GqlCurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ) {
    await this.opportunitiesService.softDelete(user.tenantId, id, user);
    return true;
  }
}
