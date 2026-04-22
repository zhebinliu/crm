import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { UserService } from './user.service';
import { User, PaginatedUser } from './user.type';
import { CreateUserInput, UpdateUserInput } from './user.input';
import { GqlCurrentUser } from '../auth/decorators/gql-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';

@Resolver(() => User)
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UserResolver {
  constructor(private readonly users: UserService) {}

  @Query(() => PaginatedUser)
  @RequirePermissions('user.read')
  async users(
    @GqlCurrentUser() authUser: any,
    @Args('search', { type: () => String, nullable: true }) search?: string,
    @Args('isActive', { type: () => Boolean, nullable: true }) isActive?: boolean,
  ) {
    const listInfo = await this.users.list(authUser.tenantId, { search, isActive });
    return { data: listInfo.data, total: listInfo.total };
  }

  @Query(() => User)
  @RequirePermissions('user.read')
  async user(
    @GqlCurrentUser() authUser: any,
    @Args('id', { type: () => ID }) id: string,
  ) {
    return this.users.get(authUser.tenantId, id);
  }

  @Mutation(() => User)
  @RequirePermissions('admin.*')
  async createUser(
    @GqlCurrentUser() authUser: any,
    @Args('input') input: CreateUserInput,
  ) {
    return this.users.create(authUser.tenantId, input);
  }

  @Mutation(() => User)
  @RequirePermissions('admin.*')
  async updateUser(
    @GqlCurrentUser() authUser: any,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateUserInput,
  ) {
    return this.users.update(authUser.tenantId, id, input);
  }

  @Mutation(() => Boolean)
  @RequirePermissions('admin.*')
  async deleteUser(
    @GqlCurrentUser() authUser: any,
    @Args('id', { type: () => ID }) id: string,
  ) {
    await this.users.softDelete(authUser.tenantId, id);
    return true;
  }
}
