import { Resolver, Query, Mutation, Args, ID, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { AccountService } from './account.service';
import { Account, PaginatedAccount } from './account.type';
import { CreateAccountInput, UpdateAccountInput } from './account.input';
import { GqlCurrentUser } from '../auth/decorators/gql-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import type { RequestUser } from '../../common/types/request-context';

@Resolver(() => Account)
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AccountResolver {
  constructor(private readonly accounts: AccountService) {}

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
    const res = await this.accounts.list(user.tenantId, {
      search,
      type,
      industry,
      ownerId,
      parentId,
      skip,
      take,
    });
    return { data: res.data, total: res.total };
  }

  @Query(() => Account)
  @RequirePermissions('account.read')
  async account(
    @GqlCurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ) {
    return this.accounts.get(user.tenantId, id);
  }

  @Mutation(() => Account)
  @RequirePermissions('account.write')
  async createAccount(
    @GqlCurrentUser() user: RequestUser,
    @Args('input') input: CreateAccountInput,
  ) {
    return this.accounts.create(user.tenantId, input as any, user);
  }

  @Mutation(() => Account)
  @RequirePermissions('account.write')
  async updateAccount(
    @GqlCurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateAccountInput,
  ) {
    return this.accounts.update(user.tenantId, id, input as any, user);
  }

  @Mutation(() => Boolean)
  @RequirePermissions('account.delete')
  async deleteAccount(
    @GqlCurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ) {
    await this.accounts.softDelete(user.tenantId, id);
    return true;
  }
}
