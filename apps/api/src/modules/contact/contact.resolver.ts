import { Resolver, Query, Mutation, Args, ID, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { ContactService } from './contact.service';
import { Contact, PaginatedContact } from './contact.type';
import { CreateContactInput, UpdateContactInput } from './contact.input';
import { GqlCurrentUser } from '../auth/decorators/gql-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import type { RequestUser } from '../../common/types/request-context';

@Resolver(() => Contact)
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ContactResolver {
  constructor(private readonly contacts: ContactService) {}

  @Query(() => PaginatedContact)
  @RequirePermissions('contact.read')
  async contacts(
    @GqlCurrentUser() user: RequestUser,
    @Args('search', { type: () => String, nullable: true }) search?: string,
    @Args('accountId', { type: () => ID, nullable: true }) accountId?: string,
    @Args('ownerId', { type: () => ID, nullable: true }) ownerId?: string,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ) {
    const res = await this.contacts.list(user.tenantId, {
      search,
      accountId,
      ownerId,
      skip,
      take,
    });
    return { data: res.data, total: res.total };
  }

  @Query(() => Contact)
  @RequirePermissions('contact.read')
  async contact(
    @GqlCurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ) {
    return this.contacts.get(user.tenantId, id);
  }

  @Mutation(() => Contact)
  @RequirePermissions('contact.write')
  async createContact(
    @GqlCurrentUser() user: RequestUser,
    @Args('input') input: CreateContactInput,
  ) {
    return this.contacts.create(user.tenantId, input as any, user);
  }

  @Mutation(() => Contact)
  @RequirePermissions('contact.write')
  async updateContact(
    @GqlCurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateContactInput,
  ) {
    return this.contacts.update(user.tenantId, id, input as any, user);
  }

  @Mutation(() => Boolean)
  @RequirePermissions('contact.delete')
  async deleteContact(
    @GqlCurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ) {
    await this.contacts.softDelete(user.tenantId, id);
    return true;
  }
}
