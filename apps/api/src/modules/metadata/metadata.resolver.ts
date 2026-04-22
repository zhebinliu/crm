import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { MetadataService } from './metadata.service';
import { ObjectDef, FieldDef, Picklist } from './metadata.type';
import { CreateObjectInput, CreateFieldInput } from './metadata.input';
import { GqlCurrentUser } from '../auth/decorators/gql-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';

@Resolver()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MetadataResolver {
  constructor(private readonly metadata: MetadataService) {}

  @Query(() => [ObjectDef])
  @RequirePermissions('metadata.read')
  async objects(@GqlCurrentUser() authUser: any) {
    return this.metadata.listObjects(authUser.tenantId);
  }

  @Query(() => ObjectDef)
  @RequirePermissions('metadata.read')
  async object(
    @GqlCurrentUser() authUser: any,
    @Args('apiName', { type: () => String }) apiName: string,
  ) {
    return this.metadata.getObject(authUser.tenantId, apiName);
  }

  @Query(() => [FieldDef])
  @RequirePermissions('metadata.read')
  async fields(
    @GqlCurrentUser() authUser: any,
    @Args('objectApiName', { type: () => String }) objectApiName: string,
  ) {
    return this.metadata.listFields(authUser.tenantId, objectApiName);
  }

  @Mutation(() => ObjectDef)
  @RequirePermissions('admin.*')
  async createObject(
    @GqlCurrentUser() authUser: any,
    @Args('input') input: CreateObjectInput,
  ) {
    return this.metadata.createObject(authUser.tenantId, input);
  }

  @Mutation(() => Boolean)
  @RequirePermissions('admin.*')
  async deleteObject(
    @GqlCurrentUser() authUser: any,
    @Args('apiName', { type: () => String }) apiName: string,
  ) {
    await this.metadata.removeObject(authUser.tenantId, apiName);
    return true;
  }

  @Mutation(() => FieldDef)
  @RequirePermissions('admin.*')
  async createField(
    @GqlCurrentUser() authUser: any,
    @Args('objectApiName', { type: () => String }) objectApiName: string,
    @Args('input') input: CreateFieldInput,
  ) {
    return this.metadata.createField(authUser.tenantId, objectApiName, input);
  }

  @Mutation(() => Boolean)
  @RequirePermissions('admin.*')
  async deleteField(
    @GqlCurrentUser() authUser: any,
    @Args('id', { type: () => ID }) id: string,
  ) {
    await this.metadata.removeField(authUser.tenantId, id);
    return true;
  }

  @Query(() => [Picklist])
  @RequirePermissions('metadata.read')
  async picklists(@GqlCurrentUser() authUser: any) {
    return this.metadata.listPicklists(authUser.tenantId);
  }
}
