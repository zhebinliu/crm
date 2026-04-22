import { Resolver, Query, Mutation, Args, ID, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { PriceBookService } from './pricebook.service';
import { PriceBook, PaginatedPriceBook } from './pricebook.type';
import { CreatePriceBookInput, UpdatePriceBookInput } from './pricebook.input';
import { GqlCurrentUser } from '../auth/decorators/gql-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import type { RequestUser } from '../../common/types/request-context';

@Resolver(() => PriceBook)
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PriceBookResolver {
  constructor(private readonly service: PriceBookService) {}

  @Query(() => PaginatedPriceBook)
  @RequirePermissions('pricebook.read')
  async pricebooks(
    @GqlCurrentUser() user: RequestUser,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ) {
    const res = await this.service.list(user.tenantId, { skip, take });
    return { data: res.data, total: res.total };
  }

  @Query(() => PriceBook)
  @RequirePermissions('pricebook.read')
  async pricebook(
    @GqlCurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ) {
    return this.service.get(user.tenantId, id);
  }

  @Mutation(() => PriceBook)
  @RequirePermissions('pricebook.write')
  async createPriceBook(
    @GqlCurrentUser() user: RequestUser,
    @Args('input') input: CreatePriceBookInput,
  ) {
    return this.service.create(user.tenantId, input as any, user);
  }

  @Mutation(() => PriceBook)
  @RequirePermissions('pricebook.write')
  async updatePriceBook(
    @GqlCurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdatePriceBookInput,
  ) {
    return this.service.update(user.tenantId, id, input as any, user);
  }

  @Mutation(() => Boolean)
  @RequirePermissions('pricebook.delete')
  async deletePriceBook(
    @GqlCurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ) {
    await this.service.softDelete(user.tenantId, id);
    return true;
  }
}
