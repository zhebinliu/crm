import { Resolver, Query, Mutation, Args, ID, Int } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';
import { UseGuards } from '@nestjs/common';
import { LeadService } from './lead.service';
import { Lead, PaginatedLead } from './lead.type';
import { CreateLeadInput, UpdateLeadInput, ConvertLeadInput } from './lead.input';
import { GqlCurrentUser } from '../auth/decorators/gql-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import type { RequestUser } from '../../common/types/request-context';

@Resolver(() => Lead)
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LeadResolver {
  constructor(private readonly leads: LeadService) {}

  @Query(() => PaginatedLead)
  @RequirePermissions('lead.read')
  async leads(
    @GqlCurrentUser() user: RequestUser,
    @Args('search', { type: () => String, nullable: true }) search?: string,
    @Args('status', { type: () => String, nullable: true }) status?: string,
    @Args('ownerId', { type: () => ID, nullable: true }) ownerId?: string,
    @Args('isConverted', { type: () => Boolean, nullable: true }) isConverted?: boolean,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ) {
    const res = await this.leads.list(user.tenantId, {
      search,
      status,
      ownerId,
      isConverted,
      skip,
      take,
    });
    return { data: res.data, total: res.total };
  }

  @Query(() => Lead)
  @RequirePermissions('lead.read')
  async lead(
    @GqlCurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ) {
    return this.leads.get(user.tenantId, id);
  }

  @Mutation(() => Lead)
  @RequirePermissions('lead.write')
  async createLead(
    @GqlCurrentUser() user: RequestUser,
    @Args('input') input: CreateLeadInput,
  ) {
    return this.leads.create(user.tenantId, input as any, user);
  }

  @Mutation(() => Lead)
  @RequirePermissions('lead.write')
  async updateLead(
    @GqlCurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateLeadInput,
  ) {
    return this.leads.update(user.tenantId, id, input as any, user);
  }

  @Mutation(() => Boolean)
  @RequirePermissions('lead.delete')
  async deleteLead(
    @GqlCurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ) {
    await this.leads.softDelete(user.tenantId, id);
    return true;
  }

  @Mutation(() => GraphQLJSON, { name: 'convertLead' })
  @RequirePermissions('lead.convert')
  async convertLead(
    @GqlCurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: ConvertLeadInput,
  ) {
    return this.leads.convert(user.tenantId, id, input, user);
  }
}
