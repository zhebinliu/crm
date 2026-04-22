import { Resolver, Query, Mutation, Args, ID, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { ActivityService } from './activity.service';
import { Activity, PaginatedActivity } from './activity.type';
import { CreateActivityInput, UpdateActivityInput } from './activity.input';
import { GqlCurrentUser } from '../auth/decorators/gql-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import type { RequestUser } from '../../common/types/request-context';

@Resolver(() => Activity)
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ActivityResolver {
  constructor(private readonly activities: ActivityService) {}

  @Query(() => PaginatedActivity)
  @RequirePermissions('activity.read')
  async activities(
    @GqlCurrentUser() user: RequestUser,
    @Args('search', { type: () => String, nullable: true }) search?: string,
    @Args('type', { type: () => String, nullable: true }) type?: string,
    @Args('status', { type: () => String, nullable: true }) status?: string,
    @Args('ownerId', { type: () => ID, nullable: true }) ownerId?: string,
    @Args('targetType', { type: () => String, nullable: true }) targetType?: string,
    @Args('targetId', { type: () => ID, nullable: true }) targetId?: string,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ) {
    const res = await this.activities.list(user.tenantId, {
      search,
      type,
      status,
      ownerId,
      targetType,
      targetId,
      skip,
      take,
    });
    return { data: res.data, total: res.total };
  }

  @Query(() => Activity)
  @RequirePermissions('activity.read')
  async activity(
    @GqlCurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ) {
    return this.activities.get(user.tenantId, id);
  }

  @Mutation(() => Activity)
  @RequirePermissions('activity.write')
  async createActivity(
    @GqlCurrentUser() user: RequestUser,
    @Args('input') input: CreateActivityInput,
  ) {
    return this.activities.create(user.tenantId, input as any, user);
  }

  @Mutation(() => Activity)
  @RequirePermissions('activity.write')
  async updateActivity(
    @GqlCurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateActivityInput,
  ) {
    return this.activities.update(user.tenantId, id, input as any, user);
  }

  @Mutation(() => Boolean)
  @RequirePermissions('activity.write')
  async completeActivity(
    @GqlCurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ) {
    await this.activities.complete(user.tenantId, id, user);
    return true;
  }

  @Mutation(() => Boolean)
  @RequirePermissions('activity.delete')
  async deleteActivity(
    @GqlCurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ) {
    await this.activities.softDelete(user.tenantId, id);
    return true;
  }
}
