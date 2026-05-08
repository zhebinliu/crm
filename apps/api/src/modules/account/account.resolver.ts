import { Resolver, Query, Mutation, Args, ID, Int, ResolveField, Parent, Context } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { AccountService } from './account.service';
import { Account, PaginatedAccount } from './account.type';
import { CreateAccountInput, UpdateAccountInput } from './account.input';
import { User } from '../user/user.type';
import { GqlCurrentUser } from '../auth/decorators/gql-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import type { RequestUser } from '../../common/types/request-context';
import type { DataLoaderRegistry } from '../../common/graphql/dataloader.registry';

// Wave 18f: GraphQL context shape for DataLoader-aware resolvers.
interface GqlContext {
  loaders?: DataLoaderRegistry;
}

@Resolver(() => Account)
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AccountResolver {
  constructor(private readonly accountsService: AccountService) {}

  @Query(() => PaginatedAccount)
  @RequirePermissions('account.read')
  async accounts(
    @GqlCurrentUser() user: RequestUser,
    @Args('search', { type: () => String, nullable: true }) search?: string,
    @Args('type', { type: () => String, nullable: true }) type?: string,
    @Args('industry', { type: () => String, nullable: true }) industry?: string,
    @Args('ownerId', { type: () => ID, nullable: true }) ownerId?: string,
    @Args('parentId', { type: () => ID, nullable: true }) parentId?: string,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ) {
    const res = await this.accountsService.list(user.tenantId, {
      search,
      type,
      industry,
      ownerId,
      parentId,
      skip,
      take,
    } as any, user);
    return { data: res.data, total: res.total };
  }

  @Query(() => Account)
  @RequirePermissions('account.read')
  async account(
    @GqlCurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Context() ctx: GqlContext,
  ) {
    // Wave 18f: prefer DataLoader if a per-request registry is in context
    // — collapses Account.account + nested account references into a
    // single batched findMany. Fall back to the service path if the
    // GraphQL context wasn't built with a registry.
    if (ctx?.loaders) {
      const row = await ctx.loaders.accountById.load(id);
      if (row) return row;
    }
    return this.accountsService.get(user.tenantId, id, user);
  }

  // ── @ResolveField — DataLoader-batched relations ─────────────────────
  // Wave 18f: replaces what would otherwise be a per-row prisma fetch.
  // `owner` was always resolved by Prisma's `include` — switching to a
  // DataLoader path lets us short-circuit when the user wasn't included.

  @ResolveField('owner', () => User, { nullable: true })
  async resolveOwner(
    @Parent() account: { ownerId: string; owner?: unknown },
    @Context() ctx: GqlContext,
  ) {
    // If service-layer already eager-loaded `owner`, use it.
    if (account.owner) return account.owner;
    if (!account.ownerId || !ctx?.loaders) return null;
    return ctx.loaders.userById.load(account.ownerId);
  }

  @Mutation(() => Account)
  @RequirePermissions('account.write')
  async createAccount(
    @GqlCurrentUser() user: RequestUser,
    @Args('input') input: CreateAccountInput,
  ) {
    return this.accountsService.create(user.tenantId, input as any, user);
  }

  @Mutation(() => Account)
  @RequirePermissions('account.write')
  async updateAccount(
    @GqlCurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateAccountInput,
  ) {
    return this.accountsService.update(user.tenantId, id, input as any, user);
  }

  @Mutation(() => Boolean)
  @RequirePermissions('account.delete')
  async deleteAccount(
    @GqlCurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ) {
    await this.accountsService.softDelete(user.tenantId, id, user);
    return true;
  }
}
