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
  constructor(private readonly usersService: UserService) {}

  @Query(() => PaginatedUser)
  @RequirePermissions('user.read')
  async users(
    @GqlCurrentUser() authUser: any,
    @Args('search', { type: () => String, nullable: true }) search?: string,
    @Args('isActive', { type: () => Boolean, nullable: true }) isActive?: boolean,
  ) {
    const data = await this.usersService.list(authUser.tenantId, { search, isActive });
    return { data, total: data.length };
  }

  @Query(() => User)
  @RequirePermissions('user.read')
  async user(
    @GqlCurrentUser() authUser: any,
    @Args('id', { type: () => ID }) id: string,
  ) {
    return this.usersService.get(authUser.tenantId, id);
  }

  @Mutation(() => User)
  @RequirePermissions('admin.*')
  async createUser(
    @GqlCurrentUser() authUser: any,
    @Args('input') input: CreateUserInput,
  ) {
    return this.usersService.create(authUser.tenantId, input);
  }

  @Mutation(() => User)
  @RequirePermissions('admin.*')
  async updateUser(
    @GqlCurrentUser() authUser: any,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateUserInput,
  ) {
    return this.usersService.update(authUser.tenantId, id, input);
  }

  @Mutation(() => Boolean)
  @RequirePermissions('admin.*')
  async deleteUser(
    @GqlCurrentUser() authUser: any,
    @Args('id', { type: () => ID }) id: string,
  ) {
    await this.usersService.softDelete(authUser.tenantId, id);
    return true;
  }
}
