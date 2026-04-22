import { Resolver, Query, Mutation, Args, ID, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { OrderService } from './order.service';
import { Order, PaginatedOrder } from './order.type';
import { CreateOrderInput, UpdateOrderInput } from './order.input';
import { GqlCurrentUser } from '../auth/decorators/gql-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import type { RequestUser } from '../../common/types/request-context';

@Resolver(() => Order)
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OrderResolver {
  constructor(private readonly service: OrderService) {}

  @Query(() => PaginatedOrder)
  @RequirePermissions('order.read')
  async orders(
    @GqlCurrentUser() user: RequestUser,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ) {
    const res = await this.service.list(user.tenantId, { skip, take });
    return { data: res.data, total: res.total };
  }

  @Query(() => Order)
  @RequirePermissions('order.read')
  async order(
    @GqlCurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ) {
    return this.service.get(user.tenantId, id);
  }

  @Mutation(() => Order)
  @RequirePermissions('order.write')
  async createOrder(
    @GqlCurrentUser() user: RequestUser,
    @Args('input') input: CreateOrderInput,
  ) {
    return this.service.create(user.tenantId, input as any, user);
  }

  @Mutation(() => Order)
  @RequirePermissions('order.write')
  async updateOrder(
    @GqlCurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateOrderInput,
  ) {
    return this.service.update(user.tenantId, id, input as any, user);
  }

  @Mutation(() => Boolean)
  @RequirePermissions('order.delete')
  async deleteOrder(
    @GqlCurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ) {
    await this.service.softDelete(user.tenantId, id);
    return true;
  }
}
