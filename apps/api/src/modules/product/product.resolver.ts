import { Resolver, Query, Mutation, Args, ID, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { ProductService } from './product.service';
import { Product, PaginatedProduct } from './product.type';
import { CreateProductInput, UpdateProductInput } from './product.input';
import { GqlCurrentUser } from '../auth/decorators/gql-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import type { RequestUser } from '../../common/types/request-context';

@Resolver(() => Product)
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProductResolver {
  constructor(private readonly service: ProductService) {}

  @Query(() => PaginatedProduct)
  @RequirePermissions('product.read')
  async products(
    @GqlCurrentUser() user: RequestUser,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ) {
    const res = await this.service.list(user.tenantId, { skip, take });
    return { data: res.data, total: res.total };
  }

  @Query(() => Product)
  @RequirePermissions('product.read')
  async product(
    @GqlCurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ) {
    return this.service.get(user.tenantId, id);
  }

  @Mutation(() => Product)
  @RequirePermissions('product.write')
  async createProduct(
    @GqlCurrentUser() user: RequestUser,
    @Args('input') input: CreateProductInput,
  ) {
    return this.service.create(user.tenantId, input as any, user);
  }

  @Mutation(() => Product)
  @RequirePermissions('product.write')
  async updateProduct(
    @GqlCurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateProductInput,
  ) {
    return this.service.update(user.tenantId, id, input as any, user);
  }

  @Mutation(() => Boolean)
  @RequirePermissions('product.delete')
  async deleteProduct(
    @GqlCurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ) {
    await this.service.softDelete(user.tenantId, id);
    return true;
  }
}
