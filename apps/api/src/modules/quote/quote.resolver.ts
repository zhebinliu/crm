import { Resolver, Query, Mutation, Args, ID, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { QuoteService } from './quote.service';
import { Quote, PaginatedQuote } from './quote.type';
import { CreateQuoteInput, UpdateQuoteInput } from './quote.input';
import { GqlCurrentUser } from '../auth/decorators/gql-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import type { RequestUser } from '../../common/types/request-context';

@Resolver(() => Quote)
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class QuoteResolver {
  constructor(private readonly service: QuoteService) {}

  @Query(() => PaginatedQuote)
  @RequirePermissions('quote.read')
  async quotes(
    @GqlCurrentUser() user: RequestUser,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ) {
    const res = await this.service.list(user.tenantId, { skip, take });
    return { data: res.data, total: res.total };
  }

  @Query(() => Quote)
  @RequirePermissions('quote.read')
  async quote(
    @GqlCurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ) {
    return this.service.get(user.tenantId, id);
  }

  @Mutation(() => Quote)
  @RequirePermissions('quote.write')
  async createQuote(
    @GqlCurrentUser() user: RequestUser,
    @Args('input') input: CreateQuoteInput,
  ) {
    return this.service.create(user.tenantId, input as any, user);
  }

  @Mutation(() => Quote)
  @RequirePermissions('quote.write')
  async updateQuote(
    @GqlCurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateQuoteInput,
  ) {
    return this.service.update(user.tenantId, id, input as any, user);
  }

  @Mutation(() => Boolean)
  @RequirePermissions('quote.delete')
  async deleteQuote(
    @GqlCurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ) {
    await this.service.softDelete(user.tenantId, id);
    return true;
  }
}
