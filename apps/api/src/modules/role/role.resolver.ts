import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { RoleService } from './role.service';
import { Role } from './role.type';
import { Permission } from './permission.type';
import { CreateRoleInput } from './role.input';
import { GqlCurrentUser } from '../auth/decorators/gql-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';

@Resolver(() => Role)
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RoleResolver {
  constructor(private readonly roles: RoleService) {}

  @Query(() => [Role])
  @RequirePermissions('admin.*')
  async roles(@GqlCurrentUser() authUser: any) {
    return this.roles.list(authUser.tenantId);
  }

  @Query(() => [Permission])
  @RequirePermissions('admin.*')
  async permissions() {
    return this.roles.listPermissions();
  }

  @Mutation(() => Role)
  @RequirePermissions('admin.*')
  async createRole(
    @GqlCurrentUser() authUser: any,
    @Args('input') input: CreateRoleInput,
  ) {
    return this.roles.create(authUser.tenantId, input);
  }

  @Mutation(() => Role)
  @RequirePermissions('admin.*')
  async updateRolePermissions(
    @GqlCurrentUser() authUser: any,
    @Args('id', { type: () => ID }) id: string,
    @Args('permissionCodes', { type: () => [String] }) permissionCodes: string[],
  ) {
    return this.roles.updatePermissions(authUser.tenantId, id, permissionCodes);
  }

  @Mutation(() => Boolean)
  @RequirePermissions('admin.*')
  async deleteRole(
    @GqlCurrentUser() authUser: any,
    @Args('id', { type: () => ID }) id: string,
  ) {
    await this.roles.remove(authUser.tenantId, id);
    return true;
  }
}
